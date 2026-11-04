import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInvoice, calculatePriceReferences } from '../lib/calculations.ts';
import type { InvoiceInput, InvoiceLine } from '../lib/calculations.ts';

const line = (overrides: Partial<InvoiceLine> = {}): InvoiceLine => ({
  id: 'one', productId: 'product', description: 'Producto de prueba', quantity: '1',
  unitsPerPack: '1', bonusQuantity: '', unitPrice: '1', discountPercent: '',
  discountAmount: '', taxRate: '0', otherTax: '', lineTotal: '', taxAmount: '',
  promotion: false, ...overrides,
});
const invoice = (overrides: Partial<InvoiceInput> = {}): InvoiceInput => ({
  kind: 'invoice', supplier: 'Proveedor', number: '001', date: '2026-08-15',
  seller: '', relatedId: '', discount: '', rounding: 'line', taxTotal: '0',
  total: '1.00', lines: [line()], notes: '', ...overrides,
});

test('exact decimal: ten units of 0.10 equal one dollar', () => {
  const result = validateInvoice(invoice({ lines: [line({ quantity: '10', unitPrice: '0.10' })] }));
  assert.equal(result.valid, true);
  assert.equal(result.total, '1.00');
  assert.equal(result.lines[0].unitCost, '0.100000');
});
test('Roguizam: printed IVA reproduced by line rounding, not a hidden one-cent tolerance', () => {
  const source = invoice({ total: '5.90', taxTotal: '0.78', lines: [
    line({ quantity: '5', unitPrice: '0.86', discountAmount: '0.92', taxRate: '15', lineTotal: '3.38' }),
    ...['two', 'three', 'four'].map(id => line({ id, quantity: '2', unitPrice: '0.29', taxRate: '15', lineTotal: '0.58' })),
  ] });
  assert.equal(validateInvoice(source).valid, true);
  const global = validateInvoice({ ...source, rounding: 'total' });
  assert.equal(global.tax, '0.77');
  assert.equal(global.valid, false);
  assert.ok(global.errors.some(error => error.includes('IVA impreso')));
});
test('Danec: both printed product amounts, unit discounts, mixed IVA and final 6.85 reconcile', () => {
  // Unit discounts are 0.0164 × 25 = 0.4100 and 0.1222 × 12 = 1.4664.
  // discountAmount stores the currency-rounded whole-line discount, not the unit discount.
  const source = invoice({ supplier: 'Industrial Danec', total: '6.85', taxTotal: '0.35', lines: [
    line({ id: 'cloro', quantity: '25', unitPrice: '0.1095', discountAmount: '0.41', taxRate: '15', lineTotal: '2.33', taxAmount: '0.35' }),
    line({ id: 'soparic', quantity: '12', unitPrice: '0.4700', discountAmount: '1.47', taxRate: '0', lineTotal: '4.17', taxAmount: '0' }),
  ] });
  const result = validateInvoice(source);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.subtotal, '6.50');
  assert.equal(result.tax, '0.35');
  assert.deepEqual(result.lines.map(item => item.net), ['2.33', '4.17']);
  // The printed 1.88 discount is already inside the product amounts.
  assert.equal(validateInvoice({ ...source, discount: '1.88' }).valid, false);
});
test('Ales complete: 13.26 less line discounts 2.62, net 10.64, grouped IVA 1.60, total 12.24', () => {
  const source = invoice({ supplier: 'Industrias Ales', rounding: 'total', taxTotal: '1.60', total: '12.24', lines: [
    ...['suave', 'limpieza', 'comezon'].map(id => line({ id, unitPrice: '2.61', taxRate: '15', lineTotal: '2.61' })),
    line({ id: 'jabon', quantity: '6', unitPrice: '0.47', discountPercent: '1.50', taxRate: '15', lineTotal: '2.78' }),
    line({ id: 'miel', unitPrice: '2.61', discountPercent: '99', taxRate: '15', lineTotal: '0.03' }),
  ] });
  const result = validateInvoice(source);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.subtotal, '10.64');
  assert.equal(result.tax, '1.60');
  assert.equal(result.total, '12.24');
  const perLine = validateInvoice({ ...source, rounding: 'line' });
  assert.equal(perLine.tax, '1.59');
  assert.equal(perLine.valid, false);
  assert.equal(validateInvoice({ ...source, discount: '2.62' }).valid, false);
});
test('Ales: use full discount precision rather than rounded unit price', () => {
  const result = validateInvoice(invoice({ lines: [line({ quantity: '6', unitPrice: '0.47', discountPercent: '1.5', taxRate: '15', lineTotal: '2.78' })], taxTotal: '0.42', total: '3.20' }));
  assert.equal(result.valid, true);
  assert.equal(result.subtotal, '2.78');
  assert.equal(result.lines[0].unitCost, '0.533333');
});
test('Ales: 99% is a valid discount and does not become zero', () => {
  const result = validateInvoice(invoice({ lines: [line({ unitPrice: '2.61', discountPercent: '99', lineTotal: '0.03' })], total: '0.03' }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].net, '0.03');
  assert.equal(result.lines[0].unitCost, '0.030000');
  assert.ok(result.warnings.length);
});
test('same-product bonus reduces paid-per-unit cost using actual received units', () => {
  const result = validateInvoice(invoice({ lines: [line({ quantity: '1', unitPrice: '12', unitsPerPack: '12', bonusQuantity: '2' })], total: '12' }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].unitCost, '0.857143');
});
test('different-product promotion leaves cost pending, not free replacement stock', () => {
  const result = validateInvoice(invoice({ lines: [line({ unitPrice: '0', promotion: true })], total: '0' }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].unitCost, null);
});
test('zero without a promotion is never published as a normal confirmed cost', () => {
  const result = validateInvoice(invoice({ lines: [line({ unitPrice: '0' })], total: '0' }));
  assert.equal(result.lines[0].unitCost, null);
  assert.ok(result.warnings.some(warning => warning.includes('importe cero')));
});
test('unknown conversion and IVA block invoice confirmation; explicit IVA 0 does not', () => {
  assert.equal(validateInvoice(invoice({ lines: [line({ unitsPerPack: '' })] })).valid, false);
  assert.equal(validateInvoice(invoice({ lines: [line({ taxRate: '' })] })).valid, false);
  assert.equal(validateInvoice(invoice()).valid, true);
});
test('order with absent IVA can match partially, but never gains a confirmed unit cost', () => {
  const result = validateInvoice(invoice({ kind: 'order', number: '', taxTotal: '', lines: [line({ taxRate: '' })] }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].unitCost, null);
  assert.ok(result.warnings.some(warning => warning.includes('Cuadre parcial')));
});
test('unknown IVA in an order is not inferred from printed gross or tax aggregate', () => {
  const source = invoice({ kind: 'order', taxTotal: '', total: '1.15', lines: [line({ taxRate: '' })] });
  const unknown = validateInvoice(source);
  assert.equal(unknown.valid, false);
  assert.equal(unknown.tax, '0.00');
  assert.equal(unknown.total, '1.00');
  assert.equal(unknown.lines[0].unitCost, null);
  const aggregateOnly = validateInvoice({ ...source, taxTotal: '0.15' });
  assert.equal(aggregateOnly.valid, false);
  assert.equal(aggregateOnly.tax, '0.00');
  const explicit = validateInvoice({ ...source, taxTotal: '0.15', lines: [line({ taxRate: '15' })] });
  assert.equal(explicit.valid, true);
  assert.equal(explicit.total, '1.15');
  assert.equal(explicit.lines[0].unitCost, null);
});
test('total by IVA groups: discounts preserve cents and mixed bases', () => {
  const result = validateInvoice(invoice({ discount: '0.01', rounding: 'total', taxTotal: '0.20', total: '3.19', lines: [
    line({ id: 'a', taxRate: '10' }), line({ id: 'b', taxRate: '10' }), line({ id: 'c', taxRate: '0' }),
  ] }));
  assert.equal(result.valid, true);
  assert.equal(result.lines.map(item => item.net).join(','), '0.99,1.00,1.00');
  assert.equal(result.subtotal, '2.99');
});
test('global discounts cannot exceed base or silently apply the printed discount twice', () => {
  assert.equal(validateInvoice(invoice({ discount: '1.01' })).valid, false);
  const result = validateInvoice(invoice({ lines: [line({ unitPrice: '2', discountAmount: '1', lineTotal: '1' })], discount: '1' }));
  assert.equal(result.valid, false);
  assert.equal(result.total, '0.00');
});
test('printed net, printed tax, and final total are checked separately', () => {
  assert.equal(validateInvoice(invoice({ lines: [line({ lineTotal: '1.01' })] })).valid, false);
  assert.equal(validateInvoice(invoice({ lines: [line({ taxAmount: '0.01' })] })).valid, false);
  assert.equal(validateInvoice(invoice({ total: '1.01' })).valid, false);
});
test('other tax is explicit money and included only once', () => {
  const result = validateInvoice(invoice({ lines: [line({ otherTax: '0.08', otherTaxInBase: false })], total: '1.08' }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].gross, '1.08');
});
test('ICE-like charge may enter IVA base only by explicit decision', () => {
  const taxable = validateInvoice(invoice({ lines: [line({ otherTax: '0.08', otherTaxInBase: true, taxRate: '15' })], taxTotal: '0.16', total: '1.24' }));
  assert.equal(taxable.valid, true);
  assert.equal(taxable.subtotal, '1.00');
  assert.equal(taxable.lines[0].gross, '1.24');
  const outside = validateInvoice(invoice({ lines: [line({ otherTax: '0.08', otherTaxInBase: false, taxRate: '15' })], taxTotal: '0.15', total: '1.23' }));
  assert.equal(outside.valid, true);
  const unknown = validateInvoice(invoice({ lines: [line({ otherTax: '0.08', taxRate: '15' })], taxTotal: '0.15', total: '1.23' }));
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some(error => error.includes('integra la base')));
  const grouped = validateInvoice(invoice({ rounding: 'total', lines: [line({ otherTax: '0.08', otherTaxInBase: true, taxRate: '15' })], taxTotal: '0.16', total: '1.24' }));
  assert.equal(grouped.valid, true);
});
test('global discount with mixed IVA and explicit charge bases reconciles net, tax and gross separately', () => {
  const source = invoice({ discount: '3', rounding: 'total', total: '31.50', taxTotal: '1.50', lines: [
    line({ id: 'taxed', unitPrice: '10', taxRate: '15', otherTax: '1', otherTaxInBase: true }),
    line({ id: 'zero', unitPrice: '20', taxRate: '0', otherTax: '2', otherTaxInBase: false }),
  ] });
  const result = validateInvoice(source);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.subtotal, '27.00');
  assert.equal(result.tax, '1.50');
  assert.deepEqual(result.lines.map(item => item.gross), ['11.50', '20.00']);
  assert.equal(result.total, '31.50');
});
test('grouped IVA allocates its cent using charge-inclusive bases after the global discount', () => {
  const result = validateInvoice(invoice({ discount: '0.01', rounding: 'total', taxTotal: '0.01', total: '0.08', lines: [
    line({ id: 'a', unitPrice: '0.03', taxRate: '15', otherTax: '0.01', otherTaxInBase: true }),
    line({ id: 'b', unitPrice: '0.03', taxRate: '15', otherTax: '0.01', otherTaxInBase: true }),
  ] }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.lines.map(item => item.net), ['0.02', '0.03']);
  assert.deepEqual(result.lines.map(item => item.tax), ['0.00', '0.01']);
  assert.deepEqual(result.lines.map(item => item.gross), ['0.03', '0.05']);
});
test('comma decimals are accepted while exponent, signs, non-finite and grouping are rejected', () => {
  assert.equal(validateInvoice(invoice({ lines: [line({ unitPrice: '1,00' })] })).valid, true);
  for (const value of ['1e0', '-1', '+1', 'NaN', 'Infinity', '1,000.00', ' 1', '.5', '0.0000001', '1000000000']) {
    const result = validateInvoice(invoice({ lines: [line({ unitPrice: value })] }));
    assert.equal(result.valid, false, value);
  }
});
test('arbitrary line count, duplicate IDs, invalid dates, zeros and excess discount fail safely', () => {
  const bad: Partial<InvoiceInput>[] = [
    { lines: [] }, { lines: Array.from({ length: 201 }, (_, i) => line({ id: String(i) })) },
    { lines: [line(), line()] }, { date: '2026-02-29' }, { date: '2026-13-01' },
    { lines: [line({ quantity: '0' })] }, { lines: [line({ unitsPerPack: '0' })] },
    { lines: [line({ discountPercent: '101' })] }, { lines: [line({ taxRate: '101' })] },
    { lines: [line({ discountAmount: '2' })] }, { taxTotal: '' }, { total: '' }, { supplier: '' },
  ];
  for (const input of bad) assert.equal(validateInvoice(invoice(input)).valid, false, JSON.stringify(input));
});
test('missing and hostile values do not throw', () => {
  assert.equal(validateInvoice(null as unknown as InvoiceInput).valid, false);
  assert.equal(validateInvoice({ lines: [null] } as unknown as InvoiceInput).valid, false);
  assert.equal(validateInvoice(invoice({ lines: [line({ quantity: 1 as unknown as string })] })).valid, false);
});
test('aggregate total has a ceiling even if individual line inputs fit', () => {
  const result = validateInvoice(invoice({ lines: [line({ quantity: '999999999', unitPrice: '999999999' })], total: '1' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('máximo')));
});
test('unit costs preserve six decimals and no selling price is required', () => {
  const result = validateInvoice(invoice({ lines: [line({ unitsPerPack: '3' })] }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].unitCost, '0.333333');
});
test('invoice must link catalog product, while commercial records keep provisional costs separate', () => {
  const result = validateInvoice(invoice({ lines: [line({ productId: '' })] }));
  assert.equal(result.valid, false);
  assert.equal(result.lines[0].unitCost, null);
  const commercial = validateInvoice(invoice({ kind: 'delivery', lines: [line({ productId: '' })] }));
  assert.equal(commercial.valid, true);
  assert.equal(commercial.lines[0].unitCost, null);
});
test('tiny or implausibly huge unit cost remains pending instead of being published as zero', () => {
  const tiny = validateInvoice(invoice({ lines: [line({ unitsPerPack: '999999999', unitPrice: '0.01' })], total: '0.01' }));
  assert.equal(tiny.lines[0].unitCost, null);
  assert.ok(tiny.warnings.some(warning => warning.includes('precisión')));
  const huge = validateInvoice(invoice({ lines: [line({ unitsPerPack: '0.000001', unitPrice: '999999999' })], total: '999999999' }));
  assert.equal(huge.valid, false);
  assert.equal(huge.lines[0].unitCost, null);
});
test('200-line invoice keeps all discount cents and total without cumulative floating error', () => {
  const result = validateInvoice(invoice({
    lines: Array.from({ length: 200 }, (_, index) => line({ id: String(index), quantity: '3', unitPrice: '0.333333' })),
    discount: '0.17', total: '199.83',
  }));
  assert.equal(result.valid, true);
  assert.equal(result.lines.length, 200);
  assert.equal(result.subtotal, '199.83');
  assert.equal(result.lines.filter(item => item.net === '0.99').length, 17);
});
test('netUnitCost and unitCost separate pre-tax base from total paid per comparison unit', () => {
  const result = validateInvoice(invoice({
    lines: [line({ quantity: '2', unitsPerPack: '1', unitPrice: '1.00', taxRate: '15', supplierCode: '001045' })],
    taxTotal: '0.30',
    total: '2.30',
  }));
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].netUnitCost, '1.000000');
  assert.equal(result.lines[0].unitCost, '1.150000');
  assert.equal(validateInvoice(invoice({ lines: [line({ supplierCode: 'x'.repeat(101) })] })).valid, false);
});
test('price references support explicit gross vs net bases and optional commercial difference without double IVA', () => {
  const gross = calculatePriceReferences({ unitCost: '1.150000', netUnitCost: '1.000000', base: 'gross' });
  assert.equal(gross.base, 'gross');
  assert.equal(gross.baseCost, '1.150000');
  assert.deepEqual(gross.increases, [
    { percent: 20, price: '1.38' },
    { percent: 25, price: '1.44' },
    { percent: 30, price: '1.50' },
  ]);
  assert.equal(gross.salePrice, null);
  assert.equal(gross.commercialDifference, null);

  const net = calculatePriceReferences({ unitCost: '1.150000', netUnitCost: '1.000000', base: 'net', salePrice: '1,50' });
  assert.equal(net.base, 'net');
  assert.equal(net.baseCost, '1.000000');
  assert.deepEqual(net.increases, [
    { percent: 20, price: '1.20' },
    { percent: 25, price: '1.25' },
    { percent: 30, price: '1.30' },
  ]);
  assert.equal(net.salePrice, '1.50');
  assert.equal(net.commercialDifference, '0.350000');
  assert.equal(net.commercialPercent, '30.43');
  assert.equal(net.belowPaidCost, false);

  const below = calculatePriceReferences({ unitCost: '1.150000', netUnitCost: '1.000000', salePrice: '1.10' });
  assert.equal(below.commercialDifference, '-0.050000');
  assert.equal(below.belowPaidCost, true);
});

