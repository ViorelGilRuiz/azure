import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {objectives, type PublicQuestion, type Feedback} from './catalog.ts';
import {reinforcement} from './reinforcement.ts';

const learn='https://learn.microsoft.com/es-es/training/modules/';
const modules=['describe-cloud-compute','describe-benefits-use-cloud-services','describe-cloud-service-types','describe-core-architectural-components-of-azure','describe-azure-compute-networking-services','azure-networking-fundamentals','describe-azure-storage-services','describe-azure-identity-access-security','describe-cost-management-azure','describe-features-tools-azure-for-governance-compliance','describe-features-tools-manage-deploy-azure-resources','describe-monitoring-tools-azure'];
const detailed: Record<number,[RegExp,string][]> = {
  5:[[/Private Endpoint/, 'azure/private-link/private-endpoint-overview'],[/[Pp]eering|emparejamiento/, 'azure/virtual-network/virtual-network-peering-overview'],[/ ExpressRoute$/, 'azure/expressroute/expressroute-introduction'],[/Gateway|Punto a sitio/, 'azure/vpn-gateway/vpn-gateway-about-vpngateways']],
  6:[[/^LRS$|^ZRS$|^GZRS$|^GRS$|^RA-GRS$/, 'azure/storage/common/storage-redundancy'],[/^Archive$|^Hot$/, 'azure/storage/blobs/access-tiers-overview'],[/^Azure Files$/, 'azure/storage/files/storage-files-introduction']],
  8:[[/presupuesto/, 'azure/cost-management-billing/costs/tutorial-acm-create-budgets']],
  9:[[/bloqueo/i, 'azure/azure-resource-manager/management/lock-resources'],[/Audit|Iniciativa|Azure Policy/, 'azure/governance/policy/overview']],
  10:[[/^Bicep$/, 'azure/azure-resource-manager/bicep/overview']]
};
const optional = z.string().url().refine(s=>s.startsWith('https://learn.microsoft.com/'));
const definitions:Record<string,string>={
 'iaas':'IaaS ofrece infraestructura. El cliente conserva el control y el mantenimiento del sistema operativo invitado.',
 'paas':'PaaS administra la plataforma de ejecución y deja al cliente el código que despliega.',
 'saas':'SaaS entrega una aplicación lista para usar y configurar.',
 'azure files':'Azure Files ofrece recursos compartidos de archivos, incluidos los que Windows monta por SMB.',
 'azure blob storage':'Azure Blob Storage almacena objetos y se accede a ellos mediante sus interfaces de objetos.',
 'azure queue storage':'Azure Queue Storage conserva mensajes para que otro proceso los consuma.',
 'azure managed disks':'Los discos administrados de Azure proporcionan almacenamiento de bloques a las VM.',
 'archive':'Archive conserva blobs fuera de línea hasta que se rehidratan.',
 'hot':'Hot está pensado para datos consultados frecuentemente.',
 'cool':'Cool está pensado para datos en línea de acceso menos frecuente.',
 'lrs':'LRS mantiene copias en una ubicación física de la región primaria.',
 'zrs':'ZRS distribuye copias entre zonas de una región.',
 'grs':'GRS añade réplica geográfica asíncrona a la redundancia local del primario.',
 'gzrs':'GZRS combina redundancia entre zonas en el primario y replicación geográfica.',
 'azure advisor':'Azure Advisor recomienda mejoras en recursos existentes.',
 'azure service health':'Azure Service Health informa de eventos de la plataforma relevantes para la suscripción.',
 'azure monitor':'Azure Monitor recopila y analiza telemetría de aplicaciones e infraestructura.',
 'log analytics':'Log Analytics consulta registros mediante KQL.',
 'application insights':'Application Insights analiza la telemetría de aplicaciones instrumentadas.',
 'azure policy':'Azure Policy evalúa y controla configuraciones de los recursos.',
 'azure rbac':'Azure RBAC autoriza operaciones mediante roles asignados a identidades en un ámbito.',
 'conditional access':'Conditional Access utiliza señales para decidir las condiciones de acceso a aplicaciones.',
 'azure pricing calculator':'Azure Pricing Calculator estima costes para una configuración hipotética.',
 'azure cost management':'Azure Cost Management analiza costes registrados y permite gestionar presupuestos.'
};
const load=(file:string,reserved:boolean)=>readFileSync(join(process.cwd(),'lib',file),'utf8').trim().split(/\r?\n/).map((row,index)=>{
  const [record,reference,notes]=row.split(' || ');
  const [goal,text,...parts]=record.split('|');
  const objective=z.coerce.number().int().min(0).max(objectives.length-1).parse(goal);
  const explain=parts.pop()!;
  const expand=(s:string)=>s.split(' & ');
  const options=expand(parts[0]);
  const keys=options.map((_,i)=>String(i));
  const choices=options.map((value,i)=>({id:String(i),text:value}));
  for(const part of parts.slice(1)) for(const value of expand(part)) {
    if(!choices.some(choice=>choice.text===value)) choices.push({id:String(choices.length),text:value});
  }
  const specific=detailed[objective]?.find(([pattern])=>pattern.test([5,8,9].includes(objective)?text+' '+options[0]:options[0]))?.[1];
  const moduleUrl=(objective===5?'https://learn.microsoft.com/en-us/training/modules/':learn)+modules[objective]+'/';
  const source=optional.parse(reference||specific?'https://learn.microsoft.com/en-us/'+(reference||specific):moduleUrl);
  const id=(reserved?'az900-eval-':'az900-')+String(index+1).padStart(3,'0');
  const difficulty = keys.length>1 || reference || /¿Pueden|por defecto|Audit|sin replicación|plano de control/.test(text) ? 3 : /^(¿Qué (servicio|herramienta|modelo|recurso|componente|función)|¿Quién)/.test(text) ? 1 : 2;
  const question:PublicQuestion={id,objective,text,choices,count:keys.length,difficulty,type:keys.length>1?'múltiple':choices.length===2?'sí/no':'única'};
  const alternativeNotes=notes?.split(' ~ ');
  if(reference&&(!alternativeNotes||alternativeNotes.length!==choices.length-keys.length||alternativeNotes.some(note=>!note.trim())))throw new Error('Faltan explicaciones de alternativas en '+id);
  const feedback:Feedback={correct:false,keys,explain,source,tip:reinforcement[objective].rule,choices:Object.fromEntries(choices.map(({id,text:label})=>[id,keys.includes(id)?explain:alternativeNotes?.[Number(id)-keys.length]??definitions[label.toLowerCase()]??'La pista decisiva para descartar esta opción: '+explain]))};
  return {question,feedback,reserved,certification:'AZ-900',provenance:'original',reviewed:reserved?'2026-11-25':reference?'2026-11-25':'2026-11-24',validation:'referenciada'};
});
export const bank=load('questions.txt',false);
export const reservedBank=load('reserved.txt',true);
export const allQuestions=[...bank,...reservedBank];

