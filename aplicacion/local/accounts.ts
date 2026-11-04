import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Identity } from '../lib/server.ts';

const derive=promisify(scrypt);
type Account={id:string;username:string;name:string;email:string;role:string;active:number;salt:string;password_hash:string};
export class LocalAccounts {
 private db:DatabaseSync;
 constructor(path:string){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(username TEXT PRIMARY KEY,failures INTEGER NOT NULL,until_time INTEGER NOT NULL);`);}
 get configured(){return Boolean(this.db.prepare('SELECT 1 FROM accounts LIMIT 1').get());}
 get ownerEmail(){return String(this.db.prepare("SELECT email FROM accounts WHERE role='admin' ORDER BY rowid LIMIT 1").get()?.email||'');}
 async create(input:{username:unknown;name:unknown;password:unknown;role?:unknown},first=false){
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'',name=typeof input.name==='string'?input.name.trim():'';
  if(!/^[a-z0-9._-]{3,32}$/.test(username))throw new Error('El usuario admite de 3 a 32 letras, números, puntos o guiones, sin espacios.');
  if(!name||name.length>100||/[\x00-\x1f]/.test(name))throw new Error('Escribe un nombre de hasta 100 caracteres.');
  if(typeof input.password!=='string'||input.password.length<8||input.password.length>128)throw new Error('La contraseña debe tener entre 8 y 128 caracteres.');
  if(!first&&!['admin','collaborator'].includes(String(input.role)))throw new Error('Selecciona encargado o colaborador.');
  const id=randomUUID(),salt=randomBytes(24).toString('hex'),hash=(await derive(input.password,salt,64)) as Buffer,email=username+'@tienda.local',role=first?'admin':String(input.role);
  this.db.exec('BEGIN IMMEDIATE');try{
   if(first&&this.configured)throw new Error('La tienda ya tiene encargado. Inicia sesión.');
   this.db.prepare('INSERT INTO accounts(id,username,name,email,role,salt,password_hash) VALUES(?,?,?,?,?,?,?)').run(id,username,name,email,role,salt,hash.toString('hex'));this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');if(String((e as Error).message).includes('UNIQUE'))throw new Error('Ese nombre de usuario ya existe.');throw e;}
  return {id,username,name,email,role};
 }
 async login(username:unknown,password:unknown){
  const key=typeof username==='string'?username.toLowerCase().trim():'';if(key.length>32||typeof password!=='string'||password.length>128)throw new Error('Usuario o contraseña incorrectos.');
  const attempt=this.db.prepare('SELECT failures,until_time FROM attempts WHERE username=?').get(key);if(attempt&&Number(attempt.failures)>=8&&Number(attempt.until_time)>Date.now())throw new Error('Hubo varios intentos fallidos. Espera diez minutos antes de reintentar.');
  const account=this.db.prepare('SELECT * FROM accounts WHERE username=? AND active=1').get(key) as Account|undefined;
  const hash=(await derive(password,account?.salt||'mi-tienda-intento-sin-usuario',64)) as Buffer,expected=account?Buffer.from(account.password_hash,'hex'):Buffer.alloc(64);
  if(!account||!timingSafeEqual(hash,expected)){this.db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(username) DO UPDATE SET failures=CASE WHEN until_time<? THEN 1 ELSE failures+1 END,until_time=excluded.until_time').run(key,Date.now()+600000,Date.now());throw new Error('Usuario o contraseña incorrectos.');}
  this.db.prepare('DELETE FROM attempts WHERE username=?').run(key);this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex');this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),account.id,Date.now()+12*60*60*1000);return {token,account};
 }
 session(cookie:string):{identity:Identity;role:string}|null{
  const token=cookie.match(/(?:^|;\s*)mi_tienda_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;
  const row=this.db.prepare('SELECT a.* FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires>? AND a.active=1').get(createHash('sha256').update(token).digest('hex'),Date.now()) as Account|undefined;
  return row?{identity:{userId:row.id,email:row.email,displayName:row.name},role:row.role}:null;
 }
 logout(cookie:string){const token=cookie.match(/(?:^|;\s*)mi_tienda_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(createHash('sha256').update(token).digest('hex'));}
 close(){this.db.close();}
}