test('delivery/order give provisional references only: pre-tax without IVA, with-tax only when tax is known, never a confirmed cost', () => {
  const unknownTax = validateInvoice(invoice({ kind: 'delivery', total: '10.00', taxTotal: '', lines: [line({ quantity: '2', unitsPerPack: '5', unitPrice: '5', taxRate: '' })] }));
  assert.equal(unknownTax.lines[0].unitCost, null);
  assert.equal(unknownTax.lines[0].netUnitCost, null);
  assert.equal(unknownTax.lines[0].provisionalNetUnitCost, '1.000000');
  assert.equal(unknownTax.lines[0].provisionalUnitCost, null, 'unknown IVA must not be replaced by 0 %');
  const knownTax = validateInvoice(invoice({ kind: 'order', total: '11.50', taxTotal: '1.50', lines: [line({ quantity: '2', unitsPerPack: '5', unitPrice: '5', taxRate: '15' })] }));
  assert.equal(knownTax.lines[0].unitCost, null);
  assert.equal(knownTax.lines[0].provisionalNetUnitCost, '1.000000');
  assert.equal(knownTax.lines[0].provisionalUnitCost, '1.150000');
  const promo = validateInvoice(invoice({ kind: 'delivery', total: '1.00', lines: [line({ promotion: true })] }));
  assert.equal(promo.lines[0].provisionalNetUnitCost, null, 'a different-product promotion keeps its cost pending');
  const confirmedInvoice = validateInvoice(invoice({ total: '1.00' }));
  assert.equal(confirmedInvoice.lines[0].provisionalNetUnitCost, null, 'invoices publish confirmed costs, not provisional ones');
  assert.equal(confirmedInvoice.lines[0].unitCost, '1.000000');
});

