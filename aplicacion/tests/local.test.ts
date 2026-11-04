import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {startLocalServer} from '../local/server.ts';
import {invoiceResponse,twoProductResponse,fakeKey} from './fixtures/gemini.ts';
import type {InvoiceInput} from '../lib/calculations.ts';
type Doc={id:string;version:number;status:string;data:InvoiceInput};
type FileInfo={id:string;name:string;detached:boolean};
let application:Awaited<ReturnType<typeof startLocalServer>>,directory:string,ownerCookie='',memberCookie='',requests=0,quota=false,overloaded=false,lastModel='';
let pauseGeneration:(()=>Promise<void>)|null=null;
const network:typeof fetch=async(input,init)=>{requests++;assert.match(String(input),/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//);lastModel=String(input).split('/models/')[1].split(':')[0];
 if(!String(input).includes(':generateContent'))return new Response(JSON.stringify({name:'models/'+lastModel}));
 if(pauseGeneration)await pauseGeneration();const body=JSON.parse(String(init?.body)),sample=atob(body.contents[0].parts[1].inlineData.data).includes('EJEMPLO FICTICIO');
 return new Response(JSON.stringify(overloaded?{error:{message:'High demand '+fakeKey}}:sample?twoProductResponse():invoiceResponse()),{status:overloaded?503:quota?429:200});};
async function call<T=Record<string,unknown>>(path:string,payload?:unknown,cookie=ownerCookie){
 const response=await fetch(application.url+path,{headers:{cookie,...(payload===undefined?{}:{origin:application.url,'content-type':'application/json'})},...(payload===undefined?{}:{method:'POST',body:JSON.stringify(payload)})});return {status:response.status,value:await response.json() as T,headers:response.headers};
}
const blank=():InvoiceInput=>({kind:'invoice',supplier:'',number:'',date:'',seller:'',relatedId:'',discount:'',rounding:'line',taxTotal:'',total:'',notes:'',lines:[]});
before(async()=>{directory=await mkdtemp(join(tmpdir(),'mi-tienda-local-test-'));const client=join(directory,'client');await mkdir(client);await writeFile(join(client,'index.html'),'<html lang="es">Mi Tienda local</html>');application=await startLocalServer({dataDirectory:join(directory,'data'),clientDirectory:client,port:0,geminiFetch:network});});
after(async()=>{await application.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(directory.includes('mi-tienda-local-test-'));await rm(directory,{recursive:true,force:true});});
test('abre en loopback sin ChatGPT, configura cuentas locales y rechaza CSRF',async()=>{
 assert.equal((await call('/api/state')).status,401);const info=await call<{local:boolean;configured:boolean}>('/local/info');assert.equal(info.value.local,true);assert.equal(info.value.configured,false);
 const forbidden=await fetch(application.url+'/local/setup',{method:'POST',headers:{origin:'https://otro.test','content-type':'application/json'},body:'{}'});assert.equal(forbidden.status,403);
 const setup=await call('/local/setup',{username:'encargado',name:'Encargado de prueba',password:'PruebaLocal123'});assert.equal(setup.status,200,JSON.stringify(setup.value));ownerCookie=setup.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await call('/api/state')).status,200);assert.equal(requests,0,'el inicio y acceso no hacen llamadas a ningún servicio externo');
 assert.equal((await call('/local/accounts',{username:'ayudante',name:'Ayudante de prueba',password:'PruebaLocal456',role:'collaborator'})).status,200);
 const login=await call('/local/login',{username:'ayudante',password:'PruebaLocal456'});memberCookie=login.headers.get('set-cookie')!.split(';')[0];assert.equal((await call<{user:{role:string}}>('/api/state',undefined,memberCookie)).value.user.role,'collaborator');
 assert.equal((await call('/api/ai/config',{provider:'gemini',model:'gemini-3.8-flash',apiKey:fakeKey},memberCookie)).status,403);
});
test('papelera y originales retirados son recuperables, versionados e incluidos en respaldo',async()=>{
 const created=await call<{document:Doc}>('/api/documents',{data:blank()});let doc=created.value.document;
 const form=new FormData();form.set('documentId',doc.id);form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0])],'prueba.png',{type:'image/png'}));
 const uploaded=await fetch(application.url+'/api/upload',{method:'POST',headers:{cookie:ownerCookie,origin:application.url},body:form});const upload=await uploaded.json() as {file:FileInfo;document:Doc};assert.equal(uploaded.status,200);doc=upload.document;assert.equal(doc.version,2);
 const detached=await call<{document:Doc;files:FileInfo[];removedFiles:FileInfo[]}>(`/api/files/${upload.file.id}/detach`,{version:doc.version});assert.equal(detached.status,200);assert.equal(detached.value.files.length,0);assert.equal(detached.value.removedFiles.length,1);doc=detached.value.document;
 assert.equal((await call(`/api/files/${upload.file.id}/reattach`,{version:doc.version-1})).status,409);
 const discarded=await call<{document:Doc}>(`/api/documents/${doc.id}/discard`,{version:doc.version});assert.equal(discarded.status,200);doc=discarded.value.document;
 assert.ok(!(await call<{documents:Doc[]}>('/api/state')).value.documents.some(d=>d.id===doc.id));assert.ok((await call<{documents:Doc[]}>('/api/state?status=discarded')).value.documents.some(d=>d.id===doc.id));
 const copy=await call<{data:{files:{detached:number}[]}}>('/api/backup');assert.equal(copy.value.data.files[0].detached,1);
 const recovered=await call<{document:Doc}>(`/api/documents/${doc.id}/recover`,{version:doc.version});doc=recovered.value.document;assert.equal(doc.status,'draft');
 const original=await call<{document:Doc;files:FileInfo[]}>(`/api/files/${upload.file.id}/reattach`,{version:doc.version});assert.equal(original.status,200);assert.equal(original.value.files[0].id,upload.file.id);
});
test('Gemini requiere consentimiento, conserva el original y no guarda una propuesta sin revisión',async()=>{
 assert.equal((await call('/api/ai/config',{provider:'gemini',model:'gemini-3.8-flash',apiKey:'AQ.'+'clave_ficticia_con_puntos.'.repeat(25)})).status,200);
 const stored=await application.db.prepare("SELECT value FROM settings WHERE key='gemini_config'").first<{value:string}>();assert.ok(stored&&!stored.value.includes(fakeKey));
 const config=await call('/api/ai/config');assert.ok(!JSON.stringify(config.value).includes(fakeKey));
 const draft=(await call<{document:Doc}>('/api/documents',{data:blank()})).value.document;const form=new FormData();form.set('documentId',draft.id);form.set('file',new File([new Uint8Array([37,80,68,70,45,49,46,55])],'factura.pdf',{type:'application/pdf'}));const result=await fetch(application.url+'/api/upload',{method:'POST',headers:{cookie:ownerCookie,origin:application.url},body:form});const upload=await result.json() as {file:FileInfo;document:Doc};
 const payload={documentId:draft.id,version:upload.document.version,provider:'gemini',fileIds:[upload.file.id]};let before=requests;
 assert.equal((await call('/api/ai/extract-document',payload)).status,403);assert.equal(requests,before);
 const extracted=await call<{extracted:InvoiceInput}>('/api/ai/extract-document',{...payload,consent:true});assert.equal(extracted.status,200,JSON.stringify(extracted.value));assert.equal(extracted.value.extracted.lines[0].description,'ARROZ FICTICIO');assert.equal(extracted.value.extracted.total,'3.45');
 const unchanged=await call<{document:Doc}>('/api/documents/'+draft.id);assert.deepEqual(unchanged.value.document.data,blank());assert.equal(unchanged.value.document.version,upload.document.version);
 quota=true;before=requests;assert.equal((await call('/api/ai/extract-document',{...payload,consent:true})).status,429);assert.equal(requests,before+1);quota=false;
 assert.equal((await call('/api/ai/extract-document',{...payload,consent:true})).status,200,'el error de cuota libera la lectura anterior');
 const backup=await call('/api/backup');assert.ok(!JSON.stringify(backup.value).includes('encryptedKey'));assert.ok(!JSON.stringify(backup.value).includes(fakeKey));
});
test('anular explica el impacto y una nueva revisión conserva el documento anulado',async()=>{
 const product=await call<{product:{id:string}}>('/api/products',{name:'Producto local',unitsPerPack:'1',taxRate:'0'});
 const input:InvoiceInput={...blank(),supplier:'Proveedor local',number:'LOCAL-001',date:'2026-11-03',total:'2.00',taxTotal:'0.00',lines:[{id:'local-line',productId:product.value.product.id,description:'Producto local',quantity:'2',unitsPerPack:'1',bonusQuantity:'',unitPrice:'1',discountPercent:'',discountAmount:'',taxRate:'0',otherTax:'',lineTotal:'2.00',taxAmount:'',promotion:false}]};
 const draft=(await call<{document:Doc}>('/api/documents',{data:input})).value.document,confirmed=await call<{document:Doc}>(`/api/documents/${draft.id}/confirm`,{version:draft.version,operationId:'local-confirm-1'});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value));
 const impact=await call<{affectedProducts:number;consequences:string[]}>(`/api/documents/${draft.id}/impact`);assert.equal(impact.value.affectedProducts,1);assert.match(impact.value.consequences.join(' '),/costos vigentes/);
 const canceled=await call<{document:Doc}>(`/api/documents/${draft.id}/cancel`,{version:confirmed.value.document.version,reason:'Prueba local de anulación'});assert.equal(canceled.status,200);
 const history=await call<{history:unknown[]}>('/api/history?productId='+product.value.product.id);assert.equal(history.value.history.length,0);
 const revision=await call<{document:Doc}>(`/api/documents/${draft.id}/revise`,{version:canceled.value.document.version,reason:'Crear nuevo borrador'});assert.equal(revision.status,200,JSON.stringify(revision.value));assert.equal(revision.value.document.status,'draft');assert.equal((await call<{document:Doc}>(`/api/documents/${draft.id}`)).value.document.status,'cancelled');
});
test('la base, archivos y sesión sobreviven un reinicio sin servicios externos',async()=>{
 const count=await application.db.prepare('SELECT COUNT(*) count FROM documents').first<{count:number}>();await application.close();application=await startLocalServer({dataDirectory:join(directory,'data'),clientDirectory:join(directory,'client'),port:0,geminiFetch:network});
 assert.equal((await application.db.prepare('SELECT COUNT(*) count FROM documents').first<{count:number}>())?.count,count?.count);assert.equal((await call('/api/state')).status,200);assert.equal((await call('/api/backup')).status,200);
});

