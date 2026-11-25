import {NextResponse} from 'next/server';
import {cloudConfig} from '../../../lib/cloud';
import {cloudMode} from '../../../lib/store';
export const dynamic='force-dynamic';
export function GET(){
 const cloud=cloudMode();
 try{
  if(cloud)cloudConfig();
  return NextResponse.json({status:'configuration-ready',mode:cloud?'cloud':'local'},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return NextResponse.json({status:'configuration-missing',mode:'cloud'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
