import {cp,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),workspace=path.resolve(root,'..'),bundle=path.join(workspace,'MI_TIENDA_LOCAL');
if(!existsSync(path.join(root,'dist-local/client/index.html'))||!existsSync(path.join(root,'dist-local/server/local/server.ts')))throw new Error('Ejecuta build:local antes de preparar el programa.');
await mkdir(bundle,{recursive:true});
await cp(path.join(root,'dist-local/client'),path.join(bundle,'client'),{recursive:true});await cp(path.join(root,'dist-local/server'),path.join(bundle,'server'),{recursive:true});
await mkdir(path.join(bundle,'runtime'),{recursive:true});await copyFile(process.execPath,path.join(bundle,'runtime','node.exe'));
for(const file of ['iniciar.mjs','detener.mjs'])await copyFile(path.join(root,'local',file),path.join(bundle,file));
for(const [name,script]of [['INICIAR_MI_TIENDA.cmd','iniciar.mjs'],['DETENER_MI_TIENDA.cmd','detener.mjs']]){
 const command='@echo off\r\nchcp 65001 >nul\r\n"%~dp0runtime\\node.exe" "%~dp0'+script+'"\r\nif errorlevel 1 pause\r\n';await writeFile(path.join(bundle,name),command,'utf8');
 await writeFile(path.join(workspace,name),'@echo off\r\ncall "%~dp0MI_TIENDA_LOCAL\\'+name+'"\r\n','utf8');
}
await writeFile(path.join(bundle,'LEEME.txt'),`MI TIENDA LOCAL\n\n1. Doble clic en INICIAR_MI_TIENDA.cmd.\n2. En el primer inicio crea tu cuenta de encargado.\n3. Se abre http://127.0.0.1:4310 en tu navegador.\n4. Usa DETENER_MI_TIENDA.cmd para cerrar el servidor. Cerrar una pestaña no borra ni detiene la tienda.\n\nBase de datos y archivos: %LOCALAPPDATA%\\MiTienda\nNo se guardan en ChatGPT Sites ni en una base de datos externa. La tienda funciona sin internet; Gemini es opcional y solo recibe los originales que autorices. La clave se introduce en Lectura con IA, nunca en el chat.\n\nDescarga copias desde Respaldo y conserva alguna copia en otro disco. No borres la carpeta de datos al actualizar el programa.\n\nNode.js ${process.version} incluido, https://nodejs.org, licencia MIT y avisos de componentes.\n`,'utf8');
await writeFile(path.join(bundle,'version.json'),JSON.stringify({application:'mi-tienda-local',builtAt:new Date().toISOString(),node:process.version},null,2));
const license=path.join(root,'local','NODE_LICENSE.txt');if(!existsSync(license))throw new Error('Falta la licencia del motor Node incluido.');await copyFile(license,path.join(bundle,'runtime','LICENSE.txt'));
const archive=path.join(workspace,'mi-tienda-local.zip');const result=spawnSync('tar',['-a','-cf',archive,'-C',workspace,'MI_TIENDA_LOCAL'],{stdio:'inherit'});if(result.status!==0)throw new Error('No se pudo crear el archivo del programa local.');
console.log('Programa local listo: '+bundle);console.log('Copia portable: '+archive);