test('cinco ediciones simultáneas conservan una sola versión y un lote fallido no deja cambios parciales',async()=>{
 const doc=(await call<{document:Doc}>('/api/documents',{data:blank()})).value.document;
 const results=await Promise.all(Array.from({length:5},(_,i)=>call<{document:Doc}>('/api/documents',{id:doc.id,version:doc.version,data:{...blank(),supplier:`Proveedor ${i}`}})));
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,4);
 const saved=(await call<{document:Doc}>(`/api/documents/${doc.id}`)).value.document;assert.equal(saved.version,doc.version+1);assert.match(saved.data.supplier,/^Proveedor [0-4]$/);
 await assert.rejects(application.db.batch([application.db.prepare("INSERT INTO settings VALUES('prueba_atomica','primero')"),application.db.prepare("INSERT INTO settings VALUES('prueba_atomica','duplicado')")]));
 assert.equal(await application.db.prepare("SELECT value FROM settings WHERE key='prueba_atomica'").first(),null);
});

test('restaura copias completas y antiguas con originales, papelera y cuentas locales independientes',async()=>{
 const draft=(await call<{document:Doc}>('/api/documents',{data:blank()})).value.document;
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);const form=new FormData();form.set('documentId',draft.id);form.set('file',new File([bytes],'original-retirado.png',{type:'image/png'}));
 const upload=await (await fetch(application.url+'/api/upload',{method:'POST',headers:{cookie:ownerCookie,origin:application.url},body:form})).json() as {file:FileInfo;document:Doc};
 const detached=(await call<{document:Doc}>(`/api/files/${upload.file.id}/detach`,{version:upload.document.version})).value.document;
 await call(`/api/documents/${draft.id}/discard`,{version:detached.version});
 const copy=(await call<{data:{files:{detached?:number}[]}}>('/api/backup')).value;
 for(const legacy of [false,true]){
  const restored=await startLocalServer({dataDirectory:join(directory,legacy?'restored-old':'restored-current'),clientDirectory:join(directory,'client'),port:0,geminiFetch:network});
  try{
   const setup=await fetch(restored.url+'/local/setup',{method:'POST',headers:{origin:restored.url,'content-type':'application/json'},body:JSON.stringify({username:'otroencargado',name:'Otro encargado',password:'RestauracionLocal42'})});const cookie=setup.headers.get('set-cookie')!.split(';')[0];
   const headers={cookie,origin:restored.url,'content-type':'application/json'};await fetch(restored.url+'/api/state',{headers});const backup=structuredClone(copy);if(legacy)for(const file of backup.data.files)delete file.detached;
   const result=await fetch(restored.url+'/api/restore',{method:'POST',headers,body:JSON.stringify({backup})});assert.equal(result.status,200,await result.text());
   const detail=await (await fetch(restored.url+`/api/documents/${draft.id}`,{headers})).json() as {document:Doc;files:FileInfo[];removedFiles:FileInfo[]};assert.equal(detail.document.status,'discarded');assert.equal(detail.removedFiles.length,legacy?0:1);
   const original=await fetch(restored.url+`/api/files/${upload.file.id}`,{headers});assert.deepEqual(new Uint8Array(await original.arrayBuffer()),bytes);
   assert.equal((await fetch(restored.url+'/api/state',{headers})).status,200);assert.equal(await restored.db.prepare("SELECT value FROM settings WHERE key='gemini_config'").first(),null);
  }finally{await restored.close();}
 }
});

