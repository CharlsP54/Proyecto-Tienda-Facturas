/** Exact arithmetic: input decimals are rationals; posted amounts are integer cents. */
export type InvoiceLine = {
  id: string; productId: string; supplierCode?: string; category?: string; sourceText?: string; description: string; quantity: string;
  unitsPerPack: string; bonusQuantity: string; unitPrice: string;
  discountPercent: string; discountAmount: string; taxRate: string;
  otherTax: string; otherTaxInBase?: boolean; lineTotal: string; taxAmount: string; promotion: boolean;
  /** Optional explicit cost allocation for promotional gift lines (promoKind = "different_product"). */
  allocatedCost?: string;
  /** Coincidencias propuestas; la elección humana conserva una sola identidad del catálogo. */
  productCandidates?: ProductCandidate[];newProductAcknowledged?: boolean;identityNote?:string;
  /** Lectura conservada antes de aceptar una propuesta basada en subtotales impresos. */
  taxReading?: {taxRate:string;taxAmount:string};
  grossLineTotal?:string;
  purchaseReading?:PurchaseReading;
  costUnit?:string;contentsMode?:'single'|'multiple'|'';innerUnits?:string;innerUnitLabel?:string;
};
export type ProductCostDetails={name:string;category:string;presentation:string;comparisonUnit:string;unitsPerPack:string;contentsMode:string;innerUnits:string;innerUnitLabel:string};
/** Campos comerciales necesarios para que un costo tenga una unidad inequívoca. PVP, marca y código son opcionales. */
export function productCostIssues(product:ProductCostDetails):string[]{
 const issues:string[]=[];
 if(!product.name.trim())issues.push('Falta el nombre del producto.');if(!product.category.trim())issues.push('Falta la categoría.');
 if(!product.presentation.trim()||/^seg[uú]n documento$/i.test(product.presentation.trim()))issues.push('Falta definir la presentación comprada.');
 if(!product.comparisonUnit.trim())issues.push('Falta indicar la unidad del costo: funda, botella, cajita u otra.');
 try{if(!product.unitsPerPack||read(product.unitsPerPack,'Conversión').n===0n)issues.push('Falta confirmar la conversión de recepción.');}catch{issues.push('La conversión de recepción no es válida.');}
 if(!['single','multiple'].includes(product.contentsMode))issues.push('Falta confirmar si la presentación contiene una unidad o varias.');
 if(product.contentsMode==='multiple'){try{if(!product.innerUnits||innerUnitCount(product.innerUnits)==='1')issues.push('Indica cuántas unidades interiores contiene la presentación (más de una).');}catch{issues.push('La cantidad interior debe ser entera y válida.');}if(!product.innerUnitLabel.trim())issues.push('Falta el nombre de la unidad interior.');if(product.innerUnitLabel.trim().toLocaleLowerCase('es')===product.comparisonUnit.trim().toLocaleLowerCase('es'))issues.push('Distingue la presentación de la unidad interior, por ejemplo funda y chupete.');}
 if(product.contentsMode==='single'&&(product.innerUnits||product.innerUnitLabel))issues.push('Una presentación individual no debe tener un desglose interior.');
 return issues;
}
/** Detección conservadora de conversiones antiguas incompatibles con la columna UNI. No reescribe el historial. */
export function purchaseCostIssues(line:InvoiceLine):string[]{
 const issues:string[]=[];try{const factor=read(line.unitsPerPack,'Conversión');if(factor.n!==factor.d){
  const reading=line.purchaseReading,loose=reading&&(/^(?:un|uni|und|u|unidad|unidades)$/i.test(reading.unitLabel.trim().replace(/\./g,''))||reading.boxes==='0'&&!!reading.units);
  if(loose||!reading&&/\b(?:UN|UNI|UND)\b/i.test(line.sourceText||''))issues.push('La conversión divide una unidad comprada como UNI. Revisa o corrige esta factura; el tamaño de caja del nombre no confirma unidades recibidas.');
 }}catch{issues.push('La conversión de esta compra está pendiente.');}return issues;
}
/** Presentación legible; la precisión original de seis decimales sigue intacta. */
export function readableUnitCost(value:string):{amount:string;lessThan:boolean}|null{
 try{const exact=read(value,'Costo',false,6);if(exact.n<=0n)return null;const display=rounded(exact,3);if(display===0n)return {amount:'0.001',lessThan:true};let amount=fixed(display,3);if(amount.endsWith('0'))amount=amount.slice(0,-1);return {amount,lessThan:false};}catch{return null;}
}
export type PurchaseColumns={unitLabel:string;boxes:string;units:string;total:string;packEvidence:string};
export type PurchaseReading=PurchaseColumns&{quantity:string;unitsPerPack:string;explanation:string};
export function innerUnitCount(value:string):string{
 if(value==='')return '';const parsed=read(value,'Contenido de la unidad',false,6);if(parsed.n<=0n||parsed.n%parsed.d!==0n||parsed.n>1000000n*parsed.d)throw new Error('El contenido debe ser una cantidad entera entre 1 y 1000000.');return (parsed.n/parsed.d).toString();
}
/** Desglose comercial opcional de la unidad del costo; no cambia cantidades ni costos históricos de factura. */
export function calculateInnerUnitCost(unitCost:string|null,netUnitCost:string|null,quantity:string,unitLabel:string){
 try{const count=innerUnitCount(quantity);if(!count||!unitLabel.trim()||unitCost===null)return null;const paid=optionalPositive(unitCost,6);if(!paid)return null;const cost=fixed(rounded(div(paid,read(count,'Contenido')),6),6);if(!optionalPositive(cost,6))return null;const net=netUnitCost?optionalPositive(netUnitCost,6):null,netCost=net?fixed(rounded(div(net,read(count,'Contenido')),6),6):null;return {quantity:count,unitLabel,unitCost:cost,netUnitCost:netCost,references:calculatePriceReferences({unitCost:cost,netUnitCost:netCost,salePrice:'',base:'gross'})};}catch{return null;}
}
export type PrintedTaxGroup={taxRate:string;base:string};
export type ProductCandidate={id:string;name:string;brand:string;content:string;presentation:string;reason:string;matchSource?:'supplier_code'|'supplier_description'|'exact_name'|'similar_name'|'gemini'};
export type InvoiceInput = {
  kind: 'invoice' | 'delivery' | 'order'; supplier: string; number: string;
  date: string; seller: string; relatedId: string; discount: string;
  rounding: 'line' | 'total'; taxTotal: string; total: string;
  lines: InvoiceLine[]; notes: string;
  /** Optional written words for total amount (e.g. "DOCE CON 24/100") to check against printed cents. */
  wordsTotal?: string;
  supplierRuc?: string; extractionWarnings?: string[];
  taxSummary?:PrintedTaxGroup[];
  taxReconciliation?:{method:'printed_summary';explanation:string;previousRounding:'line'|'total'};
  netRounding?:'line'|'document';
};
export type CalculatedLine = {
  id: string; net: string; tax: string; gross: string; unitCost: string | null; netUnitCost?: string | null;
  displayNet?:string;displayGross?:string;
  /** Only for delivery/order: identified provisional reference (pre-tax, and with tax when known); never a confirmed cost. */
  provisionalNetUnitCost?: string | null; provisionalUnitCost?: string | null;
};
export type CostReferenceBase = 'gross' | 'net';
export type PriceReferenceResult = {
  base: CostReferenceBase; baseCost: string | null;
  increases: { percent: 20 | 25 | 30; price: string }[];
  salePrice: string | null; commercialDifference: string | null;
  commercialPercent: string | null; belowPaidCost: boolean;
};
export type ValidationResult = {
  valid: boolean; errors: string[]; warnings: string[]; subtotal: string;
  tax: string; total: string; lines: CalculatedLine[];
  /** When a rounding discrepancy is detected and the alternate mode matches the printed values exactly. */
  roundingSuggestion?: 'line' | 'total';
  taxBases?:PrintedTaxGroup[];
  precisionSuggestion?:boolean;
};
type Rational = { n: bigint; d: bigint };
const ZERO: Rational = { n: 0n, d: 1n };
const HUNDRED: Rational = { n: 100n, d: 1n };
const MAX = 999999999n;
const pow = (digits: number) => 10n ** BigInt(digits);
function gcd(a: bigint, b: bigint): bigint {
  while (b) { const next = a % b; a = b; b = next; }
  return a < 0n ? -a : a;
}
function rat(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Error('No se puede dividir entre cero.');
  const factor = gcd(n, d) || 1n;
  return { n: (d < 0n ? -n : n) / factor, d: (d < 0n ? -d : d) / factor };
}
const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => rat(a.n * b.d, a.d * b.n);
const greater = (a: Rational, b: Rational) => a.n * b.d > b.n * a.d;
function rounded(a: Rational, digits: number): bigint {
  const n = a.n * pow(digits), negative = n < 0n, abs = negative ? -n : n;
  const magnitude = (abs * 2n + a.d) / (2n * a.d);
  return negative ? -magnitude : magnitude;
}
function fixed(value: bigint, digits = 2): string {
  const sign = value < 0n ? '-' : '';
  const text = (value < 0n ? -value : value).toString().padStart(digits + 1, '0');
  return digits ? `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}` : sign + text;
}
function read(value: unknown, name: string, emptyZero = false, digits = 6): Rational {
  if (value === '' && emptyZero) return ZERO;
  if (typeof value !== 'string' || value.length > 24 || !/^\d+(?:[.,]\d+)?$/.test(value)) {
    throw new Error(`${name}: ingresa un número positivo o cero, sin separadores de miles.`);
  }
  const parts = value.replace(',', '.').split('.'), fraction = parts[1] || '';
  if (fraction.length > digits) throw new Error(`${name}: admite hasta ${digits} decimales.`);
  const amount = rat(BigInt(parts[0] + fraction), pow(fraction.length));
  if (amount.n > MAX * amount.d) throw new Error(`${name}: supera el máximo permitido de 999999999.`);
  return amount;
}
function cents(value: unknown, name: string, emptyZero = false): bigint {
  return rounded(read(value, name, emptyZero, 2), 2);
}
/** Las columnas compradas prevalecen sobre la descripción comercial; nunca interpreta «X12» como recepción. */
export function resolvePurchaseColumns(quantity:string,unitsPerPack:string,columns:PurchaseColumns){
 const reading:PurchaseReading={...columns,quantity,unitsPerPack,explanation:''};
 const result=(q:string,factor:string,explanation:string)=>({quantity:q,unitsPerPack:factor,purchaseReading:{...reading,explanation}});
 try{
  const values=[quantity,unitsPerPack,columns.boxes,columns.units,columns.total];for(const value of values)if(value!=='')read(value,'Cantidad leída');
  const positive=(value:string)=>value!==''&&read(value,'Cantidad').n>0n,equal=(a:string,b:string)=>{const x=read(a,'Cantidad'),y=read(b,'Cantidad');return x.n*y.d===y.n*x.d;};
  const unit=/^(?:un|uni|und|u|unidad|unidades)$/i.test(columns.unitLabel.trim().replace(/\./g,''));
  const pack=/^(?:cj|caj|caja|cajas|dp|display|paq|paquete|paca|bulto|funda)$/i.test(columns.unitLabel.trim().replace(/\./g,''));
  const noBoxes=columns.boxes!==''&&!positive(columns.boxes);
  if(noBoxes&&positive(columns.units)||unit&&!positive(columns.boxes)){
   const actual=columns.total||columns.units||quantity;
   if(columns.total!==''&&columns.units!==''&&noBoxes&&!equal(columns.total,columns.units))return result('','','Las columnas de unidades y cantidad total se contradicen. Revisa el original antes de confirmar.');
   return result(actual,'1','Se compraron unidades sueltas según las columnas del documento. Cada unidad comprada cuenta como una unidad de comparación; los «X…» del nombre no se multiplican.');
  }
  if(unitsPerPack!==''&&positive(unitsPerPack)&&!equal(unitsPerPack,'1')&&!/\b(?:fracci[oó]n|factor|conversi[oó]n)\b|uni(?:dades)?\s*(?:por|x|\/)\s*(?:caj|pac|paq|disp|bult)/i.test(columns.packEvidence))return result(quantity,'','La conversión del empaque no está respaldada por una columna explícita. El «X…» de la descripción no confirma cuántas unidades recibiste.');
  if(positive(columns.boxes)&&positive(columns.units))return result(quantity,'','Hay cajas y unidades sueltas. Revisa qué cantidad corresponde al precio antes de convertir el empaque.');
  if(positive(columns.boxes)){
   if(!pack||!positive(unitsPerPack))return result(quantity,'','Hay cajas, pero no está claro si el precio corresponde a la caja o a sus unidades. Confirma la presentación antes de convertir.');
   if(columns.total!==''&&!equal(columns.total,columns.boxes)){const received=mul(read(columns.boxes,'Cajas'),read(unitsPerPack,'Conversión')),total=read(columns.total,'Cantidad total');if(total.n*received.d!==received.n*total.d)return result('','','Las cajas, la conversión y la cantidad total no coinciden. Revisa las columnas del original.');}
   return result(columns.boxes,unitsPerPack,'El precio está identificado por presentación comprada. Se usan las cajas como cantidad y su conversión explícita una sola vez; T.Cant. no se vuelve a multiplicar.');
  }
  return result(quantity||columns.total,unitsPerPack,unitsPerPack?'Se conservó la cantidad del documento y la conversión explícita para revisión.':'La descripción no determina la conversión. Falta confirmar la presentación comprada.');
 }catch{return result('','','Las cantidades leídas no son válidas. Se conserva la lectura original para revisión.');}
}
/** Solo bases y tarifas explícitas. Vacío, no sujeto y exento nunca se convierten en tarifa cero. */
export function parsePrintedTaxSummary(value:unknown):PrintedTaxGroup[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>8)throw new Error('Los subtotales por IVA deben contener hasta ocho tarifas.');
  const seen=new Set<string>();
  return value.map((item:unknown)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Hay un subtotal por IVA inválido.');const group=item as Record<string,unknown>;
    const rate=read(group.taxRate,'Tarifa del subtotal de IVA'),base=cents(group.base,'Base impresa por IVA');if(greater(rate,HUNDRED))throw new Error('La tarifa del subtotal de IVA supera 100 %.');
    const key=rate.n+'/'+rate.d;if(seen.has(key))throw new Error('Hay subtotales repetidos para una misma tarifa de IVA.');seen.add(key);
    return {taxRate:fixed(rounded(rate,6),6).replace(/\.?0+$/,'')||'0',base:fixed(base)};
  });
}
function validDate(date: unknown): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date < '1900-01-01' || date > '2199-12-31') return false;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
/** Largest remainder allocation: integer cents, deterministic order, no lost cent. */
function allocate(amount: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return weights.map(() => 0n);
  const result = weights.map(weight => amount * weight / sum);
  let left = amount - result.reduce((a, b) => a + b, 0n);
  const order = weights.map((weight, index) => ({ index, remainder: amount * weight % sum }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const item of order) { if (left === 0n) break; result[item.index]++; left--; }
  return result;
}
function exactWeights(values:Rational[]):bigint[]{const denominator=values.reduce((common,value)=>common/gcd(common,value.d)*value.d,1n);return values.map(value=>value.n*(denominator/value.d));}
/** Reparte el neto sin superar el importe pagado asignado a cada línea; conserva todos los centavos. */
function allocateCapped(amount:bigint,weights:bigint[],caps:bigint[]):bigint[]{
 const sum=weights.reduce((a,b)=>a+b,0n);if(sum===0n)return weights.map(()=>0n);
 const result=weights.map((weight,index)=>{const share=amount*weight/sum;return share>caps[index]?caps[index]:share;}),order=weights.map((weight,index)=>({index,remainder:amount*weight%sum})).sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
 let left=amount-result.reduce((a,b)=>a+b,0n);while(left>0n){let progress=false;for(const item of order)if(left>0n&&result[item.index]<caps[item.index]){result[item.index]++;left--;progress=true;}if(!progress)throw new Error('No se pudo distribuir el redondeo conservando los importes.');}return result;
}

/** Validate printed data without altering it; unknown is never silently converted to zero. */
export function validateInvoice(input: InvoiceInput,suggestMethods=true): ValidationResult {
  const errors: string[] = [], warnings: string[] = [], lines: CalculatedLine[] = [];
  const output: ValidationResult = { valid: false, errors, warnings, subtotal: '0.00', tax: '0.00', total: '0.00', lines };
  if (!input || typeof input !== 'object') { errors.push('Faltan los datos del documento.'); return output; }
  if(input.taxReconciliation!==undefined){const review=input.taxReconciliation;if(!review||typeof review!=='object'||review.method!=='printed_summary'||typeof review.explanation!=='string'||review.explanation.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(review.explanation)||!['line','total'].includes(review.previousRounding))errors.push('La explicación del reparto de IVA no es válida.');}
  if (!['invoice', 'delivery', 'order'].includes(input.kind)) errors.push('Selecciona el tipo de documento.');
  if (typeof input.supplier !== 'string' || !input.supplier.trim() || input.supplier.length > 200) errors.push('Indica un proveedor válido.');
  if (!validDate(input.date)) errors.push('La fecha del documento no es válida. Usa año-mes-día.');
  if (input.kind === 'invoice' && (typeof input.number !== 'string' || !input.number.trim())) errors.push('La factura necesita un número de comprobante.');
  for (const key of ['number', 'seller', 'relatedId'] as const) {
    if (typeof input[key] !== 'string' || input[key].length > 200) errors.push(`El campo ${key} no es válido.`);
  }
  if (typeof input.notes !== 'string' || input.notes.length > 10000) errors.push('Las notas exceden el tamaño permitido.');
  if (input.wordsTotal !== undefined && input.wordsTotal.trim()) {
    if (input.wordsTotal.length > 500) errors.push('El importe en letras no puede exceder 500 caracteres.');
    const fractionMatch = input.wordsTotal.match(/(?:con\s+|y\s+)?(\d{1,2})\s*\/\s*100\b/i);
    if (fractionMatch && typeof input.total === 'string' && /^\d+(?:[.,]\d{1,2})?$/.test(input.total)) {
      const writtenCents = Number.parseInt(fractionMatch[1], 10);
      const totalParts = input.total.replace(',', '.').split('.');
      const printedCents = Number.parseInt((totalParts[1] || '0').padEnd(2, '0').slice(0, 2), 10);
      if (writtenCents !== printedCents) {
        warnings.push(`Importe en letras: la fracción escrita (${fractionMatch[1]}/100) no coincide con los centavos del total impreso (${printedCents.toString().padStart(2, '0')} ctvs.). Revisa si hubo un error de transcripción.`);
      } else {
        warnings.push(`Importe en letras cotejado: los centavos escritos (${fractionMatch[1]}/100) coinciden con el total impreso.`);
      }
    }
  }
  if (input.rounding !== 'line' && input.rounding !== 'total') errors.push('Selecciona redondeo por línea o por grupo de IVA.');
  if(input.netRounding!==undefined&&!['line','document'].includes(input.netRounding))errors.push('Selecciona un método de redondeo de subtotales válido.');
  const precise=input.netRounding==='document';
  if(precise&&input.rounding!=='total')errors.push('El método de precisión hasta el subtotal requiere IVA sobre la base acumulada.');
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200) {
    errors.push('El documento debe contener entre 1 y 200 productos.'); return output;
  }
  if (input.kind !== 'invoice') warnings.push('Documento comercial: su cuadre no lo convierte en factura ni publica costos de compra confirmados.');
  const prepared: { source: InvoiceLine; net: bigint; netExact:Rational; rate: Rational | null; other: bigint; otherInBase: boolean | null; units: Rational | null; printedTax: bigint | null; allocated: bigint | null }[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i], label = `Producto ${i + 1}`;
    try {
      if (!line || typeof line !== 'object') throw new Error(`${label}: faltan datos.`);
      if (typeof line.id !== 'string' || !line.id || line.id.length > 200 || ids.has(line.id)) throw new Error(`${label}: identificador ausente o repetido.`);
      ids.add(line.id);
      if (typeof line.productId !== 'string' || line.productId.length > 200) throw new Error(`${label}: producto vinculado inválido.`);
      for(const [key,max] of [['costUnit',80],['innerUnitLabel',60]] as const)if(line[key]!==undefined&&(typeof line[key]!=='string'||line[key]!.length>max||/[\u0000-\u001f]/.test(line[key]!)))throw new Error(`${label}: presentación inválida.`);
      if(line.contentsMode!==undefined&&!['','single','multiple'].includes(line.contentsMode))throw new Error(`${label}: tipo de presentación inválido.`);
      if(line.innerUnits!==undefined)innerUnitCount(line.innerUnits);
      if (line.supplierCode !== undefined && (typeof line.supplierCode !== 'string' || line.supplierCode.length > 100 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(line.supplierCode))) throw new Error(`${label}: código de proveedor inválido.`);
      if (!line.productId.trim()) (input.kind === 'invoice' ? errors : warnings).push(`${label}: vincula el producto del catálogo antes de publicar un costo.`);
      if (typeof line.description !== 'string' || !line.description.trim() || line.description.length > 1000) throw new Error(`${label}: escribe una descripción válida.`);
      if (typeof line.promotion !== 'boolean') throw new Error(`${label}: indica si pertenece a una promoción de productos diferentes.`);
      const qty = read(line.quantity, `${label}, cantidad`), price = read(line.unitPrice, `${label}, precio`);
      const bonus = read(line.bonusQuantity, `${label}, unidades gratis`, true);
      const pct = read(line.discountPercent, `${label}, porcentaje de descuento`, true);
      if (greater(pct, HUNDRED)) throw new Error(`${label}: el descuento no puede superar el 100 %.`);
      const amountOff = read(line.discountAmount, `${label}, descuento en dinero`, true);
      const netExact = sub(mul(mul(qty, price), sub({ n: 1n, d: 1n }, div(pct, HUNDRED))), amountOff);
      if (netExact.n < 0n) throw new Error(`${label}: el descuento supera el valor de la compra.`);
      const net = rounded(netExact, 2);
      if (line.lineTotal !== '' && cents(line.lineTotal, `${label}, neto impreso`) !== net) errors.push(`${label}: el neto impreso no coincide. Se calcula $${fixed(net)} antes del descuento general.`);
      let units: Rational | null = null;
      if (line.unitsPerPack === '') {
        (input.kind === 'invoice' ? errors : warnings).push(`${label}: falta confirmar cuántas unidades contiene la presentación.`);
      } else {
        const conversion = read(line.unitsPerPack, `${label}, unidades por presentación`);
        if (conversion.n === 0n) throw new Error(`${label}: las unidades por presentación deben ser mayores que cero.`);
        units = add(mul(qty, conversion), bonus);
        if (units.n === 0n) throw new Error(`${label}: la cantidad recibida debe ser mayor que cero.`);
      }
      if (qty.n === 0n && bonus.n === 0n) throw new Error(`${label}: indica una cantidad recibida mayor que cero.`);
      let rate: Rational | null = null;
      if (line.taxRate === '') {
        (input.kind === 'invoice' ? errors : warnings).push(`${label}: el IVA no está informado; no se asume tarifa 0 %.`);
      } else {
        rate = read(line.taxRate, `${label}, tarifa de IVA`);
        if (greater(rate, HUNDRED)) throw new Error(`${label}: tarifa de IVA fuera del rango admitido (0 a 100 %).`);
        const pctNumber = rate.d === 1n ? Number(rate.n) : Number(rate.n) / Number(rate.d);
        if (![0, 5, 12, 14, 15].includes(pctNumber)) {
          warnings.push(`${label}: la tarifa de IVA ${line.taxRate} % no coincide con las tarifas tributarias habituales en Ecuador (0 %, 5 %, 12 % o 15 %). Comprueba si corresponde a otro impuesto o cargo especial.`);
        }
        if (pctNumber === 12 && validDate(input.date) && input.date >= '2024-04-01') {
          warnings.push(`${label}: para comprobantes desde el 01/04/2024 la tarifa general vigente de IVA en Ecuador es 15 % (Circular SRI NAC-DGECCGC25-00000006). Se conserva el 12 % impreso en el comprobante.`);
        }
        if (pctNumber === 15 && validDate(input.date) && input.date < '2024-04-01' && input.date >= '2000-01-01') {
          warnings.push(`${label}: para comprobantes anteriores al 01/04/2024 la tarifa general habitual de IVA en Ecuador era 12 %. Se conserva el 15 % impreso en el comprobante.`);
        }
      }
      const other = cents(line.otherTax, `${label}, otros impuestos`, true);
      if (line.otherTaxInBase !== undefined && typeof line.otherTaxInBase !== 'boolean') throw new Error(`${label}: indica si el cargo adicional integra la base del IVA.`);
      const otherInBase = other === 0n ? false : typeof line.otherTaxInBase === 'boolean' ? line.otherTaxInBase : null;
      if (otherInBase === null) (input.kind === 'invoice' ? errors : warnings).push(`${label}: falta indicar si el cargo adicional integra la base del IVA; consulta el documento.`);
      const printedTax = line.taxAmount === '' ? null : cents(line.taxAmount, `${label}, IVA impreso`);
      if(line.grossLineTotal!==undefined&&line.grossLineTotal!=='')cents(line.grossLineTotal,`${label}, total con IVA impreso`);
      if(line.purchaseReading!==undefined){const reading=line.purchaseReading;if(!reading||typeof reading!=='object')throw new Error(`${label}: lectura de cantidades inválida.`);for(const value of [reading.quantity,reading.unitsPerPack,reading.boxes,reading.units,reading.total])if(value!=='')read(value,`${label}, cantidad original`);for(const value of [reading.unitLabel,reading.packEvidence,reading.explanation])if(typeof value!=='string'||value.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error(`${label}: explicación de cantidades inválida.`);}
      if(line.taxReading!==undefined){if(!line.taxReading||typeof line.taxReading!=='object')throw new Error(`${label}: lectura anterior de IVA inválida.`);for(const value of [line.taxReading.taxRate,line.taxReading.taxAmount])if(value!=='')read(value,`${label}, lectura anterior de IVA`);}
      let allocated: bigint | null = null;
      if (line.promotion) {
        if (line.allocatedCost !== undefined && line.allocatedCost !== '') {
          allocated = cents(line.allocatedCost, `${label}, costo asignado de promoción`);
          if (allocated <= 0n) throw new Error(`${label}: el costo asignado a la promoción debe ser mayor que cero.`);
          warnings.push(`${label}: promoción con costo asignado explícitamente ($${fixed(allocated)}); se registra en el historial con su valor repartido.`);
        } else {
          warnings.push(`${label}: promoción con producto diferente; costo asignado pendiente, no se publica un costo cero.`);
        }
      } else if (net === 0n) {
        warnings.push(`${label}: importe cero; marca la promoción y revisa su asignación antes de usarlo como referencia de costo.`);
      }
      if (greater(pct, rat(90n))) warnings.push(`${label}: descuento de ${line.discountPercent} %; comprueba la promoción.`);
      prepared.push({ source: line, net, netExact, rate, other, otherInBase, units, printedTax, allocated });
    } catch (error) { errors.push(error instanceof Error ? error.message : `${label}: datos inválidos.`); }
  }
  if (prepared.length !== input.lines.length) return output;
  try {
    if(precise&&(cents(input.discount,'Descuento general',true)!==0n||prepared.some(line=>line.other!==0n||line.rate===null)))throw new Error('Este método de precisión requiere tarifas conocidas y no admite todavía descuentos generales ni cargos adicionales; conserva la revisión pendiente.');
    const initialNets=prepared.map(line=>line.net);
    if(precise){const groups=new Map<string,number[]>();prepared.forEach((line,index)=>{const key=line.rate!.n+'/'+line.rate!.d;groups.set(key,[...(groups.get(key)||[]),index]);});for(const indices of groups.values()){const exact=indices.map(index=>prepared[index].netExact),sum=exact.reduce(add,ZERO),shares=allocate(rounded(sum,2),exactWeights(exact));indices.forEach((index,n)=>{initialNets[index]=shares[n];});}warnings.push('Método explícito: se conserva la precisión del precio hasta sumar el subtotal por tarifa. Los centavos pagados se distribuyen entre las líneas por mayor residuo; los importes impresos de cada fila se comprueban por separado.');}
    const grossNet = initialNets.reduce((sum, net) => sum + net, 0n);
    const discount = cents(input.discount, 'Descuento general', true);
    if (discount > grossNet) throw new Error('El descuento general supera el subtotal de productos.');
    const discountAllocations = allocate(discount, initialNets);
    const nets = initialNets.map((net, index) => net - discountAllocations[index]);
    const taxBases = prepared.map((line, index) => nets[index] + (line.otherInBase === true ? line.other : 0n));
    const taxes = prepared.map((line, index) => line.rate && line.otherInBase !== null ? rounded(mul(rat(taxBases[index], 100n), div(line.rate, HUNDRED)), 2) : 0n);
    if (input.rounding === 'total') {
      const groups = new Map<string, number[]>();
      prepared.forEach((line, index) => {
        if (!line.rate || line.otherInBase === null) return;
        const key = `${line.rate.n}/${line.rate.d}`;
        groups.set(key, [...(groups.get(key) || []), index]);
      });
      for (const indices of groups.values()) {
        const rate = prepared[indices[0]].rate!;
        const base = indices.reduce((sum, index) => sum + taxBases[index], 0n);
        const totalTax = rounded(mul(rat(base, 100n), div(rate, HUNDRED)), 2);
        const split = allocate(totalTax, indices.map(index => taxBases[index]));
        indices.forEach((index, n) => { taxes[index] = split[n]; });
        if(precise){const weights=exactWeights(indices.map(index=>prepared[index].netExact)),grossShares=allocate(base+totalTax,weights),netShares=allocateCapped(base,weights,grossShares);indices.forEach((index,n)=>{nets[index]=netShares[n];taxBases[index]=netShares[n];taxes[index]=grossShares[n]-netShares[n];});}
      }
    }
    const tax = taxes.reduce((sum, value) => sum + value, 0n);
    const subtotal = nets.reduce((sum, value) => sum + value, 0n);
    const extra = prepared.reduce((sum, line) => sum + line.other, 0n);
    const total = subtotal + tax + extra;
    if (total > MAX * 100n) throw new Error('El total del documento supera el máximo permitido de 999999999.');
    const knownTax = prepared.every(line => line.rate !== null && line.otherInBase !== null);
    const actualGroups=new Map<string,PrintedTaxGroup>();
    prepared.forEach((line,index)=>{if(line.rate===null)return;const key=line.rate.n+'/'+line.rate.d,old=actualGroups.get(key);actualGroups.set(key,{taxRate:fixed(rounded(line.rate,6),6).replace(/\.?0+$/,'')||'0',base:fixed((old?cents(old.base,'Base calculada'):0n)+taxBases[index])});});
    output.taxBases=[...actualGroups.values()];
    const printedGroups=parsePrintedTaxSummary(input.taxSummary);
    if(printedGroups.length){
      const printedBase=printedGroups.reduce((sum,group)=>sum+cents(group.base,'Base impresa'),0n),calculatedBase=taxBases.reduce((sum,base)=>sum+base,0n);
      if(printedBase!==calculatedBase)errors.push('Los subtotales impresos por IVA no cubren la base calculada de productos. Revisa si falta una tarifa, un valor exento o no sujeto, o un descuento.');
      if(knownTax){for(const group of printedGroups){const rate=read(group.taxRate,'Tarifa impresa'),actual=actualGroups.get(rate.n+'/'+rate.d);if(cents(actual?.base||'0','Base calculada')!==cents(group.base,'Base impresa'))errors.push(`Subtotal ${group.taxRate} %: el documento indica $${group.base}, pero las líneas asignadas suman $${actual?.base||'0.00'}.`);}for(const group of actualGroups.values())if(cents(group.base,'Base calculada')>0n&&!printedGroups.some(printed=>printed.taxRate===group.taxRate))errors.push(`Hay una base de IVA ${group.taxRate} % que no figura en los subtotales impresos.`);}
    }
    if (input.taxTotal === '') {
      (input.kind === 'invoice' ? errors : warnings).push('Falta el total de IVA impreso; escribe 0 cuando conste expresamente cero.');
    } else {
      const printed = cents(input.taxTotal, 'IVA total impreso');
      if (knownTax && printed !== tax) errors.push(`El IVA impreso no coincide: se calcula $${fixed(tax)} con el método de redondeo seleccionado.`);
      if (!knownTax) warnings.push('El IVA total impreso se conserva como dato pendiente de reconciliar con las líneas sin tarifa.');
    }
    const printedTotal = cents(input.total, 'Total impreso');
    if (printedTotal !== total) {
      if (knownTax) errors.push(`El total impreso no coincide: se calcula $${fixed(total)}; diferencia $${fixed(printedTotal - total)}.`);
      else errors.push(`Las líneas conocidas suman $${fixed(total)} y no coinciden con el total impreso. Completa los impuestos o cargos antes de confirmar.`);
    }
    if (!knownTax) warnings.push('Cuadre parcial: coincidir en el total no verifica impuestos no informados.');

    // If printed and calculated differ, check whether the alternate rounding mode reproduces the printed amounts exactly.
    if (!precise && knownTax && (printedTotal !== total || (input.taxTotal !== '' && cents(input.taxTotal, 'IVA total impreso') !== tax))) {
      let altTaxes: bigint[];
      if (input.rounding === 'total') {
        altTaxes = prepared.map((line, index) => line.rate && line.otherInBase !== null ? rounded(mul(rat(taxBases[index], 100n), div(line.rate, HUNDRED)), 2) : 0n);
      } else {
        const altGroups = new Map<string, number[]>();
        prepared.forEach((line, index) => {
          if (!line.rate || line.otherInBase === null) return;
          const key = `${line.rate.n}/${line.rate.d}`;
          altGroups.set(key, [...(altGroups.get(key) || []), index]);
        });
        altTaxes = prepared.map((line, index) => line.rate && line.otherInBase !== null ? rounded(mul(rat(taxBases[index], 100n), div(line.rate, HUNDRED)), 2) : 0n);
        for (const indices of altGroups.values()) {
          const rate = prepared[indices[0]].rate!;
          const base = indices.reduce((sum, index) => sum + taxBases[index], 0n);
          const totalTax = rounded(mul(rat(base, 100n), div(rate, HUNDRED)), 2);
          const split = allocate(totalTax, indices.map(index => taxBases[index]));
          indices.forEach((index, n) => { altTaxes[index] = split[n]; });
        }
      }
      const altTax = altTaxes.reduce((sum, value) => sum + value, 0n);
      const altTotal = subtotal + altTax + extra;
      const printedTaxVal = input.taxTotal === '' ? null : cents(input.taxTotal, 'IVA total impreso');
      if (altTotal === printedTotal && (printedTaxVal === null || altTax === printedTaxVal)) {
        output.roundingSuggestion = input.rounding === 'total' ? 'line' : 'total';
        const altLabel = output.roundingSuggestion === 'line' ? 'por cada producto (línea por línea)' : 'sobre la base acumulada por grupo de IVA';
        warnings.push(`Causa probable detectada: si cambias el redondeo de IVA a «${altLabel}», el cálculo coincide exactamente con los valores impresos del comprobante.`);
      }
    }

    prepared.forEach((line, index) => {
      const displayTax=precise&&line.rate!==null?rounded(mul(line.netExact,div(line.rate,HUNDRED)),2):taxes[index];
      if (line.printedTax !== null && line.rate !== null && line.otherInBase !== null && line.printedTax !== displayTax) errors.push(`Producto ${index + 1}: IVA impreso distinto al calculado $${fixed(displayTax)}.`);
      const gross = nets[index] + taxes[index] + line.other;
      const displayGross=precise&&line.rate!==null?rounded(add(line.netExact,mul(line.netExact,div(line.rate,HUNDRED))),2):gross;
      if(line.source.grossLineTotal!==undefined&&line.source.grossLineTotal!==''&&line.rate!==null&&cents(line.source.grossLineTotal,'Total con IVA de línea')!==displayGross)errors.push(`Producto ${index+1}: el total con IVA impreso no coincide; se calcula $${fixed(displayGross)}.`);
      const hasAllocatedCost = line.source.promotion && line.allocated !== null;
      const pending = input.kind !== 'invoice' || !line.source.productId.trim() || (line.source.promotion && !hasAllocatedCost) || !line.units || !knownTax || (!hasAllocatedCost && line.net === 0n);
      const effectivePaid = hasAllocatedCost ? line.allocated! : gross;
      const effectiveNet = hasAllocatedCost ? line.allocated! : nets[index];
      const cost = pending ? null : rounded(div(rat(effectivePaid, 100n), line.units!), 6);
      const netCost = pending ? null : rounded(div(rat(effectiveNet, 100n), line.units!), 6);
      if (cost !== null && cost === 0n && gross > 0n) warnings.push(`Producto ${index + 1}: costo inferior a la precisión de seis decimales; revisa la conversión. No se publica un costo cero.`);
      if (cost !== null && cost > MAX * pow(6)) errors.push(`Producto ${index + 1}: costo por unidad fuera del rango permitido; revisa la conversión.`);
      const publishable = cost !== null && cost > 0n && cost <= MAX * pow(6);
      // Commercial documents (order/delivery) only offer an identified provisional reference, never a confirmed cost.
      // The pre-tax value does not need IVA; the with-tax value exists only when tax and extra charges are known.
      const commercialReady = input.kind !== 'invoice' && line.units !== null && !line.source.promotion && nets[index] > 0n;
      const provisionalNet = commercialReady ? rounded(div(rat(nets[index], 100n), line.units!), 6) : null;
      const provisionalGross = commercialReady && line.rate !== null && line.otherInBase !== null ? rounded(div(rat(gross, 100n), line.units!), 6) : null;
      const inRange = (value: bigint | null) => value !== null && value > 0n && value <= MAX * pow(6);
      lines.push({
        id: line.source.id, net: fixed(nets[index]), tax: fixed(taxes[index]), gross: fixed(gross),
        ...(precise?{displayNet:fixed(line.net),displayGross:fixed(displayGross)}:{}),
        unitCost: publishable ? fixed(cost, 6) : null,
        netUnitCost: publishable && netCost !== null && netCost > 0n && netCost <= MAX * pow(6) ? fixed(netCost, 6) : null,
        provisionalNetUnitCost: inRange(provisionalNet) ? fixed(provisionalNet!, 6) : null,
        provisionalUnitCost: inRange(provisionalGross) ? fixed(provisionalGross!, 6) : null,
      });
    });
    output.subtotal = fixed(subtotal); output.tax = fixed(tax); output.total = fixed(total);
    output.valid = errors.length === 0;
    if(!output.valid&&suggestMethods&&!precise){const alternate=validateInvoice({...input,netRounding:'document',rounding:'total'},false);if(alternate.valid){output.precisionSuggestion=true;warnings.push('El documento coincide si se conserva la precisión del precio hasta el subtotal. Puedes revisar y aplicar ese método explícitamente.');}}
    return output;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'No fue posible comprobar los importes.');
    return output;
  }
}

