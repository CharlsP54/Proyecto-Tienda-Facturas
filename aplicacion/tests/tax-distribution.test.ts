import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInvoice,parsePrintedTaxSummary,analyzeTaxDistribution,applyTaxDistribution,type InvoiceInput,type InvoiceLine} from '../lib/calculations.ts';
import {extractDocumentData,extractTaxSummary} from '../lib/ocr.ts';
import {mergeDocumentPages,explicitXmlTaxRate} from '../lib/pdf.ts';
import {parseGeminiResponse} from '../lib/gemini.ts';
import {invoiceResponse} from './fixtures/gemini.ts';
const line=(id:string,quantity:string,unitPrice:string):InvoiceLine=>({id,productId:id,description:'Artículo ficticio '+id,quantity,unitPrice,unitsPerPack:'1',bonusQuantity:'',discountAmount:'',discountPercent:'',taxRate:'0.00',taxAmount:'0.00',lineTotal:'',otherTax:'',promotion:false});
const source=():InvoiceInput=>({kind:'invoice',supplier:'Proveedor ficticio',number:'MIXTA-FICTICIA',date:'2026-06-30',seller:'',relatedId:'',discount:'0',rounding:'total',taxTotal:'0.68',total:'6.70',notes:'Nota previa',taxSummary:[{taxRate:'15',base:'4.52'},{taxRate:'0',base:'1.50'}],lines:[line('a','6','0.2500'),line('b','1','2.3000'),line('c','6','0.3700')]});