test('el aviso de saturación es concreto, no pierde campos y otro modelo requiere una selección explícita',async()=>{
 const draft=(await call<{document:Doc}>('/api/documents',{data:blank()})).value.document,form=new FormData();form.set('documentId',draft.id);form.set('file',new File([new Uint8Array([37,80,68,70,45,49,46,55])],'ocupado.pdf',{type:'application/pdf'}));
 const upload=await (await fetch(application.url+'/api/upload',{method:'POST',headers:{cookie:ownerCookie,origin:application.url},body:form})).json() as {file:FileInfo;document:Doc};const payload={documentId:draft.id,version:upload.document.version,provider:'gemini',fileIds:[upload.file.id],consent:true};
 overloaded=true;const before=requests;let failed;try{failed=await call<{code:string;providerStatus:number;error:string}>('/api/ai/extract-document',payload);}finally{overloaded=false;}
 assert.equal(failed.status,503);assert.equal(failed.value.code,'GEMINI_BUSY');assert.equal(failed.value.providerStatus,503);assert.match(failed.value.error,/saturado/);assert.ok(!failed.value.error.includes(fakeKey));assert.equal(requests,before+1);
 const unchanged=(await call<{document:Doc}>(`/api/documents/${draft.id}`)).value.document;assert.deepEqual(unchanged.data,blank());assert.equal(unchanged.version,upload.document.version);
 assert.equal((await call('/api/ai/extract-document',{...payload,model:'gemini-3.5-flash-lite'})).status,200);assert.equal(lastModel,'gemini-3.5-flash-lite');assert.equal((await call<{model:string}>('/api/ai/config')).value.model,'gemini-3.8-flash');
 const count=requests;assert.equal((await call('/api/ai/extract-document',{...payload,model:'otro-proveedor'})).status,400);assert.equal(requests,count);
});

