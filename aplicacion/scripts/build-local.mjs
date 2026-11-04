import { build } from 'vite';
import { mkdir, cp, copyFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({configFile:path.join(root,'vite.local.config.ts')});
const server=path.resolve(root,'dist-local/server');if(path.dirname(server)!==path.resolve(root,'dist-local'))throw new Error('Destino de compilación inválido.');
try {
  await rm(server,{recursive:true,force:true,maxRetries:5,retryDelay:200});
} catch {
  // Tolerancia para OneDrive en Windows
}
await mkdir(server,{recursive:true});
await writeFile(path.join(server,'package.json'),JSON.stringify({type:'module'}));
for(const directory of ['lib','drizzle'])await cp(path.join(root,directory),path.join(server,directory),{recursive:true});
await mkdir(path.join(server,'local'),{recursive:true});for(const file of ['server.ts','storage.ts','accounts.ts'])await copyFile(path.join(root,'local',file),path.join(server,'local',file));
console.log('Versión local compilada. No necesita un alojamiento ni una base de datos externos.');
