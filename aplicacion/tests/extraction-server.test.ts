import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {handleApi} from '../lib/server.ts';
import {applyTaxDistribution,analyzeTaxDistribution,type InvoiceInput} from '../lib/calculations.ts';
type Doc={id:string;version:number;data:InvoiceInput;status:string};
type ExtractReply={extracted:InvoiceInput;document?:Doc;error?:string;warnings:string[]};
let mf:Miniflare;let db:D1Database;let bucket:R2Bucket;
const owner={userId:'extract-owner',email:'lectura@tienda.test',displayName:'Prueba'};
async function request<T>(path:string,payload?:unknown){const response=await handleApi(new Request('https://tienda.test/api/'+path,payload===undefined?{}:{method:'POST',headers:{origin:'https://tienda.test','content-type':'application/json'},body:JSON.stringify(payload)}),{DB:db,BUCKET:bucket,OWNER_EMAIL:owner.email},owner);return {status:response.status,value:await response.json() as T};}
const blank=():InvoiceInput=>({kind:'invoice',supplier:'',number:'',date:'',seller:'',relatedId:'',discount:'',rounding:'line',taxTotal:'',total:'',notes:'',lines:[]});
before(async()=>{mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'extract-test'},r2Buckets:['BUCKET']});db=await mf.getD1Database('DB') as unknown as D1Database;bucket=await mf.getR2Bucket('BUCKET') as unknown as R2Bucket;for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){for(const statement of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();}await request('state');});
after(async()=>{await mf.dispose();});
test('propone la factura completa sin modificar el borrador ni inventar IVA',async()=>{
 const created=await request<{document:Doc}>('documents',{data:blank()});const doc=created.value.document;
 const result=await request<ExtractReply>('ai/extract-document',{documentId:doc.id,version:doc.version,text:'PROVEEDOR: PRUEBA\nFACTURA 001-001-000000001\nFECHA: 03/11/2026\nCANT  CODIGO  DESCRIPCION  PRECIO  TOTAL\n2  A100  ARROZ  1.50  3.00\nIVA 0.45\nTOTAL 3.45'});
 assert.equal(result.status,200);assert.equal(result.value.extracted.supplier,'PRUEBA');assert.equal(result.value.extracted.lines.length,1);assert.equal(result.value.extracted.lines[0].taxRate,'');assert.equal(result.value.extracted.lines[0].productId,'');
 const current=await request<{document:Doc}>('documents/'+doc.id);assert.equal(current.value.document.version,doc.version);assert.deepEqual(current.value.document.data,blank());
 assert.equal((await request('ai/extract-document',{documentId:doc.id,version:doc.version,provider:'openai',text:'Factura'})).status,403);
 await request('documents',{id:doc.id,version:doc.version,data:{...blank(),notes:'Cambio simultáneo'}});
 assert.equal((await request('ai/extract-document',{documentId:doc.id,version:doc.version,text:'Factura'})).status,409);
});
test('la extracción conserva bases mixtas, bloquea confirmación contradictoria y guarda una propuesta aceptada con su lectura anterior',async()=>{
 const doc=(await request<{document:Doc}>('documents',{data:blank()})).value.document;
 for(const description of ['ARTICULO IVA A','ARTICULO IVA B','ARTICULO IVA C'])await request('products',{name:description,unitsPerPack:'1',taxRate:''});
 const structured={kind:'invoice',supplier:'Proveedor mixto ficticio',number:'MIXTA-TEST',date:'2026-06-30',taxTotal:'0.68',total:'6.70',taxSummary:[{taxRate:'15',base:'4.52'},{taxRate:'0',base:'1.50'}],lines:[['A','6','0.25','1.50'],['B','1','2.30','2.30'],['C','6','0.37','2.22']].map(([name,quantity,unitPrice,lineTotal])=>({description:'ARTICULO IVA '+name,quantity,unitPrice,lineTotal,unitsPerPack:'1',taxRate:'0.00',taxAmount:'0.00'}))};
 const extraction=await request<ExtractReply>('ai/extract-document',{documentId:doc.id,version:doc.version,structured});assert.equal(extraction.status,200);assert.deepEqual(extraction.value.extracted.taxSummary,structured.taxSummary);assert.equal(analyzeTaxDistribution(extraction.value.extracted).status,'unique');assert.equal((await request<{document:Doc}>('documents/'+doc.id)).value.document.data.taxSummary,undefined);
 const bad=(await request<{document:Doc}>('documents',{id:doc.id,version:doc.version,data:extraction.value.extracted})).value.document;assert.equal((await request('documents/'+doc.id+'/confirm',{version:bad.version,operationId:crypto.randomUUID()})).status,422);
 const accepted=applyTaxDistribution(extraction.value.extracted),saved=(await request<{document:Doc}>('documents',{id:doc.id,version:bad.version,data:accepted})).value.document;const confirmed=await request<{document:Doc}>('documents/'+doc.id+'/confirm',{version:saved.version,operationId:crypto.randomUUID()});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value));assert.equal(confirmed.value.document.status,'confirmed');assert.deepEqual(confirmed.value.document.data.lines[1].taxReading,{taxRate:'0.00',taxAmount:'0.00'});assert.equal(confirmed.value.document.data.taxReconciliation?.method,'printed_summary');
});
test('categoría persistente y asociación conocida no borran el IVA impreso',async()=>{
 const product=await request<{product:{id:string;category:string}}>('products',{name:'ARROZ',category:'Alimentos',unitsPerPack:'1',taxRate:'0'});assert.equal(product.value.product.category,'Alimentos');
 const doc=(await request<{document:Doc}>('documents',{data:blank()})).value.document;
 const extracted=(await request<ExtractReply>('ai/extract-document',{documentId:doc.id,version:doc.version,text:'PROVEEDOR: PRUEBA\nCANT  CODIGO  DESCRIPCION  PRECIO  TOTAL\n2  A100  ARROZ  1.50  3.00\nTOTAL 3.00'})).value.extracted;
 assert.equal(extracted.lines[0].productId,product.value.product.id);assert.equal(extracted.lines[0].category,'Alimentos');assert.equal(extracted.lines[0].taxRate,'');
 const backup=await request<{data:{products:{id:string;category:string}[]}}>('backup');assert.equal(backup.value.data.products.find(item=>item.id===product.value.product.id)?.category,'Alimentos');
 const destination=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'extract-restore'},r2Buckets:['BUCKET']});
 try{
  const restoredDb=await destination.getD1Database('DB') as unknown as D1Database,restoredBucket=await destination.getR2Bucket('BUCKET') as unknown as R2Bucket;
  for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await restoredDb.prepare(statement).run();
  const env={DB:restoredDb,BUCKET:restoredBucket,OWNER_EMAIL:owner.email};await handleApi(new Request('https://tienda.test/api/state'),env,owner);
  const restored=await handleApi(new Request('https://tienda.test/api/restore',{method:'POST',headers:{origin:'https://tienda.test','content-type':'application/json'},body:JSON.stringify({backup:backup.value})}),env,owner);
  assert.equal(restored.status,200,await restored.text());assert.equal((await restoredDb.prepare('SELECT category FROM products WHERE id=?').bind(product.value.product.id).first<{category:string}>())?.category,'Alimentos');
  const restoredMixed=await restoredDb.prepare("SELECT data FROM documents WHERE number='MIXTA-TEST'").first<{data:string}>();assert.ok(restoredMixed);const mixed=JSON.parse(restoredMixed.data) as InvoiceInput;assert.equal(mixed.taxSummary?.length,2);assert.equal(mixed.taxReconciliation?.method,'printed_summary');assert.deepEqual(mixed.lines[1].taxReading,{taxRate:'0.00',taxAmount:'0.00'});
 }finally{await destination.dispose();}
});
