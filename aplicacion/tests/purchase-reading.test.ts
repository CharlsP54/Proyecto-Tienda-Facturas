import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolvePurchaseColumns,validateInvoice,applyDocumentPrecision,calculateInnerUnitCost,innerUnitCount,type InvoiceInput,type InvoiceLine} from '../lib/calculations.ts';
import {extractDocumentData,suggestInnerContents} from '../lib/ocr.ts';
const columns={unitLabel:'',boxes:'',units:'',total:'',packEvidence:''};
const line=(id:string):InvoiceLine=>({id,productId:id,description:'GOMAS FICTICIAS 500G X12',quantity:'1',unitsPerPack:'1',unitPrice:'2.777',bonusQuantity:'',discountPercent:'0',discountAmount:'0',taxRate:'15',taxAmount:'',lineTotal:'2.78',grossLineTotal:'3.19',otherTax:'',promotion:false});
const invoice=():InvoiceInput=>({kind:'invoice',supplier:'Proveedor ficticio',number:'FICTICIA-DECIMALES',date:'2026-11-04',seller:'',relatedId:'',discount:'0',rounding:'line',taxTotal:'1.25',total:'9.58',notes:'',taxSummary:[{taxRate:'15',base:'8.33'}],lines:[line('a'),line('b'),line('c')]});
test('cero cajas y una unidad prevalecen sobre X12 y conservan la lectura anterior',()=>{
 const out=resolvePurchaseColumns('1','12',{...columns,boxes:'0',units:'1',total:'1'});assert.equal(out.quantity,'1');assert.equal(out.unitsPerPack,'1');assert.equal(out.purchaseReading.unitsPerPack,'12');assert.equal(out.purchaseReading.boxes,'0');
});
test('UN prevalece sobre contenido encadenado y un factor sin respaldo queda pendiente',()=>{
 assert.equal(resolvePurchaseColumns('1','144',{...columns,unitLabel:'UN'}).unitsPerPack,'1');assert.equal(resolvePurchaseColumns('1','8',columns).unitsPerPack,'');assert.equal(resolvePurchaseColumns('1','8',{...columns,unitLabel:'CJ',packEvidence:'UNIDADES POR CAJA: 8'}).unitsPerPack,'8');
 assert.equal(resolvePurchaseColumns('1','12',{...columns,boxes:'0',units:'1',total:'12'}).quantity,'');assert.equal(resolvePurchaseColumns('1','12',{...columns,boxes:'1',units:'2',total:'14',packEvidence:'FACTOR: 12'}).unitsPerPack,'');
});
test('el lector local toma Caj/Uni/T.Cant y separa SUBTOTAL del TOTAL con impuestos',()=>{
 const read=extractDocumentData('PROVEEDOR: PRUEBA\nFACTURA 001-001-000000123\nCOD.\tCOD. PROV\tDESCRIPCION\tCaj.\tUni.\tT. Cant.\tPRECIO\tSUBTOTAL\tDSCTO.\tTOTAL\nA\t578\tGOMAS FICTICIAS 500G X12\t0\t1\t1\t2.777\t2.78\t0.00\t3.19\nTOTAL 9.58');
 assert.equal(read.lines.length,1);assert.equal(read.lines[0].quantity,'1');assert.equal(read.lines[0].unitsPerPack,'1');assert.equal(read.lines[0].lineTotal,'2.78');assert.equal(read.lines[0].grossLineTotal,'3.19');assert.equal(read.lines[0].description,'GOMAS FICTICIAS 500G X12');
 const unknown=extractDocumentData('FACTURA\nCANT\tCODIGO\tDESCRIPCION\tPRECIO\tTOTAL\n1\tA100\tCAJITA FICTICIA X8SOBRES X144CAJA\t1.30\t1.30\nTOTAL 1.30');assert.equal(unknown.lines[0].unitsPerPack,'');
});
test('una caja con total de unidades explícito no aplica dos veces la conversión',()=>{
 const received=resolvePurchaseColumns('24','24',{...columns,unitLabel:'CJ',boxes:'1',units:'0',total:'24',packEvidence:'FRACCION: 24'});assert.equal(received.quantity,'1');assert.equal(received.unitsPerPack,'24');
 const ambiguous=resolvePurchaseColumns('24','24',{...columns,boxes:'1',units:'0',total:'24',packEvidence:'FRACCION: 24'});assert.equal(ambiguous.unitsPerPack,'');
 const conflict=resolvePurchaseColumns('1','24',{...columns,unitLabel:'CJ',boxes:'1',units:'0',total:'25',packEvidence:'FRACCION: 24'});assert.equal(conflict.quantity,'');assert.equal(conflict.unitsPerPack,'');
});
test('la precisión hasta el subtotal es explícita, reproduce 8.33 + 1.25 = 9.58 y conserva centavos',()=>{
 const original=invoice(),before=JSON.stringify(original),check=validateInvoice(original);assert.equal(check.valid,false);assert.equal(check.precisionSuggestion,true);const accepted=applyDocumentPrecision(original),result=validateInvoice(accepted);assert.equal(result.valid,true,result.errors.join('\n'));assert.equal(result.subtotal,'8.33');assert.equal(result.tax,'1.25');assert.equal(result.total,'9.58');assert.equal(JSON.stringify(original),before);assert.equal(accepted.lines[0].unitPrice,'2.777');assert.equal(result.lines.reduce((sum,row)=>sum+BigInt(row.gross.replace('.','')),0n),958n);assert.deepEqual(result.lines.map(row=>row.displayGross),['3.19','3.19','3.19']);assert.match(accepted.notes,/precisión/);
});
test('no hay tolerancia de centavos ni redondeo implícito y los métodos previos conservan su comportamiento',()=>{
 const wrong=invoice();wrong.total='9.59';assert.equal(validateInvoice(wrong).precisionSuggestion,undefined);assert.throws(()=>applyDocumentPrecision(wrong));const withCharge=invoice();withCharge.lines[0].otherTax='0.01';withCharge.lines[0].otherTaxInBase=false;assert.throws(()=>applyDocumentPrecision(withCharge));
 const mistaken=invoice();mistaken.lines.forEach(row=>row.lineTotal='3.19');assert.equal(validateInvoice(mistaken).precisionSuggestion,undefined);
});
test('cajita de ocho sobres: conserva 1.30 por cajita y calcula 0.162500 por sobre sin doble IVA',()=>{
 const result=calculateInnerUnitCost('1.300000','1.130435','8','sobre');assert.ok(result);assert.equal(result.unitCost,'0.162500');assert.equal(result.references.increases.find(item=>item.percent===25)?.price,'0.20');assert.equal(calculateInnerUnitCost(null,null,'8','sobre'),null);assert.equal(calculateInnerUnitCost('1.30',null,'','sobre'),null);assert.throws(()=>innerUnitCount('0'));assert.throws(()=>innerUnitCount('8.5'));
 assert.deepEqual(suggestInnerContents('LM. RANCHERO 7.5GR CAJITA X8SOBRES X144CAJA'),{costUnit:'cajita',quantity:'8',unitLabel:'sobre'});assert.equal(suggestInnerContents('PRODUCTO 500G X144CAJA'),null);
});