export function applyDocumentPrecision(input:InvoiceInput):InvoiceInput{
 const next={...input,netRounding:'document' as const,rounding:'total' as const},check=validateInvoice({...next,lines:next.lines.map((line,index)=>({...line,productId:line.productId||'revision-'+index}))},false);
 if(!check.valid)throw new Error('Ese método no reproduce todos los importes del documento. Revisa primero los datos.');
 const note='Método revisado: precisión completa del precio hasta el subtotal por tarifa, IVA sobre base acumulada y reparto explícito de centavos por mayor residuo. Se conservan los subtotales y totales impresos de cada línea.';
 const notes=[input.notes,note].filter(Boolean).join('\n');if(notes.length>10000)throw new Error('Las notas están llenas; conserva su contenido antes de añadir la explicación.');return {...next,notes};
}

export type TaxDistributionResult={
  status:'missing'|'consistent'|'unique'|'ambiguous'|'mismatch'|'limited'|'invalid'|'commercial';
  explanation:string;groups:PrintedTaxGroup[];rounding?:'line'|'total';
  changes?:{lineId:string;description:string;previousRate:string;taxRate:string;previousTaxAmount:string;taxAmount:string;calculatedTax:string}[];
  subtotal?:string;tax?:string;total?:string;
};
/** Reparto acotado de bases exactas: propone únicamente una solución matemática única, sin modificar el documento. */
export function analyzeTaxDistribution(input:InvoiceInput):TaxDistributionResult{
 const result=(status:TaxDistributionResult['status'],explanation:string,groups:PrintedTaxGroup[]=[]):TaxDistributionResult=>({status,explanation,groups});
 if(input.kind!=='invoice')return result('commercial','Los pedidos y notas de entrega conservan su IVA como dato provisional.');
 let groups:PrintedTaxGroup[];
 try{groups=parsePrintedTaxSummary(input.taxSummary);}catch(e){return result('invalid',e instanceof Error?e.message:'Revisa los subtotales por IVA.');}
 if(!groups.length)return result('missing','Faltan los subtotales impresos por tarifa. Vuelve a leer el original para proponer el reparto; el IVA total por sí solo no identifica los productos gravados.');
 if(input.netRounding==='document'){const checked=validateInvoice({...input,lines:input.lines.map((line,index)=>({...line,productId:line.productId||'revision-'+index}))},false);return checked.valid?{...result('consistent','Las bases y los totales coinciden usando precisión completa hasta el subtotal.',groups),subtotal:checked.subtotal,tax:checked.tax,total:checked.total}:result('invalid','Con precisión hasta el subtotal, revisa las tarifas y los importes originales antes de proponer otro reparto de IVA.',groups);}
 try{
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>200)return result('invalid','Revisa la lista de productos antes de repartir el IVA.',groups);
  // Se comprueba solo el álgebra de importes, independientemente del catálogo y de conversiones aún pendientes.
  // Los identificadores y conversiones auxiliares nunca se copian al documento del usuario.
  const algebra:InvoiceInput={...input,kind:'invoice',supplier:'Comprobación interna',number:'COMPROBACION',date:'2026-01-01',seller:'',relatedId:'',notes:'',taxSummary:undefined,taxReconciliation:undefined,taxTotal:'0',lines:input.lines.map((line,index)=>({...line,productId:'algebra-'+index,unitsPerPack:'1',taxRate:'0',taxAmount:'',grossLineTotal:''}))};
  const math=validateInvoice(algebra);
  if(math.lines.length!==input.lines.length||math.errors.some(error=>!error.startsWith('El total impreso no coincide:')))return result('invalid','Primero revisa cantidades, precios, descuentos, importes netos y cargos adicionales. No se propone IVA para compensar esos errores.',groups);
  const bases=math.lines.map((line,index)=>cents(line.net,'Neto')+(input.lines[index].otherTaxInBase===true?cents(input.lines[index].otherTax,'Cargo',true):0n));
  const targets=groups.map(group=>cents(group.base,'Base impresa'));
  if(bases.reduce((sum,base)=>sum+base,0n)!==targets.reduce((sum,base)=>sum+base,0n))return result('mismatch','Los subtotales por tarifa no cubren los productos calculados. Puede faltar una base exenta/no sujeta, un descuento o un renglón. No hay un reparto fiable.',groups);
  const current=validateInvoice({...algebra,taxSummary:groups,taxTotal:input.taxTotal,lines:algebra.lines.map((line,index)=>({...line,taxRate:input.lines[index].taxRate,taxAmount:input.lines[index].taxAmount,grossLineTotal:input.lines[index].grossLineTotal}))});
  if(current.valid)return {...result('consistent','Las tarifas de las líneas, sus bases y los totales coinciden con el resumen impreso.',groups),subtotal:current.subtotal,tax:current.tax,total:current.total};
  type State={sums:bigint[];count:number;path:bigint};
  let states=new Map<string,State>([['start',{sums:targets.map(()=>0n),count:1,path:0n}]]),work=0;
  for(const base of bases){const next=new Map<string,State>();for(const state of states.values())for(let g=0;g<groups.length;g++){
    if(++work>80000)return result('limited','La búsqueda alcanzó su límite seguro. Revisa el XML o las tarifas por producto; no se eligió una combinación incompleta.',groups);
    if(state.sums[g]+base>targets[g])continue;const sums=[...state.sums];sums[g]+=base;const key=sums.slice(0,-1).join('|'),old=next.get(key);
    if(old)old.count=Math.min(2,old.count+state.count);else next.set(key,{sums,count:state.count,path:(state.path<<3n)|BigInt(g)});
   }if(next.size>20000)return result('limited','Hay demasiadas combinaciones para una propuesta segura. Revisa el XML o las tarifas por producto.',groups);states=next;if(!states.size)break;
  }
  const solution=states.get(targets.slice(0,-1).join('|'));
  if(!solution||solution.sums.some((base,index)=>base!==targets[index]))return result('mismatch','Ninguna combinación de productos reproduce exactamente las bases impresas. Revisa la lectura o consulta el XML del proveedor.',groups);
  if(solution.count>1)return result('ambiguous','Hay varias combinaciones de productos que dan los mismos subtotales. El total no permite saber cuál lleva cada tarifa; revisa el XML o el detalle del proveedor.',groups);
  let path=solution.path;const rates=input.lines.map(()=> '');for(let i=rates.length-1;i>=0;i--){rates[i]=groups[Number(path&7n)].taxRate;path>>=3n;}
  const proposal:InvoiceInput={...algebra,taxSummary:groups,taxTotal:input.taxTotal,lines:algebra.lines.map((line,index)=>({...line,taxRate:rates[index],grossLineTotal:input.lines[index].grossLineTotal}))};
  let checked=validateInvoice(proposal),rounding=input.rounding;
  if(!checked.valid){rounding=rounding==='line'?'total':'line';checked=validateInvoice({...proposal,rounding});}
  if(!checked.valid)return result('mismatch','El reparto reproduce las bases, pero no el IVA y total impresos con los redondeos admitidos. No se aplicó ningún ajuste para forzar el cuadre.',groups);
  const changes:NonNullable<TaxDistributionResult['changes']>=[];
  for(let i=0;i<input.lines.length;i++){const line=input.lines[i],calculated=checked.lines[i].tax,printed=line.taxAmount;
   if(printed!==''&&cents(printed,'IVA leído')!==0n&&cents(printed,'IVA leído')!==cents(calculated,'IVA calculado'))return result('mismatch','El reparto contradice un importe de IVA no nulo de una línea. Consulta el desglose del proveedor antes de cambiarlo.',groups);
   const amount=printed!==''&&cents(printed,'IVA leído')===0n&&cents(calculated,'IVA calculado')!==0n?'':printed;
   const sameRate=line.taxRate!==''&&read(line.taxRate,'IVA leído').n*read(rates[i],'Tarifa propuesta').d===read(rates[i],'Tarifa propuesta').n*read(line.taxRate,'IVA leído').d;
   if(!sameRate||amount!==printed)changes.push({lineId:line.id,description:line.description,previousRate:line.taxRate,taxRate:rates[i],previousTaxAmount:printed,taxAmount:amount,calculatedTax:calculated});
  }
  return {...result('unique','Se encontró un único reparto que reproduce las bases, el IVA y el total impresos. Es una inferencia aritmética para tu revisión; no certifica la clasificación tributaria de los artículos.',groups),changes,rounding,subtotal:checked.subtotal,tax:checked.tax,total:checked.total};
 }catch{return result('invalid','Hay valores incompletos o inválidos. Revisa los importes antes de proponer un reparto de IVA.',groups);}
}
/** Acción explícita y deshacible; conserva la lectura anterior y la explicación dentro del documento. */
export function applyTaxDistribution(input:InvoiceInput):InvoiceInput{
 const review=analyzeTaxDistribution(input);if(review.status!=='unique'||!review.changes||!review.rounding)throw new Error('No hay una propuesta única de IVA para aplicar.');
 const explanation='Se aceptó el reparto de IVA por subtotales impresos: '+review.groups.map(group=>group.taxRate+' % sobre $'+group.base).join('; ')+'. Se conservan las lecturas anteriores de las líneas. Redondeo: '+(review.rounding==='line'?'por producto':'por base acumulada')+'. Inferencia aritmética revisada; no validación del SRI.';
 const notes=[input.notes,explanation].filter(Boolean).join('\n');if(notes.length>10000)throw new Error('Las notas están llenas. Conserva su contenido y libera espacio antes de aceptar la propuesta.');
 return {...input,rounding:review.rounding,notes,taxReconciliation:{method:'printed_summary',explanation,previousRounding:input.taxReconciliation?.previousRounding||input.rounding},lines:input.lines.map(line=>{const change=review.changes!.find(item=>item.lineId===line.id);return change?{...line,taxRate:change.taxRate,taxAmount:change.taxAmount,taxReading:line.taxReading||{taxRate:line.taxRate,taxAmount:line.taxAmount}}:line;})};
}

