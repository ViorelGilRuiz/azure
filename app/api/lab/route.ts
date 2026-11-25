import {NextResponse} from 'next/server';
import {z} from 'zod';
import {backupProgress,cardRating,change,cloudMode,dashboard,exportProgress,exportReport,importProgress,mutation,rateCard,settingsSchema,start,startSchema,updateSettings,view} from '../../../lib/store';
import {applyTokens,CloudError,cloudProgress,validateOrigin} from '../../../lib/cloud';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const requestSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('start'),value:startSchema}),
  z.object({action:z.literal('change'),value:mutation}),
  z.object({action:z.literal('settings'),value:settingsSchema}),
  z.object({action:z.literal('card'),value:cardRating}),
  z.object({action:z.literal('import'),value:z.unknown()})
]);
const noStore={'Cache-Control':'private, no-store'};
const errorReply=(error:unknown)=>NextResponse.json({error:error instanceof CloudError?error.message:error instanceof z.ZodError?'Los datos no tienen el formato esperado.':error instanceof Error?error.message:'No se pudo completar la operación.'},{status:error instanceof CloudError?error.status:400,headers:noStore});
function read(params:URLSearchParams){
  if(params.has('backup'))throw new CloudError(404,'En producción, usa la exportación JSON.');
  if(params.has('export'))return NextResponse.json(exportProgress(),{headers:{...noStore,'Content-Disposition':'attachment; filename="azure-exam-lab.json"'}});
  if(params.has('csv'))return new NextResponse('\ufeff'+exportReport(),{headers:{...noStore,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="azure-exam-lab-informe.csv"'}});
  if(params.has('id'))return NextResponse.json(view(z.uuid().parse(params.get('id'))),{headers:noStore});
  return NextResponse.json({...dashboard(),cloud:cloudMode()},{headers:noStore});
}
export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams;
    if(cloudMode()){
      const result=await cloudProgress(req,()=>read(params));
      return applyTokens(result.value,result.tokens);
    }
    if(params.has('backup'))return new Response(new Uint8Array(await backupProgress()),{headers:{...noStore,'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="azure-exam-lab.sqlite"'}});
    return read(params);
  }catch(error){return errorReply(error);}
}
function write(raw:string){
    const parsed=requestSchema.parse(JSON.parse(raw));
    switch(parsed.action){
      case 'start': return NextResponse.json(start(parsed.value),{headers:noStore});
      case 'change': return NextResponse.json(change(parsed.value),{headers:noStore});
      case 'settings': updateSettings(parsed.value);break;
      case 'card': rateCard(parsed.value);break;
      case 'import': importProgress(parsed.value);break;
    }
    return NextResponse.json({...dashboard(),cloud:cloudMode()},{headers:noStore});
}
export async function POST(req:Request){
  try{
    const cloud=cloudMode();
    const origin=req.headers.get('origin');
    if(cloud)validateOrigin(req);
    else if(origin&&new URL(origin).host!==req.headers.get('host'))throw new CloudError(403,'Origen no permitido.');
    const raw=await req.text();
    if(raw.length>8*1024*1024)throw new CloudError(413,'El archivo supera el límite de importación.');
    if(cloud){
      const result=await cloudProgress(req,()=>write(raw));
      return applyTokens(result.value,result.tokens);
    }
    return write(raw);
  }catch(error){return errorReply(error);}
}