test('la prueba real requiere consentimiento y encargado, comprueba el ejemplo y no crea compras',async()=>{
 const before=await application.db.prepare('SELECT COUNT(*) count FROM documents').first<{count:number}>(),calls=requests;
 assert.equal((await call('/api/ai/check-reading',{model:'gemini-3.5-flash-lite'})).status,403);assert.equal((await call('/api/ai/check-reading',{consent:true},memberCookie)).status,403);assert.equal(requests,calls);
 const result=await call<{products:number;total:string}>('/api/ai/check-reading',{model:'gemini-3.5-flash-lite',consent:true});assert.equal(result.status,200,JSON.stringify(result.value));assert.equal(result.value.products,2);assert.equal(result.value.total,'5.30');assert.equal(lastModel,'gemini-3.5-flash-lite');assert.equal((await application.db.prepare('SELECT COUNT(*) count FROM documents').first<{count:number}>())?.count,before?.count);
});

test('una segunda prueba no duplica envíos y una factura editada durante la lectura rechaza la propuesta tardía',async()=>{
 let release!:()=>void,notify!:()=>void;let blocked=new Promise<void>(accept=>{release=accept;});let entered=new Promise<void>(accept=>{notify=accept;});pauseGeneration=async()=>{notify();await blocked;};
 try{const first=call('/api/ai/check-reading',{consent:true});await entered;const before=requests;assert.equal((await call('/api/ai/check-reading',{consent:true})).status,409);assert.equal(requests,before);release();assert.equal((await first).status,200);}
 finally{release();pauseGeneration=null;}
 const draft=(await call<{document:Doc}>('/api/documents',{data:blank()})).value.document,form=new FormData();form.set('documentId',draft.id);form.set('file',new File([new Uint8Array([37,80,68,70,45,49,46,55])],'concurrente.pdf',{type:'application/pdf'}));const upload=await (await fetch(application.url+'/api/upload',{method:'POST',headers:{cookie:ownerCookie,origin:application.url},body:form})).json() as {file:FileInfo;document:Doc};
 blocked=new Promise<void>(accept=>{release=accept;});entered=new Promise<void>(accept=>{notify=accept;});pauseGeneration=async()=>{notify();await blocked;};
 try{const reading=call('/api/ai/extract-document',{documentId:draft.id,version:upload.document.version,provider:'gemini',fileIds:[upload.file.id],consent:true});await entered;assert.equal((await call('/api/documents',{id:draft.id,version:upload.document.version,data:{...blank(),supplier:'Edición que debe conservarse'}})).status,200);release();assert.equal((await reading).status,409);assert.equal((await call<{document:Doc}>(`/api/documents/${draft.id}`)).value.document.data.supplier,'Edición que debe conservarse');}
 finally{release();pauseGeneration=null;}
});