test('rounding assistant detects reproducible alternative rounding mode and explains differences', () => {
  // Roguizam matches line-by-line (0.78); with group rounding (0.77) it detects suggestion 'line'
  const roguizamGroup = validateInvoice(invoice({
    rounding: 'total',
    total: '5.90',
    taxTotal: '0.78',
    lines: [
      line({ quantity: '5', unitPrice: '0.86', discountAmount: '0.92', taxRate: '15', lineTotal: '3.38' }),
      ...['two', 'three', 'four'].map(id => line({ id, quantity: '2', unitPrice: '0.29', taxRate: '15', lineTotal: '0.58' })),
    ],
  }));
  assert.equal(roguizamGroup.valid, false);
  assert.equal(roguizamGroup.roundingSuggestion, 'line');
  assert.ok(roguizamGroup.warnings.some(w => w.includes('Causa probable detectada')));

  // Ales matches group rounding (1.60); with line-by-line (1.59) it detects suggestion 'total'
  const alesLine = validateInvoice(invoice({
    rounding: 'line',
    taxTotal: '1.60',
    total: '12.24',
    lines: [
      ...['suave', 'limpieza', 'comezon'].map(id => line({ id, unitPrice: '2.61', taxRate: '15', lineTotal: '2.61' })),
      line({ id: 'jabon', quantity: '6', unitPrice: '0.47', discountPercent: '1.50', taxRate: '15', lineTotal: '2.78' }),
      line({ id: 'miel', unitPrice: '2.61', discountPercent: '99', taxRate: '15', lineTotal: '0.03' }),
    ],
  }));
  assert.equal(alesLine.valid, false);
  assert.equal(alesLine.roundingSuggestion, 'total');
  assert.ok(alesLine.warnings.some(w => w.includes('Causa probable detectada')));
});

