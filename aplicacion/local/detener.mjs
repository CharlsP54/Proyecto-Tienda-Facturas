import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
const data=process.env.MI_TIENDA_DATA_DIR||join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'MiTienda');
try{const control=JSON.parse(await readFile(join(data,'servidor-local.json'),'utf8'));
 if(!Number.isInteger(control.port)||control.port<1||control.port>65535||!/^[a-f0-9]{64}$/.test(control.token))throw new Error('El control de la aplicación no es válido.');
 const response=await fetch(`http://127.0.0.1:${control.port}/local/control/shutdown`,{method:'POST',headers:{'x-mi-tienda-control':control.token},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error('No se pudo solicitar el cierre.');console.log('Cerrando de forma ordenada; espera antes de copiar los datos…');
 let stopped=false;
 for(let attempt=0;attempt<240;attempt++){
  try{const current=JSON.parse(await readFile(join(data,'servidor-local.json'),'utf8'));if(current.token!==control.token)throw new Error('La tienda se inició de nuevo durante el cierre. Comprueba su estado antes de copiar los datos.');}
  catch(e){if(e.code==='ENOENT'){stopped=true;break;}throw e;}
  await new Promise(accept=>setTimeout(accept,250));
 }
 if(!stopped)throw new Error('La tienda sigue terminando una operación. Espera y vuelve a ejecutar este acceso antes de copiar la carpeta de datos.');
 console.log('Mi Tienda está detenida. Ya puedes copiar la carpeta completa de datos.');
}catch(e){if(e.code==='ENOENT'||e.cause?.code==='ECONNREFUSED')console.log('Mi Tienda ya está detenida.');else throw e;}