test('IVA mixto con ceros contradictorios: propone una solución exacta sin cambiar el original y la aplica con trazabilidad',()=>{
 const original=source(),snapshot=JSON.stringify(original),review=analyzeTaxDistribution(original);assert.equal(JSON.stringify(original),snapshot);assert.equal(review.status,'unique');assert.deepEqual(review.changes?.map(c=>[c.lineId,c.taxRate,c.taxAmount,c.calculatedTax]),[['b','15','','0.35'],['c','15','','0.33']]);assert.equal(validateInvoice(original).valid,false);
 const applied=applyTaxDistribution(original),check=validateInvoice(applied);assert.equal(check.valid,true,check.errors.join('\n'));assert.equal(check.subtotal,'6.02');assert.equal(check.tax,'0.68');assert.equal(check.total,'6.70');assert.deepEqual(applied.lines[1].taxReading,{taxRate:'0.00',taxAmount:'0.00'});assert.equal(applied.lines[0].taxReading,undefined);assert.equal(applied.lines[1].unitPrice,original.lines[1].unitPrice);assert.ok(applied.notes.startsWith('Nota previa\n'));assert.match(applied.taxReconciliation!.explanation,/Inferencia/);assert.equal(analyzeTaxDistribution(applied).status,'consistent');
});
test('varias asignaciones con la misma base quedan ambiguas aunque coincidan los totales',()=>{
 const data=source();data.lines=[line('a','1','1'),line('b','1','1')];data.taxSummary=[{taxRate:'0',base:'1.00'},{taxRate:'15',base:'1.00'}];data.taxTotal='0.15';data.total='2.15';assert.equal(analyzeTaxDistribution(data).status,'ambiguous');assert.throws(()=>applyTaxDistribution(data),/única/);
});
test('el IVA total aislado y una base parcial nunca inventan las tarifas',()=>{
 const data=source();delete data.taxSummary;assert.equal(analyzeTaxDistribution(data).status,'missing');data.taxSummary=[{taxRate:'15',base:'4.52'}];assert.equal(analyzeTaxDistribution(data).status,'mismatch');assert.equal(analyzeTaxDistribution({...source(),kind:'delivery'}).status,'commercial');
});
test('no modifica precios, impuestos no nulos o centavos impresos para forzar un reparto',()=>{
 const price=source();price.lines[1].lineTotal='2.31';assert.equal(analyzeTaxDistribution(price).status,'invalid');
 const total=source();total.total='6.71';assert.equal(analyzeTaxDistribution(total).status,'mismatch');
 const tax=source();tax.lines[1].taxAmount='0.34';assert.equal(analyzeTaxDistribution(tax).status,'mismatch');
 const impossible=source();impossible.taxSummary=[{taxRate:'15',base:'4.51'},{taxRate:'0',base:'1.51'}];assert.equal(analyzeTaxDistribution(impossible).status,'mismatch');
});
test('las bases impresas se validan por tarifa aunque el IVA y el total agregado coincidan',()=>{
 const data=applyTaxDistribution(source());data.taxSummary=[{taxRate:'15',base:'4.51'},{taxRate:'0',base:'1.51'}];const check=validateInvoice(data);assert.equal(check.valid,false);assert.ok(check.errors.some(error=>error.includes('Subtotal 15 %')));
 assert.deepEqual(parsePrintedTaxSummary([{taxRate:'15.00',base:'4,52'},{taxRate:'0.00',base:'1.50'}]),[{taxRate:'15',base:'4.52'},{taxRate:'0',base:'1.50'}]);assert.throws(()=>parsePrintedTaxSummary([{taxRate:'15',base:''}]),/Base/);assert.throws(()=>parsePrintedTaxSummary([{taxRate:'15',base:'1'},{taxRate:'15.0',base:'2'}]),/repetidos/);assert.throws(()=>parsePrintedTaxSummary([{taxRate:'NaN',base:'1'}]));
});
test('el reparto respeta descuentos y cargos que integran expresamente la base',()=>{
 const data=source();data.lines=[{...line('a','1','10'),discountAmount:'1',otherTax:'1',otherTaxInBase:true},{...line('b','1','5')}];data.taxSummary=[{taxRate:'15',base:'10.00'},{taxRate:'0',base:'5.00'}];data.taxTotal='1.50';data.total='16.50';const applied=applyTaxDistribution(data);assert.equal(applied.lines[0].taxRate,'15');assert.equal(validateInvoice(applied).total,'16.50');assert.equal(applied.lines[0].discountAmount,'1');
});
test('un cambio de redondeo necesario se propone explícitamente y conserva el modo anterior',()=>{
 const data=source();data.rounding='total';data.lines=[line('a','5','0.86'),line('b','2','0.29'),line('c','2','0.29'),line('d','2','0.29')];data.lines[0].discountAmount='0.92';data.taxSummary=[{taxRate:'15',base:'5.12'}];data.taxTotal='0.78';data.total='5.90';const review=analyzeTaxDistribution(data);assert.equal(review.status,'unique');assert.equal(review.rounding,'line');const applied=applyTaxDistribution(data);assert.equal(applied.rounding,'line');assert.equal(applied.taxReconciliation?.previousRounding,'total');assert.equal(validateInvoice(applied).valid,true);
});
test('el buscador se acota en documentos grandes y no elige una solución parcial',()=>{
 const data=source();data.lines=Array.from({length:200},(_,index)=>line('line-'+index,'1','1.00'));data.taxSummary=[{taxRate:'15',base:'100.00'},{taxRate:'0',base:'100.00'}];data.taxTotal='15.00';data.total='215.00';const review=analyzeTaxDistribution(data);assert.ok(['ambiguous','limited'].includes(review.status));assert.throws(()=>applyTaxDistribution(data));
});
test('OCR, páginas y Gemini conservan bases impresas sin repartir tarifas ni confundir no sujeto con 0 %',()=>{
 const footer='SUBTOTAL 15% 4.52\nSUBTOTAL 0% 1.50\nSUBTOTAL NO SUJETO DE IVA 0.00\nSUBTOTAL SIN IMPUESTOS 6.02\nIVA 15% 0.68\nTOTAL 6.70';const groups=[{taxRate:'15',base:'4.52'},{taxRate:'0',base:'1.50'}];assert.deepEqual(extractTaxSummary(footer),groups);const read=extractDocumentData(footer);assert.deepEqual(read.taxSummary,groups);assert.deepEqual(mergeDocumentPages([read,{lines:[],taxSummary:groups}]).taxSummary,groups);assert.throws(()=>mergeDocumentPages([read,{lines:[],taxSummary:[{taxRate:'15',base:'9.00'}]}]),/subtotales/);
 const response=invoiceResponse(),raw=JSON.parse(response.candidates[0].content.parts[0].text);raw.taxSummary=groups;raw.lines[0].taxRate='0.00';response.candidates[0].content.parts[0].text=JSON.stringify(raw);const parsed=parseGeminiResponse(response);assert.deepEqual(parsed.taxSummary,groups);assert.equal(parsed.lines[0].taxRate,'0.00');raw.taxSummary=[{taxRate:'15',base:''}];response.candidates[0].content.parts[0].text=JSON.stringify(raw);assert.throws(()=>parseGeminiResponse(response),/subtotales/);
});
test('los subtotales locales conservan separadores y texto en la columna izquierda',()=>{
 assert.deepEqual(extractTaxSummary('Información adicional | SUBTOTAL15% | 4.52\nCliente | SUBTOTAL 0%\t1,50 USD'),[{taxRate:'15',base:'4.52'},{taxRate:'0',base:'1.50'}]);
});
test('los códigos XML de exento y no objeto no se convierten en tarifa 0 %',()=>{
 assert.equal(explicitXmlTaxRate('6','0'),'');assert.equal(explicitXmlTaxRate('7','0.00'),'');assert.equal(explicitXmlTaxRate('0','0'),'0');assert.equal(explicitXmlTaxRate('4','15'),'15');assert.equal(explicitXmlTaxRate('4',''),'');
});