function optionalPositive(value: unknown, digits: number): Rational | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = read(value.trim(), 'Valor', false, digits);
    return parsed.n > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/** Reference increases (+20/+25/+30%) over an explicit cost base; never re-adds IVA or mutates prices. */
export function calculatePriceReferences(input: {
  unitCost: string | null; netUnitCost?: string | null; base?: CostReferenceBase; salePrice?: string;
}): PriceReferenceResult {
  const base: CostReferenceBase = input.base === 'net' ? 'net' : 'gross';
  const paid = optionalPositive(input.unitCost, 6);
  const beforeTax = optionalPositive(input.netUnitCost, 6);
  const selected = base === 'net' ? beforeTax : paid;
  const sale = optionalPositive(input.salePrice, 2);
  const diff = sale && paid ? sub(sale, paid) : null;
  return {
    base,
    baseCost: selected ? fixed(rounded(selected, 6), 6) : null,
    increases: selected ? ([20, 25, 30] as const).map(percent => ({
      percent,
      price: fixed(rounded(mul(selected, rat(BigInt(100 + percent), 100n)), 2), 2),
    })).filter(item=>cents(item.price,'Precio sugerido')>0n) : [],
    salePrice: sale ? fixed(rounded(sale, 2), 2) : null,
    commercialDifference: diff ? fixed(rounded(diff, 6), 6) : null,
    commercialPercent: diff && paid ? fixed(rounded(div(mul(diff, HUNDRED), paid), 2), 2) : null,
    belowPaidCost: diff !== null && diff.n < 0n,
  };
}

