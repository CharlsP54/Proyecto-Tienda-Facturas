import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';

/** Adaptador SQLite real en este computador; no se conecta a Cloudflare. */
export class LocalDatabase {
 sqlite:DatabaseSync;
 constructor(path:string){this.sqlite=new DatabaseSync(path);this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
 prepare(sql:string){return new LocalStatement(this,sql);}
 async batch(statements:LocalStatement[]){
  this.sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{if(s.owner!==this)throw new Error('Consulta de otra base de datos.');return s.execute();});this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}
 }
 async exec(sql:string){this.sqlite.exec(sql);return {count:1,duration:0};}
 asD1(){return this as unknown as D1Database;}
 close(){this.sqlite.close();}
}
class LocalStatement {
 owner:LocalDatabase;private sql:string;private values:SQLInputValue[]=[];
 constructor(owner:LocalDatabase,sql:string){this.owner=owner;this.sql=sql;}
 bind(...values:unknown[]){const bound=new LocalStatement(this.owner,this.sql);bound.values=values.map(v=>{
   if(v===null||typeof v==='string'||typeof v==='bigint'||typeof v==='number')return v;
   if(typeof v==='boolean')return v?1:0;if(v instanceof Uint8Array)return v;throw new Error('Parámetro de base de datos no admitido.');
  });return bound;}
 execute(){const statement=this.owner.sqlite.prepare(this.sql),columns=statement.columns();let results:Record<string,unknown>[]=[],changes=0,lastRowId=0;
  if(columns.length){results=statement.all(...this.values);}else{const result=statement.run(...this.values);changes=Number(result.changes);lastRowId=Number(result.lastInsertRowid);}
  return {success:true,results,meta:{changes,last_row_id:lastRowId,duration:0,rows_read:results.length,rows_written:changes,changed_db:changes>0,size_after:0}};
 }
 async all<T=Record<string,unknown>>(){return this.execute() as {success:true;results:T[];meta:ReturnType<LocalStatement['execute']>['meta']};}
 async first<T=Record<string,unknown>>(column?:string):Promise<T|null>{const row=this.execute().results[0];return (row?(column?row[column]:row):null) as T|null;}
 async run(){return this.execute();}
 async raw(){return this.execute().results.map(r=>Object.values(r));}
}
export async function migrateLocal(db:LocalDatabase,directory:string){
 db.sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)');
 for(const name of (await readdir(directory)).filter(f=>/^\d+_.+\.sql$/.test(f)).sort()){
  const sql=await readFile(join(directory,name),'utf8'),sha=createHash('sha256').update(sql).digest('hex');
  const existing=db.sqlite.prepare('SELECT sha256 FROM _local_migrations WHERE name=?').get(name);
  if(existing){if(existing.sha256!==sha)throw new Error(`La migración ${name} cambió. Se detuvo el inicio para proteger los datos.`);continue;}
  db.sqlite.exec('BEGIN IMMEDIATE');try{db.sqlite.exec(sql);db.sqlite.prepare('INSERT INTO _local_migrations VALUES(?,?,?)').run(name,sha,new Date().toISOString());db.sqlite.exec('COMMIT');}catch(e){db.sqlite.exec('ROLLBACK');throw e;}
 }
}
type Metadata={key:string;size:number;uploaded:string;etag:string;httpMetadata:{contentType?:string}};
/** Originales y copias en archivos locales, con escrituras por reemplazo atómico. */
export class LocalBucket {
 private directory:string;
 constructor(directory:string){this.directory=directory;}
 private paths(key:string){if(!key||key.length>1000)throw new Error('Identificador de archivo inválido.');const hash=createHash('sha256').update(key).digest('hex'),directory=join(this.directory,hash.slice(0,2));return {directory,file:join(directory,hash+'.bin'),meta:join(directory,hash+'.json')};}
 async head(key:string){const p=this.paths(key);try{const meta=JSON.parse(await readFile(p.meta,'utf8')) as Metadata;const info=await stat(p.file);if(info.size!==meta.size)throw new Error('Un original local cambió fuera de la aplicación.');return {key:meta.key,size:meta.size,etag:meta.etag,uploaded:new Date(meta.uploaded),httpMetadata:meta.httpMetadata};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 async get(key:string){const meta=await this.head(key);if(!meta)return null;const file=this.paths(key).file;return {...meta,body:Readable.toWeb(createReadStream(file)),arrayBuffer:async()=>{const data=await readFile(file);return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);},text:()=>readFile(file,'utf8'),json:async()=>JSON.parse(await readFile(file,'utf8')) as unknown};}
 async put(key:string,value:string|Uint8Array|ArrayBuffer,options?:{httpMetadata?:{contentType?:string}}){
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value instanceof Uint8Array?value:new Uint8Array(value),p=this.paths(key),temporary=p.file+'.'+randomUUID()+'.tmp';
  await mkdir(p.directory,{recursive:true});const meta:Metadata={key,size:bytes.length,uploaded:new Date().toISOString(),etag:createHash('sha256').update(bytes).digest('hex'),httpMetadata:options?.httpMetadata||{}};
  const tmpMeta=p.meta+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,bytes);await writeFile(tmpMeta,JSON.stringify(meta),'utf8');await rename(temporary,p.file);await rename(tmpMeta,p.meta);}finally{await unlink(temporary).catch(()=>{});await unlink(tmpMeta).catch(()=>{});}return meta;
 }
 async delete(keys:string|string[]){for(const key of typeof keys==='string'?[keys]:keys){const p=this.paths(key);await unlink(p.meta).catch(e=>{if(e.code!=='ENOENT')throw e;});await unlink(p.file).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
 async list(options:{prefix?:string;limit?:number;cursor?:string}={}){
  const keys:Metadata[]=[];await mkdir(this.directory,{recursive:true});
  for(const shard of await readdir(this.directory,{withFileTypes:true})){if(!shard.isDirectory()||!/^[a-f0-9]{2}$/.test(shard.name))continue;for(const name of await readdir(join(this.directory,shard.name))){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;const meta=JSON.parse(await readFile(join(this.directory,shard.name,name),'utf8')) as Metadata;if(meta.key.startsWith(options.prefix||'')&&(!options.cursor||meta.key>options.cursor))keys.push(meta);}}
  keys.sort((a,b)=>a.key.localeCompare(b.key));const limit=Math.min(1000,options.limit||1000),page=keys.slice(0,limit);return {objects:page.map(m=>({...m,uploaded:new Date(m.uploaded)})),truncated:keys.length>limit,cursor:keys.length>limit?page.at(-1)?.key:undefined,delimitedPrefixes:[]};
 }
 asR2(){return this as unknown as R2Bucket;}
}
