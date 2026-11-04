import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Miniflare } from 'miniflare';
import { handleApi } from '../lib/server.ts';
import { validateInvoice, type InvoiceInput } from '../lib/calculations.ts';

test('10,000 products and 50,000 documents: five concurrent sessions, pagination and CAS', { timeout: 180000 }, async () => {
  const mf = new Miniflare({ modules:true, script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'capacity-database'},r2Buckets:['BUCKET'] });
  try {
    const DB = await mf.getD1Database('DB') as unknown as D1Database; const BUCKET = await mf.getR2Bucket('BUCKET') as unknown as R2Bucket;
    const identity = {userId:'capacity-owner',email:'capacity@tienda.test',displayName:'Capacidad'}; const env = {DB,BUCKET,OWNER_EMAIL:identity.email};
    const migrations=(await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort();
    for(const file of migrations)for(const statement of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await DB.prepare(statement).run();
    const date = new Date().toISOString();
    const input:InvoiceInput={kind:'invoice',supplier:'Proveedor de capacidad',number:'CAP-0',date:'2026-08-20',seller:'Vendedor',relatedId:'',discount:'',rounding:'line',taxTotal:'0.15',total:'1.15',notes:'',lines:[{id:'line',productId:'cap-product-0',description:'Producto de prueba',quantity:'1',unitsPerPack:'1',bonusQuantity:'',unitPrice:'1',discountPercent:'',discountAmount:'',taxRate:'15',otherTax:'',lineTotal:'1.00',taxAmount:'0.15',promotion:false}]};
    const validation=JSON.stringify(validateInvoice(input));
    const setupStart=performance.now();
    const productInserts:D1PreparedStatement[]=[];
    for(let start=0;start<10000;start+=100)productInserts.push(DB.prepare("WITH RECURSIVE n(v) AS (SELECT ? UNION ALL SELECT v+1 FROM n WHERE v<?) INSERT INTO products(id,name,barcode,presentation,units_per_pack,tax_rate,created_at,updated_at) SELECT 'cap-product-'||printf('%d',v),'Producto '||printf('%05d',v),'','unidad','1','15',?,? FROM n").bind(start,start+99,date,date));
    await DB.batch(productInserts);
    const documentInserts:D1PreparedStatement[]=[];
    for(let start=0;start<50000;start+=100)documentInserts.push(DB.prepare("WITH RECURSIVE n(v) AS (SELECT ? UNION ALL SELECT v+1 FROM n WHERE v<?) INSERT INTO documents(id,version,status,kind,supplier,supplier_key,number,date,seller,total,data,validation,related_id,review_of,update_token,created_at,updated_at,created_by,updated_by) SELECT 'cap-doc-'||printf('%d',v),1,'draft','invoice','Proveedor de capacidad','proveedor de capacidad','CAP-'||printf('%d',v),'2026-08-20','Vendedor','1.15',json_set(?,'$.number','CAP-'||printf('%d',v)),?,'','','capacity-'||printf('%d',v),?,?,?,? FROM n").bind(start,start+99,JSON.stringify(input),validation,date,date,identity.email,identity.email));
    await DB.batch(documentInserts);
    // Capacity timing isolates query latency from scheduled backup IO, tested in the restore suite.
    await BUCKET.put('backups/'+date.slice(0,10)+'.json',JSON.stringify({testOnly:true}));
    const results=await Promise.all(Array.from({length:5},async(_,i)=>{const start=performance.now(); const response=await handleApi(new Request('https://capacity.test/api/state?page='+(i+1)),env,identity); const data=await response.json() as {counts:{documents:number;products:number};documents:unknown[];products:unknown[]}; const elapsed=performance.now()-start; assert.equal(response.status,200);assert.equal(data.counts.documents,50000);assert.equal(data.counts.products,10000);assert.equal(data.documents.length,50);assert.equal(data.products.length,50);return elapsed;}));
    const sorted=[...results].sort((a,b)=>a-b); const p95=sorted[Math.ceil(sorted.length*.95)-1];
    console.log(JSON.stringify({capacity:{products:10000,documents:50000,concurrentSessions:5},setupMilliseconds:Math.round(performance.now()-setupStart),stateMilliseconds:results.map(Math.round),p95Milliseconds:Math.round(p95),targetMilliseconds:2000,targetMet:p95<2000,environment:'Local Miniflare; shared development machine; not hosted-production guarantee'}));
    const updates=await Promise.all(Array.from({length:5},async(_,i)=>{const response=await handleApi(new Request('https://capacity.test/api/documents',{method:'POST',headers:{origin:'https://capacity.test','content-type':'application/json'},body:JSON.stringify({id:'cap-doc-0',version:1,data:{...input,notes:'Sesión '+i}})}),env,identity);if(response.status!==200&&response.status!==409)console.log('capacity-update-error',response.status,await response.text());return response.status;}));
    console.log('capacity-update-statuses',updates);
    assert.equal(updates.filter(s=>s===200).length,1);assert.equal(updates.filter(s=>s===409).length,4);
    assert.equal((await DB.prepare("SELECT COUNT(*) count FROM audit WHERE document_id='cap-doc-0' AND action='draft_updated'").first<{count:number}>())?.count,1);
  }finally{await mf.dispose();}
});
