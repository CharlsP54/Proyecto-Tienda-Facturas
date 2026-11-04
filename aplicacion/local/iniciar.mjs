import {spawn} from 'node:child_process';
import {mkdir,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {homedir} from 'node:os';
const root=fileURLToPath(new URL('./',import.meta.url));
const data=process.env.MI_TIENDA_DATA_DIR||join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'MiTienda');
const url='http://127.0.0.1:4310';
async function health(){try{const response=await fetch(url+'/local/health',{signal:AbortSignal.timeout(800)});if(!response.ok)return false;return (await response.json()).application==='mi-tienda-local';}catch{return false;}}
if(!await health()){
 await mkdir(join(data,'registros'),{recursive:true});const stdout=await open(join(data,'registros','aplicacion.log'),'a'),stderr=await open(join(data,'registros','errores.log'),'a');
 const child=spawn(process.execPath,['--experimental-strip-types',join(root,'server','local','server.ts')],{cwd:root,env:{...process.env,MI_TIENDA_DATA_DIR:data,MI_TIENDA_CLIENT_DIR:join(root,'client'),MI_TIENDA_PORT:'4310'},detached:true,windowsHide:true,stdio:['ignore',stdout.fd,stderr.fd]});
 await new Promise((accept,reject)=>{child.once('spawn',accept);child.once('error',reject);});child.unref();await stdout.close();await stderr.close();
 for(let attempt=0;attempt<50&&!await health();attempt++)await new Promise(accept=>setTimeout(accept,200));
 if(!await health())throw new Error('No se pudo iniciar Mi Tienda. Revisa los registros en '+join(data,'registros')+'. Si el puerto 4310 está ocupado, cierra la otra aplicación.');
}
console.log('Mi Tienda local: '+url);
const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
spawn(command,args,{detached:true,windowsHide:true,stdio:'ignore'}).unref();
