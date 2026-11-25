'use client';
import {useState} from 'react';
export function Account({onSignedIn}:{onSignedIn:()=>Promise<void>}){
 const [mode,setMode]=useState(()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('recovery')?'reset':'login');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 return <section className="panel form-panel account">
 <h1>{mode==='login'?'Iniciar sesión':mode==='recover'?'Recuperar acceso':'Cambiar contraseña'}</h1>
 <p>Acceso privado a tu progreso de Azure Exam Lab.</p>
 <form onSubmit={async e=>{
  e.preventDefault();setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:mode,email,password})});
   const data=await r.json();
   if(!r.ok)throw Error(data.error);
   if(mode==='login')await onSignedIn();
   else if(mode==='reset'){setMode('login');setPassword('');setMessage('Contraseña cambiada. Inicia sesión.');}
   else setMessage('Si la cuenta existe, recibirás un correo con las instrucciones.');
  }catch(error){setMessage(error instanceof Error?error.message:'No se ha podido completar la solicitud.');}
  finally{setBusy(false);}
 }}>
 {mode!=='reset'&&<label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></label>}
 {mode!=='recover'&&<label>{mode==='reset'?'Nueva contraseña':'Contraseña'}<input type="password" autoComplete={mode==='reset'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='reset'?12:1} maxLength={256}/></label>}
 <button className="primary" disabled={busy}>{mode==='login'?'Entrar':mode==='recover'?'Enviar recuperación':'Guardar contraseña'}</button>
 </form>
 <button className="ghost" onClick={()=>{setPassword('');setMessage('');setMode(mode==='login'?'recover':'login');}}>{mode==='login'?'He olvidado la contraseña':'Volver al inicio de sesión'}</button>
 {message&&<p role="status">{message}</p>}
 </section>;
}

