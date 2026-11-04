import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSuggestions, extractDocumentData } from '../lib/ocr.ts';

test('OCR proposes explicit fields without inventing products or supplier', () => {
  const result = extractSuggestions('FACTURA 001-002-000012345\nFecha emisión: 03/11/2026\nIVA 15% 0,30\nTOTAL $ 2,30\n');
  assert.deepEqual(result, { number: '001-002-000012345', date: '2026-11-03', total: '2.30', taxTotal: '0.30' });
});
test('ambiguous totals remain empty for human review', () => {
  assert.equal(extractSuggestions('TOTAL 2.30\nTOTAL 8.70\n').total, undefined);
});
test('invalid dates and absent taxes remain unknown', () => {
  const result = extractSuggestions('Fecha emisión: 31/02/2026\nTOTAL $ 5.54\n');
  assert.equal(result.date, undefined);
  assert.equal(result.taxTotal, undefined);
  assert.equal(result.total, '5.54');
});
test('subtotal is not mistaken for the final invoice total', () => {
  assert.equal(extractSuggestions('SUBTOTAL 100.00\nTOTAL BRUTO 110.00\n').total, undefined);
});

test('OCR extracts wordsTotal when legible in words line', () => {
  const result = extractSuggestions('FACTURA 001-001-000000010\nSON: DOCE DÓLARES CON 24/100\nTOTAL $ 12.24\n');
  assert.equal(result.wordsTotal, 'DOCE DÓLARES CON 24/100');
  assert.equal(result.total, '12.24');
});

test('extractDocumentData parses table lines, supplier RUC and packaging clues', () => {
  const invoiceSample = `
DISTRIBUIDORA ROGUIZAM S.A.
RUC: 0992384729001
FACTURA 001-002-000012345
FECHA: 03/11/2026

CANT  CODIGO  DESCRIPCION  PRECIO  DSCTO  TOTAL
5     1002    GALLETA OREO PAQUETE X12  0.8600  0.92  3.38
2     1005    WAFER VAINILLA X24        0.2900  0.00  0.58

SUBTOTAL: 3.96
IVA 15%: 0.60
TOTAL: 4.56
SON: CUATRO CON 56/100
  `;
  const result = extractDocumentData(invoiceSample);
  assert.equal(result.kind, 'invoice');
  assert.equal(result.supplier, 'DISTRIBUIDORA ROGUIZAM S.A.');
  assert.equal(result.supplierRuc, '0992384729001');
  assert.equal(result.number, '001-002-000012345');
  assert.equal(result.date, '2026-11-03');
  assert.equal(result.total, '4.56');
  assert.equal(result.taxTotal, '0.60');
  assert.equal(result.wordsTotal, 'CUATRO CON 56/100');
  assert.equal(result.lines.length, 2);
  
  // Line 1
  assert.equal(result.lines[0].quantity, '5');
  assert.equal(result.lines[0].supplierCode, '1002');
  assert.equal(result.lines[0].description, 'GALLETA OREO PAQUETE X12');
  assert.equal(result.lines[0].unitPrice, '0.8600');
  assert.equal(result.lines[0].lineTotal, '3.38');
  assert.equal(result.lines[0].unitsPerPack, '12');

  // Line 2
  assert.equal(result.lines[1].quantity, '2');
  assert.equal(result.lines[1].supplierCode, '1005');
  assert.equal(result.lines[1].description, 'WAFER VAINILLA X24');
  assert.equal(result.lines[1].unitPrice, '0.2900');
  assert.equal(result.lines[1].lineTotal, '0.58');
  assert.equal(result.lines[1].unitsPerPack, '24');
});

test('extractDocumentData identifies delivery notes without turning them into tax invoices', () => {
  const deliverySample = `
COMERCIALIZADORA COILE
DOCUMENTO SIN VALOR TRIBUTARIO
NOTA DE ENTREGA 001-010-000033221
FECHA: 2026-11-01

1  CANELA ENTERA X20  1.60
20  PIMIENTA EN POLVO  2.12

SUBTOTAL: 3.72
TOTAL: 3.72
  `;
  const result = extractDocumentData(deliverySample);
  assert.equal(result.kind, 'delivery');
  assert.equal(result.supplier, 'COMERCIALIZADORA COILE');
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].description, 'CANELA ENTERA X20');
  assert.equal(result.lines[0].unitsPerPack, '20');
});