export function validateBank(){
  const titles=new Set<string>(), ids=new Set<string>(), coverage=new Set<number>();
  for(const {question:q,feedback:f} of allQuestions){
    const title=q.text.toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]/gu,'');
    if(!title||ids.has(q.id)||titles.has(title)||q.choices.length<=q.count||!f.explain||f.keys.some(id=>!q.choices.some(c=>c.id===id))) throw new Error('Pregunta inválida: '+q.id);
    ids.add(q.id); titles.add(title); coverage.add(q.objective);
  }
  if(coverage.size!==objectives.length) throw new Error('Objetivos sin cobertura');
  return {questions:ids.size,objectives:coverage.size};
}
export function similarQuestions(threshold=.72){
  const tokens=(text:string)=>new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).filter(word=>word.length>3));
  const list=allQuestions.map(({question:q})=>({q,words:tokens(q.text)}));
  const candidates:{first:string;second:string;similarity:number}[]=[];
  for(const [index,a] of list.entries())for(const b of list.slice(index+1)){
    if(a.q.objective!==b.q.objective)continue;
    const matched=[...a.words].filter(word=>b.words.has(word)).length;
    const union=a.words.size+b.words.size-matched;
    if(union>=5&&matched/union>=threshold)candidates.push({first:a.q.id,second:b.q.id,similarity:Math.round(matched/union*100)/100});
  }
  return candidates.sort((a,b)=>b.similarity-a.similarity);
}
validateBank();
export const byId=new Map(allQuestions.map(item=>[item.question.id,item]));

