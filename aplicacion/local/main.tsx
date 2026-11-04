import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';

function LocalApp(){
 const [info,setInfo]=useState<{configured:boolean;authenticated:boolean}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[username,setUsername]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState('');
 async function refresh(){const response=await fetch('/local/info',{cache:'no-store'});if(!response.ok)throw new Error('No se pudo abrir la tienda local.');setInfo(await response.json() as {configured:boolean;authenticated:boolean});}
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{const response=await fetch(info?.configured?'/local/login':'/local/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,name,password})}),value=await response.json() as {error?:string};if(!response.ok)throw new Error(value.error||'No se pudo entrar.');setPassword('');await refresh();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{let active=true;void fetch('/local/info',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('No se pudo abrir la tienda local.');return r.json();}).then(value=>{if(active)setInfo(value as {configured:boolean;authenticated:boolean});}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[]);
 if(info?.authenticated)return <Home localMode/>;
 return <main className="local-access panel"><p className="eyebrow">MI TIENDA · EN ESTE COMPUTADOR</p><h1>{info?.configured?'Entrar a tu tienda':'Preparar tu tienda local'}</h1><p>{info?.configured?'Usa tu cuenta local. No necesitas iniciar sesión en ChatGPT.':'Crea la cuenta del encargado. La base de datos y los archivos se guardarán en este computador.'}</p>{error&&<p className="local-error" role="alert">{error}</p>}{!info&&!error?<p>Abriendo la aplicación…</p>:<form onSubmit={e=>void submit(e)}>{!info?.configured&&<label className="field"><span>Tu nombre</span><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>}<label className="field"><span>Usuario</span><input autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={e=>setUsername(e.target.value)}/></label><label className="field"><span>Contraseña{!info?.configured?' · mínimo 8 caracteres':''}</span><input type="password" autoComplete={info?.configured?'current-password':'new-password'} required minLength={info?.configured?1:8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button primary" disabled={busy||!info}>{busy?'Abriendo…':info?.configured?'Entrar':'Crear cuenta y abrir tienda'}</button></form>}<p className="small-muted">Puedes trabajar sin internet. Gemini es opcional y requiere tu autorización para enviar documentos a Google.</p></main>;
}
createRoot(document.getElementById('root')!).render(<LocalApp/>);