test('wordsTotal validates written cents fraction against printed total cents', () => {
  const match = validateInvoice(invoice({
    total: '12.24',
    wordsTotal: 'SON: DOCE DÓLARES CON 24/100',
    lines: [line({ quantity: '1', unitPrice: '12.24' })],
  }));
  assert.equal(match.valid, true);
  assert.ok(match.warnings.some(w => w.includes('Importe en letras cotejado') && w.includes('24/100')));

  const mismatch = validateInvoice(invoice({
    total: '12.24',
    wordsTotal: 'DOCE DÓLARES CON 50/100',
    lines: [line({ quantity: '1', unitPrice: '12.24' })],
  }));
  assert.equal(mismatch.valid, true);
  assert.ok(mismatch.warnings.some(w => w.includes('la fracción escrita (50/100) no coincide con los centavos del total impreso (24 ctvs.)')));
});

test('official SRI VAT rate observations in Ecuador alert on historic or unusual rates without blocking', () => {
  // Document dated in 2026 with 12 % VAT warns that current general VAT is 15 %
  const currentWithOldRate = validateInvoice(invoice({
    date: '2026-05-15',
    total: '1.12',
    taxTotal: '0.12',
    lines: [line({ quantity: '1', unitPrice: '1.00', taxRate: '12' })],
  }));
  assert.equal(currentWithOldRate.valid, true);
  assert.ok(currentWithOldRate.warnings.some(w => w.includes('Circular SRI NAC-DGECCGC25-00000006')));

  // Document dated in 2023 with 15 % VAT warns that historic general VAT was 12 %
  const oldWithNewRate = validateInvoice(invoice({
    date: '2023-11-20',
    total: '1.15',
    taxTotal: '0.15',
    lines: [line({ quantity: '1', unitPrice: '1.00', taxRate: '15' })],
  }));
  assert.equal(oldWithNewRate.valid, true);
  assert.ok(oldWithNewRate.warnings.some(w => w.includes('era 12 %')));

  // Non-standard rate (e.g. 18 %) warns about unusual tax rate in Ecuador
  const unusualRate = validateInvoice(invoice({
    date: '2026-05-15',
    total: '1.18',
    taxTotal: '0.18',
    lines: [line({ quantity: '1', unitPrice: '1.00', taxRate: '18' })],
  }));
  assert.equal(unusualRate.valid, true);
  assert.ok(unusualRate.warnings.some(w => w.includes('no coincide con las tarifas tributarias habituales en Ecuador')));
});