test('SQLite local consulta 50000 documentos y 10000 productos con cinco solicitudes concurrentes',async()=>{
 const timestamp=new Date().toISOString(),data=JSON.stringify(blank()),validation=JSON.stringify({valid:false,errors:[],warnings:[]});
 await application.db.batch([
  application.db.prepare("WITH RECURSIVE n(v) AS (SELECT 0 UNION ALL SELECT v+1 FROM n WHERE v<9999) INSERT INTO products(id,name,created_at,updated_at) SELECT 'native-cap-product-'||v,'Producto '||printf('%05d',v),?,? FROM n").bind(timestamp,timestamp),
  application.db.prepare("WITH RECURSIVE n(v) AS (SELECT 0 UNION ALL SELECT v+1 FROM n WHERE v<49999) INSERT INTO documents(id,version,status,kind,supplier,supplier_key,number,date,seller,total,data,validation,related_id,review_of,update_token,created_at,updated_at,created_by,updated_by) SELECT 'native-cap-doc-'||v,1,'draft','invoice','','','CAP-'||v,'2026-11-03','','',?,?,'','','capacity-'||v,?,?,?,? FROM n").bind(data,validation,timestamp,timestamp,'encargado@tienda.local','encargado@tienda.local'),
 ]);
 const results=await Promise.all(Array.from({length:5},async(_,i)=>{const start=performance.now();const result=await call<{counts:{documents:number;products:number};documents:unknown[];products:unknown[]}>(`/api/state?page=${i+1}`);assert.equal(result.status,200);assert.ok(result.value.counts.documents>=50000);assert.ok(result.value.counts.products>=10000);assert.equal(result.value.documents.length,50);assert.equal(result.value.products.length,50);return Math.round(performance.now()-start);}));
 console.log('Capacidad SQLite local: 50000 documentos, 10000 productos, 5 solicitudes; milisegundos:',results);
});

