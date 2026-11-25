import {NextResponse} from 'next/server';
import {z} from 'zod';
import {backupProgress,cardRating,change,dashboard,exportProgress,exportReport,importProgress,mutation,rateCard,settingsSchema,start,startSchema,updateSettings,view} from '../../../lib/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const requestSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('start'),value:startSchema}),
  z.object({action:z.literal('change'),value:mutation}),
  z.object({action:z.literal('settings'),value:settingsSchema}),
  z.object({action:z.literal('card'),value:cardRating}),
  z.object({action:z.literal('import'),value:z.unknown()})
]);
const errorReply=(error:unknown)=>NextResponse.json({error:error instanceof z.ZodError?'Los datos no tienen el formato esperado.':error instanceof Error?error.message:'No se pudo completar la operación.'},{status:400});
export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams;
    if(params.has('backup'))return new Response(new Uint8Array(await backupProgress()),{headers:{'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="azure-exam-lab.sqlite"'}});
    if(params.has('export'))return NextResponse.json(exportProgress(),{headers:{'Content-Disposition':'attachment; filename="azure-exam-lab.json"'}});
    if(params.has('csv'))return new Response('\ufeff'+exportReport(),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="azure-exam-lab-informe.csv"'}});
    if(params.has('id'))return NextResponse.json(view(z.uuid().parse(params.get('id'))));
    return NextResponse.json(dashboard());
  }catch(error){return errorReply(error);}
}
export async function POST(req:Request){
  try{
    const origin=req.headers.get('origin');
    if(origin&&new URL(origin).host!==req.headers.get('host'))return NextResponse.json({error:'Origen no permitido.'},{status:403});
    const parsed=requestSchema.parse(await req.json());
    switch(parsed.action){
      case 'start': return NextResponse.json(start(parsed.value));
      case 'change': return NextResponse.json(change(parsed.value));
      case 'settings': updateSettings(parsed.value);break;
      case 'card': rateCard(parsed.value);break;
      case 'import': importProgress(parsed.value);break;
    }
    return NextResponse.json(dashboard());
  }catch(error){return errorReply(error);}
}