test('different-product promotion with explicit allocated cost publishes traceable unit cost', () => {
  // 1 promotional gift box of 10 units with $2.50 explicit allocated cost
  const allocated = validateInvoice(invoice({
    total: '1.00',
    lines: [
      line({ id: 'main', quantity: '1', unitPrice: '1.00', taxRate: '0' }),
      line({ id: 'gift', quantity: '1', unitPrice: '0.00', unitsPerPack: '10', taxRate: '0', promotion: true, allocatedCost: '2.50' }),
    ],
  }));
  assert.equal(allocated.valid, true);
  const giftLine = allocated.lines.find(l => l.id === 'gift');
  assert.equal(giftLine?.unitCost, '0.250000');
  assert.equal(giftLine?.netUnitCost, '0.250000');
  assert.ok(allocated.warnings.some(w => w.includes('costo asignado explícitamente ($2.50)')));

  // Without allocated cost, cost remains pending as before
  const pending = validateInvoice(invoice({
    total: '1.00',
    lines: [
      line({ id: 'main', quantity: '1', unitPrice: '1.00', taxRate: '0' }),
      line({ id: 'gift', quantity: '1', unitPrice: '0.00', unitsPerPack: '10', taxRate: '0', promotion: true }),
    ],
  }));
  assert.equal(pending.valid, true);
  const pendingGift = pending.lines.find(l => l.id === 'gift');
  assert.equal(pendingGift?.unitCost, null);
  assert.ok(pending.warnings.some(w => w.includes('costo asignado pendiente, no se publica un costo cero')));
});
