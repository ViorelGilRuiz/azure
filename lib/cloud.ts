import {z} from 'zod';
import {NextResponse} from 'next/server';
import {withProgress} from './store';

export class CloudError extends Error {
 constructor(readonly status:number,message:string){super(message);}
}
export function cloudConfig(){
 const origin=process.env.AZURE_PUBLIC_ORIGIN;
 const endpoint=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!origin||!endpoint||!key)throw new CloudError(503,'Falta configurar el acceso seguro de producción.');
 const supabase=new URL(endpoint), site=new URL(origin);
 if(supabase.protocol!=='https:'||site.protocol!=='https:'||site.origin!==origin||supabase.origin!==endpoint)throw new CloudError(503,'La configuración HTTPS de producción es inválida.');
 return {origin,endpoint,key};
}
const accessName='__Host-azure-access',refreshName='__Host-azure-refresh',recoveryName='__Host-azure-recovery';
const cookieOptions={secure:true,httpOnly:true,sameSite:'strict' as const,path:'/'};
const tokenSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().int().positive()});
type Tokens=z.infer<typeof tokenSchema>;
function cookie(req:Request,name:string){
 return req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
}
async function supabase(path:string,{token,method='GET',body}:{token?:string;method?:string;body?:unknown}={}){
 const {endpoint,key}=cloudConfig();
 try{
  return await fetch(endpoint+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},cache:'no-store',signal:AbortSignal.timeout(10000)});
 }catch{throw new CloudError(503,'El servicio de acceso o progreso no responde.');}
}
export function validateOrigin(req:Request){
 if(req.headers.get('origin')!==cloudConfig().origin)throw new CloudError(403,'Origen no permitido.');
}
export function applyTokens(response:NextResponse,tokens?:Tokens){
 if(tokens){
  response.cookies.set(accessName,tokens.access_token,{...cookieOptions,maxAge:Math.min(3600,tokens.expires_in)});
  response.cookies.set(refreshName,tokens.refresh_token,{...cookieOptions,maxAge:30*86400});
 }
 return response;
}
export function clearTokens(response:NextResponse){
 for(const key of [accessName,refreshName,recoveryName])response.cookies.set(key,'',{...cookieOptions,maxAge:0});
 return response;
}
export async function signIn(email:string,password:string){
 const res=await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
 if(res.status===429)throw new CloudError(429,'Demasiados intentos. Espera antes de probar de nuevo.');
 if(!res.ok)throw new CloudError(res.status>=500?503:401,'No se ha podido iniciar sesión.');
 return tokenSchema.parse(await res.json());
}
export async function sendRecovery(email:string){
 const {origin}=cloudConfig();
 const res=await supabase('/auth/v1/recover?redirect_to='+encodeURIComponent(origin+'/api/auth'),{method:'POST',body:{email}});
 if(res.status===429)throw new CloudError(429,'Espera antes de volver a solicitar recuperación.');
 if(res.status>=500)throw new CloudError(503,'No se ha podido solicitar la recuperación.');
}
export async function recoveryRedirect(tokenHash:string){
 const {origin}=cloudConfig();
 const res=await supabase('/auth/v1/verify',{method:'POST',body:{type:'recovery',token_hash:tokenHash}});
 if(!res.ok)throw new CloudError(400,'El enlace de recuperación no es válido o ha caducado.');
 const tokens=tokenSchema.parse(await res.json());
 const response=NextResponse.redirect(origin+'/?recovery=1',303);
 clearTokens(response);
 response.cookies.set(recoveryName,tokens.access_token,{...cookieOptions,maxAge:Math.min(tokens.expires_in,600)});
 response.headers.set('Referrer-Policy','no-referrer');
 return response;
}
export async function updatePassword(req:Request,password:string){
 const token=cookie(req,recoveryName);
 if(!token)throw new CloudError(401,'Abre primero el enlace de recuperación.');
 const res=await supabase('/auth/v1/user',{token,method:'PUT',body:{password}});
 if(!res.ok)throw new CloudError(res.status>=500?503:400,'No se ha podido cambiar la contraseña.');
 await signOut(token);
}
export async function signOut(token?:string){
 if(token)await supabase('/auth/v1/logout?scope=local',{token,method:'POST'});
}
export async function authenticated(req:Request){
 const access=cookie(req,accessName);
 if(access){
  const res=await supabase('/auth/v1/user',{token:access});
  if(res.ok)return {token:access,tokens:undefined};
  if(res.status>=500)throw new CloudError(503,'No se ha podido verificar tu sesión.');
 }
 const refresh=cookie(req,refreshName);
 if(!refresh)throw new CloudError(401,'Inicia sesión para acceder a tu progreso.');
 const res=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});
 if(!res.ok)throw new CloudError(res.status>=500?503:401,'Tu sesión ha caducado.');
 const tokens=tokenSchema.parse(await res.json());
 return {token:tokens.access_token,tokens};
}
const rowSchema=z.object({revision:z.number().int().nonnegative(),progress:z.unknown()});
export async function cloudProgress<T>(req:Request,action:()=>T){
 const {token,tokens}=await authenticated(req);
 for(let attempt=0;attempt<3;attempt++){
  const result=await supabase('/rest/v1/azure_progress?select=revision,progress&limit=2',{token});
  if(!result.ok)throw new CloudError(503,'El almacenamiento de progreso no está disponible.');
  const [row]=z.array(rowSchema).max(1).parse(await result.json());
  const state=withProgress(row?.progress??null,action);
  if(!state.dirty)return {value:state.returned,tokens};
  const saved=await supabase('/rest/v1/rpc/azure_save_progress',{method:'POST',token,body:{expected_revision:row?.revision??0,new_progress:state.progress}});
  if(!saved.ok)throw new CloudError(503,'No se pudo guardar el progreso.');
  if(await saved.json()===true)return {value:state.returned,tokens};
 }
 throw new CloudError(409,'El progreso cambió en otro dispositivo. Vuelve a intentarlo.');
}
