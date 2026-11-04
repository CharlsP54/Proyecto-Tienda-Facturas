import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealGeminiKey,openGeminiKey,normalizeGeminiKey,parseGeminiResponse,extractWithGemini,verifyGeminiReading,GeminiError} from '../lib/gemini.ts';
import {fakeKey,fakeSecret,invoiceResponse,twoProductResponse} from './fixtures/gemini.ts';
test('la clave se cifra y una clave de protección distinta no permite recuperarla',async()=>{
 const encrypted=await sealGeminiKey(fakeKey,fakeSecret);assert.ok(!encrypted.includes(fakeKey));assert.equal(await openGeminiKey(encrypted,fakeSecret),fakeKey);await assert.rejects(openGeminiKey(encrypted,fakeSecret+'otro'));
});

test('acepta claves opacas de autorización con puntos y más de 200 caracteres sin recortarlas',async()=>{
 const key='AQ.'+'cadenaFicticia_dePrueba-'.repeat(25)+'.firma+valida/=';
 assert.ok(key.length>200);const encrypted=await sealGeminiKey('  '+key+'\n',fakeSecret);assert.equal(await openGeminiKey(encrypted,fakeSecret),key);
 assert.throws(()=>normalizeGeminiKey(key+'\r\nx-otra-cabecera: valor'),/espacios internos/);assert.throws(()=>normalizeGeminiKey('A'.repeat(4097)),/4096/);
 let received='';const fetcher:typeof fetch=async(_input,init)=>{received=new Headers(init?.headers).get('x-goog-api-key')||'';return new Response(JSON.stringify(invoiceResponse()));};
 await extractWithGemini(await openGeminiKey(encrypted,fakeSecret),'gemini-3.8-flash',[{mimeType:'application/pdf',bytes:new Uint8Array([37,80,68,70])}],new AbortController().signal,fetcher);assert.equal(received,key);
});
test('se preservan vacíos y descuentos unitarios exactos, y no se aceptan respuestas truncadas',()=>{
 const response=invoiceResponse(),data=JSON.parse(response.candidates[0].content.parts[0].text);data.lines[0].taxRate='';data.lines[0].discountAmount='0.1222';data.lines[0].quantity='12';data.lines[0].discountBasis='unit';response.candidates[0].content.parts[0].text=JSON.stringify(data);const extracted=parseGeminiResponse(response);assert.equal(extracted.lines[0].taxRate,'');assert.equal(extracted.lines[0].discountAmount,'1.4664');response.candidates[0].finishReason='MAX_TOKENS';assert.throws(()=>parseGeminiResponse(response),/no terminó/);
});
test('el envío usa originales de imagen y PDF, clave en cabecera y un solo intento ante cuota',async()=>{
 let requests=0;const fetcher:typeof fetch=async(input,init)=>{requests++;assert.equal(String(input).includes(fakeKey),false);assert.equal(new Headers(init?.headers).get('x-goog-api-key'),fakeKey);const body=JSON.parse(String(init?.body)) as {contents:{parts:{inlineData?:{mimeType:string;data:string}}[]}[]};assert.equal(body.contents[0].parts[1].inlineData?.mimeType,'application/pdf');return new Response('{}',{status:429});};
 await assert.rejects(extractWithGemini(fakeKey,'gemini-3.8-flash',[{mimeType:'application/pdf',bytes:new Uint8Array([37,80,68,70])}],new AbortController().signal,fetcher),/cuota/);assert.equal(requests,1);
});

test('la solicitud no envía el maxItems que Google rechaza y el receptor conserva el límite sin truncar',async()=>{
 let requests=0;const fetcher:typeof fetch=async(_input,init)=>{requests++;const body=JSON.parse(String(init?.body));assert.equal(body.generationConfig.responseJsonSchema.properties.lines.maxItems,undefined);assert.equal(body.generationConfig.temperature,undefined);return new Response(JSON.stringify(invoiceResponse()));};
 const files=[{mimeType:'application/pdf',bytes:new Uint8Array([37,80,68,70])}];await extractWithGemini(fakeKey,'gemini-3.5-flash-lite',files,new AbortController().signal,fetcher);assert.equal(requests,1);
 const response=invoiceResponse(),data=JSON.parse(response.candidates[0].content.parts[0].text);data.lines=Array.from({length:201},()=>({...data.lines[0]}));response.candidates[0].content.parts[0].text=JSON.stringify(data);assert.throws(()=>parseGeminiResponse(response),/200 productos/);
});

