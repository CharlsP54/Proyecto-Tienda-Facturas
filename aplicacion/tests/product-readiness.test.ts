import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {startLocalServer} from '../local/server.ts';
import {productCostIssues,readableUnitCost,calculateInnerUnitCost,calculatePriceReferences,type InvoiceInput} from '../lib/calculations.ts';
import {productReadingDetails,type ExtractedLineData} from '../lib/ocr.ts';
type Product={id:string;contentsMode:string;review:{status:string;issues:string[]};purchase?:{status:string;unitCost:string|null;inner:{unitCost:string}|null;references:{increases:unknown[]}}};
type Doc={id:string;version:number;status:string;data:InvoiceInput};
const profile={name:'Funda ficticia de chupetes',category:'Dulces',presentation:'Funda de 24 chupetes',comparisonUnit:'funda',unitsPerPack:'1',taxRate:'15',contentsMode:'multiple',innerUnits:'24',innerUnitLabel:'chupete'};
test('la ficha exige unidad, contenido y categoría; los datos comerciales opcionales no bloquean',()=>{
 assert.deepEqual(productCostIssues(profile),[]);assert.ok(productCostIssues({...profile,comparisonUnit:''}).length);assert.ok(productCostIssues({...profile,contentsMode:''}).length);assert.ok(productCostIssues({...profile,innerUnits:''}).length);assert.ok(productCostIssues({...profile,presentation:'Según documento'}).length);assert.ok(productCostIssues({...profile,category:''}).length);
 assert.deepEqual(productCostIssues({...profile,contentsMode:'single',innerUnits:'',innerUnitLabel:''}),[]);
 assert.deepEqual(productCostIssues({...profile,innerUnits:'24.0000'}),[]);
});
test('la vista redondea a tres decimales y conserva precisión exacta para el costo por chupete',()=>{
 assert.deepEqual(readableUnitCost('0.218889'),{amount:'0.219',lessThan:false});assert.deepEqual(readableUnitCost('0.162500'),{amount:'0.163',lessThan:false});assert.deepEqual(readableUnitCost('0.330000'),{amount:'0.33',lessThan:false});assert.deepEqual(readableUnitCost('0.000123'),{amount:'0.001',lessThan:true});assert.equal(readableUnitCost(''),null);assert.equal(readableUnitCost('0'),null);
 const source='2.050000',inner=calculateInnerUnitCost(source,'1.780000','24','chupete');assert.equal(source,'2.050000');assert.equal(inner?.unitCost,'0.085417');assert.equal(readableUnitCost(inner!.unitCost)?.amount,'0.085');
 assert.deepEqual(calculatePriceReferences({unitCost:'0.000123'}).increases,[],'No se sugiere vender a cero por redondeo.');
});
test('el contenido explícito se propone sin convertir la recepción; las cadenas y contradicciones quedan pendientes',()=>{
 const line:ExtractedLineData={id:'prueba',supplierCode:'',description:'FUNDA DE 24 CHUPETES',quantity:'1',unitsPerPack:'1',unitPrice:'1.78',discountPercent:'',discountAmount:'',taxRate:'15',lineTotal:'1.78',bonusQuantity:'',promotion:false,category:'Dulces',sourceText:'',costUnit:'UNI',contentsMode:'multiple',innerUnits:'24',innerUnitLabel:'chupete',purchaseColumns:{unitLabel:'UNI',boxes:'',units:'',total:'',packEvidence:''}};
 const proposed=productReadingDetails(line);assert.equal(proposed.costUnit,'funda');assert.equal(proposed.innerUnits,'24');assert.equal(line.unitsPerPack,'1');
 assert.equal(productReadingDetails({...line,description:'CHUPETE 24X28 UND CJ'}).contentsMode,'');assert.equal(productReadingDetails({...line,innerUnits:'28'}).innerUnits,'');assert.equal(productReadingDetails({...line,contentsMode:'single'}).contentsMode,'');
});
test('la API bloquea productos incompletos de factura y oculta costos antiguos incoherentes sin borrar la trazabilidad',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tienda-readiness-'));await mkdir(join(directory,'client'));await writeFile(join(directory,'client/index.html'),'<html>Prueba</html>');const app=await startLocalServer({dataDirectory:join(directory,'data'),clientDirectory:join(directory,'client'),port:0});
 try{
  const setup=await fetch(app.url+'/local/setup',{method:'POST',headers:{origin:app.url,'content-type':'application/json'},body:JSON.stringify({username:'prueba',name:'Prueba de revisión',password:'SoloPruebaLocal42'})}),cookie=setup.headers.get('set-cookie')!.split(';')[0];
  const call=async<T>(path:string,payload?:unknown)=>{const response=await fetch(app.url+'/api/'+path,{headers:{cookie,...(payload===undefined?{}:{origin:app.url,'content-type':'application/json'})},...(payload===undefined?{}:{method:'POST',body:JSON.stringify(payload)})});return {status:response.status,value:await response.json() as T};};
  await call('state');const product=(await call<{product:Product}>('products',{name:profile.name,unitsPerPack:'1'})).value.product;assert.equal(product.review.status,'pending');
  const input:InvoiceInput={kind:'invoice',supplier:'Proveedor ficticio',number:'REVISION-001',date:'2026-11-04',seller:'',relatedId:'',discount:'0',rounding:'line',taxTotal:'0.27',total:'2.05',notes:'',lines:[{id:'funda',productId:product.id,description:profile.name,quantity:'1',unitsPerPack:'1',unitPrice:'1.7791',taxRate:'15',bonusQuantity:'',discountPercent:'0',discountAmount:'0',otherTax:'',taxAmount:'',lineTotal:'1.78',promotion:false,sourceText:'1 FUNDA UNI 1.7791 1.78'}]};
  const draft=(await call<{document:Doc}>('documents',{data:input})).value.document;assert.equal((await call('documents/'+draft.id+'/confirm',{version:draft.version,operationId:crypto.randomUUID()})).status,422);
  const auto=await call('products',{id:'auto-incompleto',sourceDocumentId:draft.id,sourceLineId:'funda',sourceVersion:draft.version,name:profile.name,unitsPerPack:'1',taxRate:'15'});assert.equal(auto.status,422);assert.equal(await app.db.prepare("SELECT id FROM products WHERE id='auto-incompleto'").first(),null);
  assert.equal((await call('products',{id:product.id,...profile})).status,200);const confirmed=await call<{document:Doc}>('documents/'+draft.id+'/confirm',{version:draft.version,operationId:crypto.randomUUID()});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value));
  const ready=(await call<{product:Product}>('products/'+product.id)).value.product;assert.equal(ready.purchase?.status,'ready');assert.equal(ready.purchase?.unitCost,'2.050000');assert.equal(ready.purchase?.inner?.unitCost,'0.085417');
  const mismatch={...input,number:'CONTENIDO-DIFERENTE',lines:input.lines.map(line=>({...line,description:'FUNDA DE 28 CHUPETES',sourceText:'1 FUNDA DE 28 CHUPETES UNI'}))},mismatchDraft=(await call<{document:Doc}>('documents',{data:mismatch})).value.document;assert.equal((await call('documents/'+mismatchDraft.id+'/confirm',{version:mismatchDraft.version,operationId:crypto.randomUUID()})).status,422,'El contenido impreso debe coincidir con la ficha de esa presentación.');
  // Instantánea de una versión anterior, con UNI dividido por el embalaje del nombre.
  const old=structuredClone(input);old.lines[0].unitsPerPack='672';old.lines[0].description='Funda ficticia 24X28 UND CJ';await app.db.batch([app.db.prepare('UPDATE documents SET data=? WHERE id=?').bind(JSON.stringify(old),draft.id),app.db.prepare('UPDATE document_products SET unit_cost=?,units_per_pack=? WHERE document_id=?').bind('0.003051','672',draft.id)]);
  const pending=(await call<{product:Product}>('products/'+product.id)).value.product;assert.equal(pending.purchase?.status,'pending');assert.equal(pending.purchase?.unitCost,null);assert.deepEqual(pending.purchase?.references.increases,[]);const history=(await call<{history:{unitCost:string|null;reviewIssues:string[]}[]}>('history?productId='+product.id)).value.history;assert.equal(history[0].unitCost,null);assert.ok(history[0].reviewIssues.length);assert.equal((await app.db.prepare('SELECT unit_cost FROM document_products WHERE document_id=?').bind(draft.id).first<{unit_cost:string}>())?.unit_cost,'0.003051');
 }finally{await app.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});
