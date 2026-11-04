import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, resolve, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { handleApi } from '../lib/server.ts';
import { LocalDatabase, LocalBucket, migrateLocal } from './storage.ts';
import { LocalAccounts } from './accounts.ts';

const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const cookie=(token:string)=>`mi_tienda_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`;
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.gz':'application/gzip','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf'};
async function smallBody(request:Request):Promise<Record<string,unknown>>{
 const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];if(!reader)throw new Error('Completa el formulario.');
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new Error('El formulario supera el tamaño permitido.');}chunks.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}const parsed:unknown=JSON.parse(new TextDecoder().decode(data));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('No se pudo leer el formulario.');return parsed as Record<string,unknown>;
}
export type LocalOptions={dataDirectory?:string;clientDirectory?:string;port?:number;geminiFetch?:typeof fetch};
export async function startLocalServer(options:LocalOptions={}){
 const dataDirectory=resolve(options.dataDirectory||process.env.MI_TIENDA_DATA_DIR||join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'MiTienda'));
 const packedClient=fileURLToPath(new URL('../../client/',import.meta.url));
 const clientDirectory=resolve(options.clientDirectory||process.env.MI_TIENDA_CLIENT_DIR||(existsSync(join(packedClient,'index.html'))?packedClient:fileURLToPath(new URL('../dist-local/client/',import.meta.url))));
 await mkdir(dataDirectory,{recursive:true,mode:0o700});
 const db=new LocalDatabase(join(dataDirectory,'tienda.sqlite')),accounts=new LocalAccounts(join(dataDirectory,'usuarios.sqlite')),bucket=new LocalBucket(join(dataDirectory,'archivos'));
 try{await migrateLocal(db,fileURLToPath(new URL('../drizzle/',import.meta.url)));}catch(e){accounts.close();db.close();throw e;}
 const secretPath=join(dataDirectory,'conexion-ia.key');let secret:string;
 try{secret=await readFile(secretPath,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const candidate=randomBytes(48).toString('base64');try{await writeFile(secretPath,candidate,{flag:'wx',mode:0o600});}catch(err){if((err as NodeJS.ErrnoException).code!=='EEXIST')throw err;}secret=await readFile(secretPath,'utf8');}
 let port=options.port??Number(process.env.MI_TIENDA_PORT||4310),closed=false;const controlToken=randomBytes(32).toString('hex');
 const env=()=>({DB:db.asD1(),BUCKET:bucket.asR2(),OWNER_EMAIL:accounts.ownerEmail,AI_CONFIG_SECRET:secret,AI_FETCH:options.geminiFetch});
 async function send(response:Response,target:ServerResponse){
  target.statusCode=response.status;for(const [key,value]of response.headers)target.setHeader(key,value);
  target.setHeader('X-Content-Type-Options','nosniff');target.setHeader('Referrer-Policy','same-origin');
  if(response.body)await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),target);else target.end();
 }
 const server=createServer(async(incoming:IncomingMessage,outgoing:ServerResponse)=>{
  const host=incoming.headers.host||'';if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){outgoing.writeHead(403);outgoing.end('Acceso local no permitido.');return;}
  const controller=new AbortController();incoming.once('aborted',()=>controller.abort());outgoing.once('close',()=>{if(!outgoing.writableEnded)controller.abort();});
  try{
   const url=new URL(incoming.url||'/',`http://${host}`),headers=new Headers();for(const [key,value]of Object.entries(incoming.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);}
   const request=new Request(url,{method:incoming.method,headers,signal:controller.signal,...(!['GET','HEAD'].includes(incoming.method||'GET')?{body:Readable.toWeb(incoming) as ReadableStream<Uint8Array>,duplex:'half'}:{})} as RequestInit&{duplex?:'half'});
   if(request.method!=='GET'&&request.method!=='HEAD'&&headers.get('origin')!==url.origin&&!(url.pathname==='/local/control/shutdown'&&headers.get('x-mi-tienda-control')===controlToken))return await send(json({error:'Realiza esta acción desde la tienda local.'},403),outgoing);
   const session=accounts.session(headers.get('cookie')||'');
   if(url.pathname==='/local/health')return await send(json({application:'mi-tienda-local',local:true}),outgoing);
   if(url.pathname==='/local/info')return await send(json({local:true,configured:accounts.configured,authenticated:!!session,dataDirectory:session?dataDirectory:undefined}),outgoing);
   if(url.pathname==='/local/setup'&&request.method==='POST'){
    const input=await smallBody(request);await accounts.create({username:input.username,name:input.name,password:input.password},true);const logged=await accounts.login(input.username,input.password);return await send(json({ok:true},200,{'Set-Cookie':cookie(logged.token)}),outgoing);
   }
   if(url.pathname==='/local/login'&&request.method==='POST'){
    const input=await smallBody(request),logged=await accounts.login(input.username,input.password);return await send(json({ok:true},200,{'Set-Cookie':cookie(logged.token)}),outgoing);
   }
   if(['/local/logout','/signout-with-chatgpt'].includes(url.pathname)){
    accounts.logout(headers.get('cookie')||'');return await send(new Response(null,{status:303,headers:{Location:'/','Set-Cookie':'mi_tienda_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}}),outgoing);
   }
   if(url.pathname==='/local/accounts'&&request.method==='POST'){
    const member=session?await db.prepare('SELECT role,active FROM members WHERE email=?').bind(session.identity.email).first<{role:string;active:number}>():null;
    if(!session||member?.role!=='admin'||!member.active)return await send(json({error:'Solo el encargado puede crear cuentas locales.'},403),outgoing);
    const input=await smallBody(request),created=await accounts.create({username:input.username,name:input.name,password:input.password,role:input.role});
    await db.prepare('INSERT INTO members(email,user_id,role,active,created_at) VALUES(?,?,?,1,?)').bind(created.email,created.id,created.role,new Date().toISOString()).run();
    await db.prepare("INSERT INTO audit(id,document_id,actor,action,detail,created_at) VALUES(lower(hex(randomblob(16))),'',?,'local_account_created',?,?)").bind(session.identity.email,created.username,new Date().toISOString()).run();return await send(json({ok:true}),outgoing);
   }
   if(url.pathname==='/local/control/shutdown'&&request.method==='POST'){
    if(headers.get('x-mi-tienda-control')!==controlToken)return await send(json({error:'Acción no autorizada.'},403),outgoing);
    await send(json({ok:true}),outgoing);setTimeout(()=>void close(),100);return;
   }
   if(url.pathname.startsWith('/api/'))return await send(await handleApi(request,env(),session?.identity||null),outgoing);
   if(request.method!=='GET'&&request.method!=='HEAD')return await send(json({error:'Acción no disponible.'},404),outgoing);
   let pathname:string;try{pathname=decodeURIComponent(url.pathname);}catch{return await send(json({error:'Dirección no válida.'},400),outgoing);}
   const path=resolve(clientDirectory,'.'+(pathname==='/'?'/index.html':pathname));
   if(path!==clientDirectory&&!path.startsWith(clientDirectory+sep))return await send(json({error:'Archivo no disponible.'},404),outgoing);
   let info;try{info=await stat(path);}catch{return await send(json({error:'Archivo no encontrado.'},404),outgoing);}if(!info.isFile())return await send(json({error:'Archivo no disponible.'},404),outgoing);
   outgoing.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':extname(path)==='.html'?'no-store':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; object-src 'self'; frame-ancestors 'self'"});
   if(request.method==='HEAD')outgoing.end();else await pipeline(createReadStream(path),outgoing);
  }catch(e){if(controller.signal.aborted)return;if(!outgoing.headersSent){const message=(e as Error).message;await send(json({error:/usuario|contraseña|formulario|nombre|encargado|tienda ya|intentos|permiso/i.test(message)?message:'No se pudo completar la acción local. Tu información guardada se conserva.'},400),outgoing);}else outgoing.destroy();}
 });
 server.requestTimeout=190000;server.headersTimeout=30000;
 await new Promise<void>((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);accept();});});
 const address=server.address();if(!address||typeof address==='string')throw new Error('No se pudo abrir la tienda local.');port=address.port;
 const controlFile=join(dataDirectory,'servidor-local.json');await writeFile(controlFile,JSON.stringify({port,token:controlToken,pid:process.pid}),{mode:0o600});
 async function close(){if(closed)return;closed=true;await new Promise<void>(resolveClose=>server.close(()=>resolveClose()));accounts.close();db.close();try{const current=JSON.parse(await readFile(controlFile,'utf8')) as {token:string};if(current.token===controlToken)await unlink(controlFile);}catch{}}
 return {url:`http://127.0.0.1:${port}`,server,close,dataDirectory,db,bucket,accounts};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 process.title='MiTiendaLocal';startLocalServer().then(app=>{console.log('Mi Tienda local: '+app.url);console.log('Datos guardados en: '+app.dataDirectory);for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>void app.close());}).catch(e=>{console.error((e as NodeJS.ErrnoException).code==='EADDRINUSE'?'El puerto local está ocupado. Si Mi Tienda ya está abierta, usa su ventana.':(e as Error).message);process.exitCode=1;});
}
