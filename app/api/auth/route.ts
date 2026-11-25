import {NextResponse} from 'next/server';
import {z} from 'zod';
import {applyTokens,authenticated,clearTokens,CloudError,recoveryRedirect,sendRecovery,signIn,signOut,updatePassword,validateOrigin} from '../../../lib/cloud';
import {cloudMode} from '../../../lib/store';
export const runtime='nodejs';
const email=z.email().max(254);
const payload=z.discriminatedUnion('action',[
 z.object({action:z.literal('login'),email,password:z.string().min(1).max(256)}),
 z.object({action:z.literal('recover'),email}),
 z.object({action:z.literal('reset'),password:z.string().min(12).max(256)}),
 z.object({action:z.literal('logout')})
]);
function errorResponse(error:unknown){
 return NextResponse.json({error:error instanceof CloudError?error.message:'No se ha podido completar la solicitud.'},{status:error instanceof CloudError?error.status:400,headers:{'Cache-Control':'no-store'}});
}
export async function GET(req:Request){
 try{
  if(!cloudMode())return NextResponse.json({local:true});
  const hash=z.string().min(5).max(512).parse(new URL(req.url).searchParams.get('token_hash'));
  return await recoveryRedirect(hash);
 }catch(error){return errorResponse(error);}
}
export async function POST(req:Request){
 try{
  if(!cloudMode())return NextResponse.json({local:true});
  validateOrigin(req);
  const raw=await req.text();
  if(raw.length>4096)throw new CloudError(413,'Solicitud demasiado grande.');
  const input=payload.parse(JSON.parse(raw));
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  switch(input.action){
   case 'login': return applyTokens(response,await signIn(input.email,input.password));
   case 'recover': await sendRecovery(input.email);return response;
   case 'reset': await updatePassword(req,input.password);return clearTokens(response);
   case 'logout': {
    try{await signOut((await authenticated(req)).token);}catch(error){if(!(error instanceof CloudError&&error.status===401))throw error;}
    return clearTokens(response);
   }
  }
 }catch(error){return errorResponse(error);}
}