/** Conversión exacta de un descuento unitario leído, sin usar punto flotante. */
export function multiplyExtractedAmount(amount: string, quantity: string): string {
  try { const value = mul(read(amount, 'Descuento unitario'), read(quantity, 'Cantidad')); const scaled = mul(value, rat(1000000n)); return scaled.n % scaled.d === 0n ? fixed(scaled.n / scaled.d, 6).replace(/\.?0+$/, '') || '0' : ''; } catch { return ''; }
}
/** Solo propone un precio derivado si puede representarse exactamente a seis decimales. */
export function deriveExtractedUnitPrice(total: string, quantity: string): string {
  try { const value = div(read(total, 'Importe'), read(quantity, 'Cantidad')); const scaled = mul(value, rat(1000000n)); return scaled.n % scaled.d === 0n ? fixed(scaled.n / scaled.d, 6).replace(/\.?0+$/, '') || '0' : ''; } catch { return ''; }
}

/** Variación comercial exacta entre costos comparables; un dato pendiente no equivale a cero. */
export function calculateCostChange(current: string | null, previous: string | null): { amount: string; percent: string } | null {
  const now = optionalPositive(current, 6), before = optionalPositive(previous, 6);
  if (!now || !before) return null;
  const difference = sub(now, before);
  return { amount: fixed(rounded(difference, 6), 6), percent: fixed(rounded(div(mul(difference, HUNDRED), before), 2), 2) };
}

/** Suma importes explícitos del XML; no convierte ausencias ni fracciones de centavo en cero. */
export function sumExtractedAmounts(values: string[]): string {
  if (!values.length) return '';
  try {
    const total=values.map(value=>read(value,'Importe XML')).reduce(add,ZERO);
    const cents=mul(total,HUNDRED);
    return cents.n % cents.d === 0n ? fixed(cents.n/cents.d,2) : '';
  } catch { return ''; }
}

/** Solo reconoce la base de IVA cuando el XML la reproduce exactamente. */
export function extractedTaxBaseIncludesCharges(net: string, charges: string, taxBase: string): boolean | undefined {
  try {
    const base=read(taxBase,'Base impresa'),before=read(net,'Neto impreso'),extra=read(charges,'Cargos impresos');
    const equal=(a:Rational,b:Rational)=>a.n*b.d===b.n*a.d;
    if(equal(base,before))return false;
    if(equal(base,add(before,extra)))return true;
  } catch { }
  return undefined;
}