test('distingue saturación, cuota, solicitud inválida y permisos sin filtrar datos de Google ni reintentar',async()=>{
 const cases=[[503,'GEMINI_BUSY',503],[429,'GEMINI_QUOTA',429],[400,'GEMINI_REQUEST',422],[403,'GEMINI_ACCESS',403],[404,'GEMINI_MODEL',422],[402,'GEMINI_BILLING',402],[500,'GEMINI_SERVICE',502],[504,'GEMINI_TIMEOUT',504]] as const;
 for(const [status,code,expected]of cases){let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'Dato privado '+fakeKey+' detalle no publicable'}}),{status,headers:{'retry-after':'30'}});};
  await assert.rejects(extractWithGemini(fakeKey,'gemini-3.8-flash',[{mimeType:'application/pdf',bytes:new Uint8Array([37,80,68,70])}],new AbortController().signal,fetcher),(error:unknown)=>{assert.ok(error instanceof GeminiError);assert.equal(error.code,code);assert.equal(error.status,expected);assert.equal(error.providerStatus,status);assert.equal(error.retryAfterSeconds,30);assert.ok(!error.message.includes(fakeKey));assert.ok(!error.message.includes('Dato privado'));return true;});assert.equal(calls,1);
 }
});

test('una conexión cortada, filtros o importes numéricos mal formados no se convierten en propuestas parciales',async()=>{
 await assert.rejects(extractWithGemini(fakeKey,'gemini-3.8-flash',[{mimeType:'image/png',bytes:new Uint8Array([1])}],new AbortController().signal,async()=>{throw new TypeError('fetch '+fakeKey);}),(e:unknown)=>e instanceof GeminiError&&e.code==='GEMINI_NETWORK'&&!e.message.includes(fakeKey));
 assert.throws(()=>parseGeminiResponse({promptFeedback:{blockReason:'SAFETY'}}),/filtros de contenido/);
 const response=invoiceResponse(),data=JSON.parse(response.candidates[0].content.parts[0].text);data.lines[0].unitPrice=1.5;response.candidates[0].content.parts[0].text=JSON.stringify(data);assert.throws(()=>parseGeminiResponse(response),/campo inválido/);
});

test('un RUC incompleto se conserva como leído y se señala para revisión, sin inventar dígitos',()=>{
 const response=invoiceResponse(),data=JSON.parse(response.candidates[0].content.parts[0].text);data.supplierRuc='099999999001';response.candidates[0].content.parts[0].text=JSON.stringify(data);const result=parseGeminiResponse(response);assert.equal(result.supplierRuc,data.supplierRuc);assert.ok(result.warnings?.some(w=>w.includes('13 dígitos')));assert.equal(result.lines.length,1);
});

test('la prueba de lectura exige dos productos y su cuadre, además de una respuesta HTTP exitosa',async()=>{
 let body='';const fetcher:typeof fetch=async(_input,init)=>{body=String(init?.body);return new Response(JSON.stringify(twoProductResponse()));};
 const result=await verifyGeminiReading(fakeKey,'gemini-3.5-flash-lite',new AbortController().signal,fetcher);assert.equal(result.products,2);assert.equal(result.total,'5.30');assert.equal(result.taxTotal,'0.30');const input=JSON.parse(body);assert.match(atob(input.contents[0].parts[1].inlineData.data),/EJEMPLO FICTICIO/);
 await assert.rejects(verifyGeminiReading(fakeKey,'gemini-3.5-flash-lite',new AbortController().signal,async()=>new Response(JSON.stringify(invoiceResponse()))),(e:unknown)=>e instanceof GeminiError&&e.code==='GEMINI_PROBE_MISMATCH');
});
