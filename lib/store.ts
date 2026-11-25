import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync,readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {drizzle} from 'drizzle-orm/node-sqlite';
import {eq} from 'drizzle-orm';
import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
import {z} from 'zod';
import {bank,byId,reservedBank,similarQuestions} from './bank';
import {causes,dateKey,defaults,domainOf,objectives,percent,TEST_SIZE,type Mode,type Settings,type Session} from './catalog';
import {dailyRandom,dueWeight,intervals,quotas,score,shuffle,spaced,summarize,type Evidence} from './engine';
import {cards,coverageMap} from './academy';
import {coachingBudget,dailyPlan,masteryEvidence,recoveredObjectives,reviewCard,type CardReview} from './learning';
import {examEvidence,independentSelection} from './exams';

export const settingsSchema=z.object({target:z.iso.date(),minutes:z.union([z.literal(10),z.literal(15),z.literal(20),z.literal(30),z.literal(45),z.literal(60),z.literal(90)]),theme:z.enum(['light','dark'])});
const reflectionSchema=z.number().int().min(0).max(4);
const causeSchema=z.number().int().min(0).max(causes.length-1);
const storedAnswer=z.object({choice:z.array(z.string()),confidence:z.number().int().min(0).max(3),seconds:z.number().int().min(0).max(3600),at:z.number().int().positive().optional(),reflection:reflectionSchema.optional(),cause:causeSchema.optional()});
const modeSchema=z.enum(['initial','quick','domain','mock','adaptive','review','daily','timed','survival']);
const examKindSchema=z.enum(['independent','mixed','repeat','diagnostic']);
const sessionSchema=z.object({id:z.uuid(),mode:modeSchema,examKind:examKindSchema.optional(),questions:z.array(z.object({id:z.string(),choices:z.array(z.object({id:z.string()}))})).min(1).max(50),answers:z.record(z.string(),storedAnswer),flags:z.array(z.string()),position:z.number().int().min(0),started:z.number().int().positive(),deadline:z.number().int().positive().nullable(),finished:z.number().int().positive().nullable()});
export const cardRating=z.object({id:z.number().int().min(0).max(cards.length-1),rating:z.number().int().min(0).max(3),request:z.uuid()});
const reviewRecord=cardRating.extend({at:z.number().int().positive(),due:z.number().int().positive(),step:z.number().int().min(0).max(5)});
const snapshots=z.object({version:z.union([z.literal(1),z.literal(2)]),settings:settingsSchema,sessions:z.array(sessionSchema).max(20000),reviews:z.array(reviewRecord).max(100000).optional()});
const sessions=sqliteTable('exam_session',{id:text().primaryKey(),payload:text().notNull()});
const config=sqliteTable('study_settings',{id:integer().primaryKey(),payload:text().notNull()});
const data=process.env.AZURE_EXAM_DATA || join(process.cwd(),'data');
export const cloudMode=()=>process.env.AZURE_DEPLOYMENT==='cloud'||process.env.NETLIFY==='true'||!!process.env.AWS_LAMBDA_FUNCTION_NAME;
export type Progress={version:2;settings:Settings;sessions:Session[];reviews:(CardReview & {request:string})[]};
const requestStore=new AsyncLocalStorage<{progress:Progress;dirty:boolean}>();
export function withProgress<T>(value:unknown,operation:()=>T){
  const state={progress:{version:2,settings:{...defaults},sessions:[],reviews:[]} as Progress,dirty:false};
  return requestStore.run(state,()=>{
    if(value!==null){importProgress(value);state.dirty=false;}
    const returned=operation();
    return {returned,...state};
  });
}
function database(){
  if(cloudMode())throw new Error('SQLite local no está disponible en producción.');
  mkdirSync(data,{recursive:true});
  const sqlite=new DatabaseSync(join(data,'progress.sqlite'));
  sqlite.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  if(Number(sqlite.prepare('PRAGMA user_version').get()?.user_version)<2){
    sqlite.exec('BEGIN IMMEDIATE');
    try{
      sqlite.exec('CREATE TABLE IF NOT EXISTS exam_session (id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS study_settings (id INTEGER PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS card_review (request TEXT PRIMARY KEY,id INTEGER NOT NULL,rating INTEGER NOT NULL,at INTEGER NOT NULL,step INTEGER NOT NULL,due INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS card_review_latest ON card_review (id,at DESC);');
      if(Number(sqlite.prepare('PRAGMA user_version').get()?.user_version)<2){
        const current=sqlite.prepare('SELECT payload FROM study_settings WHERE id=1').get();
        if(current){
          const value=JSON.parse(String(current.payload)) as Settings;
          if(value.target==='2027-01-20')value.target=defaults.target;
          if(value.minutes===30)value.minutes=defaults.minutes;
          sqlite.prepare('UPDATE study_settings SET payload=? WHERE id=1').run(JSON.stringify(value));
        }
        sqlite.exec('PRAGMA user_version=2');
      }
      sqlite.exec('COMMIT');
    }catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
  return {sqlite,orm:drizzle({client:sqlite})};
}
const globalDb=globalThis as typeof globalThis & {azureExamDb?:ReturnType<typeof database>};
const connection=()=>globalDb.azureExamDb ??= database();
const reviews=()=>requestStore.getStore()?.progress.reviews??connection().sqlite.prepare('SELECT request,id,rating,at,step,due FROM card_review ORDER BY at,rowid').all() as (CardReview & {request:string})[];
function saveReview(review:CardReview & {request:string}){
  const state=requestStore.getStore();
  if(state){if(!state.progress.reviews.some(r=>r.request===review.request)){state.progress.reviews.push(review);state.dirty=true;}return;}
  connection().sqlite.prepare('INSERT INTO card_review (request,id,rating,at,step,due) VALUES (?,?,?,?,?,?) ON CONFLICT(request) DO NOTHING').run(review.request,review.id,review.rating,review.at,review.step,review.due);
}
function transaction<T>(fn:()=>T){
  if(requestStore.getStore())return fn();
  const {sqlite}=connection();
  sqlite.exec('BEGIN IMMEDIATE');
  try{const value=fn();sqlite.exec('COMMIT');return value;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
}
export function rateCard({id,rating,request}:z.infer<typeof cardRating>){
  transaction(()=>{
    const previous=reviews().filter(r=>r.id===id).sort((a,b)=>b.at-a.at).at(0);
    saveReview({...reviewCard(id,rating,Date.now(),previous),request});
  });
}
const deferred=(mode:Mode)=>mode==='mock'||mode==='initial';
const reviewCandidates=similarQuestions().length;
function save(s:Session){
  const state=requestStore.getStore();
  if(state){
    const index=state.progress.sessions.findIndex(row=>row.id===s.id);
    if(index<0)state.progress.sessions.push(s);else state.progress.sessions[index]=s;
    state.dirty=true;
    return;
  }
  const payload=JSON.stringify(s);
  connection().orm.insert(sessions).values({id:s.id,payload}).onConflictDoUpdate({target:sessions.id,set:{payload}}).run();
}
const all=()=>requestStore.getStore()?.progress.sessions??connection().orm.select().from(sessions).all().map(row=>JSON.parse(row.payload) as Session);
const settings=():Settings=>requestStore.getStore()?.progress.settings??JSON.parse(connection().orm.select().from(config).where(eq(config.id,1)).get()?.payload??JSON.stringify(defaults));
export function updateSettings(value:Settings){
  const payload=JSON.stringify(settingsSchema.parse(value));
  const state=requestStore.getStore();
  if(state){state.progress.settings=JSON.parse(payload);state.dirty=true;return;}
  connection().orm.insert(config).values({id:1,payload}).onConflictDoUpdate({target:config.id,set:{payload}}).run();
}
function grade(s:Session,qid:string){
  const a=s.answers[qid], item=byId.get(qid);
  if(!a||!item)return;
  const candidates=bank.filter(entry=>entry.question.id!==qid&&entry.question.objective===item.question.objective);
  const related=candidates.find(entry=>entry.question.difficulty>=2&&!s.questions.some(q=>q.id===entry.question.id))??candidates.find(entry=>!s.answers[entry.question.id])??candidates[0];
  return {...item.feedback,correct:score(a.choice,item.feedback.keys,item.question.type==='ordenación'),related:related?.question.id};
}
function result(s:Session){return percent(s.questions.filter(q=>grade(s,q.id)?.correct).length,s.questions.length);}
function settle(s:Session,now=Date.now()){
  if(!s.finished&&s.deadline&&now>=s.deadline){s.finished=s.deadline;save(s);}
  return s;
}
function snapshot(s:Session):Session{
  const skipped=s.finished?Object.fromEntries(s.questions.filter(q=>!s.answers[q.id]).map(q=>[q.id,byId.get(q.id)!.feedback])):undefined;
  const answers=Object.fromEntries(Object.entries(s.answers).map(([id,a])=>[id,{...a,feedback:s.finished||!deferred(s.mode)?grade(s,id):undefined}]));
  if(!s.finished)return {...s,answers};
  const earlier=all().filter(t=>t.id!==s.id&&t.started<s.started);
  const seen=new Set(earlier.flatMap(t=>Object.keys(t.answers)));
  const comparison=earlier.filter(t=>t.mode===s.mode&&t.finished&&t.finished<=s.started&&t.questions.length===s.questions.length).sort((a,b)=>b.finished!-a.finished!)[0];
  const breakdown=(values:number[],index:(q:Session['questions'][number])=>number)=>values.map(i=>{
    const questions=s.questions.filter(q=>index(q)===i);
    return {index:i,total:questions.length,correct:questions.filter(q=>answers[q.id]?.feedback?.correct).length};
  }).filter(row=>row.total);
  const objectivesReport=breakdown(objectives.map((_,i)=>i),q=>q.objective);
  const failures=Object.entries(answers).filter(([,a])=>!a.feedback?.correct);
  const report={unanswered:s.questions.length-Object.keys(answers).length,previous:comparison?result(comparison):null,firstSeen:s.questions.filter(q=>answers[q.id]&&!seen.has(q.id)).length,overconfidence:failures.filter(([,a])=>a.confidence===3).length,guesses:Object.values(answers).filter(a=>a.feedback?.correct&&(a.confidence<2||a.reflection===2||a.reflection===3)).length,recurring:failures.filter(([id])=>earlier.some(t=>t.answers[id]&&!grade(t,id)?.correct)).length,causes:causes.map((_,index)=>({index,count:failures.filter(([,a])=>a.cause===index).length})).filter(c=>c.count),domains:breakdown([0,1,2],q=>domainOf(q.objective)),objectives:objectivesReport,weak:objectivesReport.filter(o=>o.correct<o.total).sort((a,b)=>a.correct/a.total-b.correct/b.total).map(o=>o.index)};
  return {...s,skipped,report,answers};
}
function history(list:Session[]){
  const mastery=new Map<string,{step:number;due:number;last:number;correct:boolean;confidence:number;failed:boolean;attempts:number}>();
  const rows:(Evidence & {choice:string[]})[]=[];
  for(const s of [...list].sort((a,b)=>a.started-b.started)){
    if(deferred(s.mode)&&!s.finished)continue;
    for(const q of s.questions){
      const a=s.answers[q.id],feedback=grade(s,q.id);
      if(!a||!feedback)continue;
      const last=a.at??s.finished??s.started, old=mastery.get(q.id);
      const confidence=a.reflection===2||a.reflection===3||a.reflection===4?0:a.confidence;
      const step=spaced(old?.step??-1,feedback.correct,confidence,!old||dateKey(old.last)!==dateKey(last));
      mastery.set(q.id,{step:Math.max(0,step),due:last+intervals[Math.max(0,step)]*86400000,last,correct:feedback.correct,confidence,failed:!feedback.correct||!!old?.failed,attempts:(old?.attempts??0)+1});
      rows.push({correct:feedback.correct,objective:q.objective,started:last,mode:s.mode,id:q.id,confidence,seconds:a.seconds,difficulty:q.difficulty,sessionId:s.id,choice:a.choice});
    }
  }
  return {rows:rows.reverse().sort((a,b)=>b.started-a.started),mastery};
}
export function dashboard(){
  const list=all().map(s=>settle(s)).sort((a,b)=>(b.finished??0)-(a.finished??0));
  const {rows,mastery}=history(list);
  const due=[...mastery.values()].filter(m=>m.due<=Date.now()).length;
  const now=Date.now(), profile=settings();
  const cardState=new Map(reviews().map(r=>[r.id,r]));
  const cardQueue=cards.map(card=>({id:card.id,due:cardState.get(card.id)?.due??null})).filter(card=>card.due===null||card.due<=now).sort((a,b)=>(a.due??Infinity)-(b.due??Infinity));
  const distinct=new Set<string>(), independent=new Set<string>();
  for(const s of [...list].sort((a,b)=>a.started-b.started)){
    const questions=s.questions.map(q=>examItems.get(q.id)!);
    if(s.mode==='mock'&&examEvidence(questions,s.examKind,distinct))independent.add(s.id);
    questions.forEach(q=>distinct.add(q.family));
  }
  const stats=summarize(rows.map(row=>({...row,independent:!!row.sessionId&&independent.has(row.sessionId)})),list.filter(s=>s.finished).map(s=>({mode:s.mode,score:result(s),finished:s.finished!,count:s.questions.length,independent:independent.has(s.id),onTime:!!s.deadline&&s.finished!<=s.deadline&&Object.keys(s.answers).length===s.questions.length})),due,[...mastery.values()].filter(m=>m.step>=2&&m.correct).length);
  const map=coverageMap.map(coverage=>{
    const evidence=masteryEvidence(rows.filter(r=>r.objective===coverage.objective),now);
    const dueDates=bank.filter(q=>q.question.objective===coverage.objective).flatMap(q=>mastery.get(q.question.id)?.due??[]);
    return {...coverage,...evidence,next:dueDates.length?Math.min(...dueDates):null,questions:bank.filter(q=>q.question.objective===coverage.objective).length};
  });
  const plan={...dailyPlan(profile.target,profile.minutes,stats.total?stats.priorities.map(p=>p.i):[],now),pending:map.filter(row=>row.status==='Sin evaluar'||row.status==='Necesita refuerzo'||row.status==='Principiante').map(row=>row.objective)};
  const todayRows=rows.filter(row=>dateKey(row.started)===dateKey(now));
  const recovered=recoveredObjectives(rows);
  const progressAt=(offset:number)=>{
    const before=rows.filter(r=>dateKey(r.started)<=dateKey(now-offset*86400000));
    if(!before.length)return null;
    return {date:dateKey(now-offset*86400000),total:before.length,accuracy:percent(before.filter(r=>r.correct).length,before.length),coverage:percent(new Set(before.map(r=>r.objective)).size,objectives.length)};
  };
  const coach={budget:coachingBudget(profile.minutes),objective:stats.total?stats.recommendation:plan.calendar[0]?.objective??0,answered:todayRows.length,correct:todayRows.filter(r=>r.correct).length,todayObjectives:[...new Set(todayRows.map(r=>r.objective))],recovered:recovered.filter(r=>dateKey(r.recovered)===dateKey(now)).map(r=>r.objective)};
  const errors=stats.priorities.map(target=>{
    const unique=new Map(rows.filter(r=>r.objective===target.i&&!r.correct).reverse().map(r=>[r.id,r]));
    const unresolved=[...unique.values()].filter(r=>{const m=mastery.get(r.id);return !m?.correct||m.step<2;});
    return {objective:target.i,examples:unresolved.sort((a,b)=>b.started-a.started).slice(0,3).map(r=>{
      const {question,feedback}=byId.get(r.id)!;
      const labels=(ids:string[])=>ids.flatMap(id=>{const choice=question.choices.find(c=>c.id===id);return choice?[choice.group?choice.group+' · '+choice.text:choice.text]:[];});
      return {id:r.id,text:question.text,selected:labels(r.choice),expected:labels(feedback.keys),explain:feedback.explain,source:feedback.source,confident:r.confidence===3};
    })};
  });
  const independentAvailable=[40,50].filter(count=>!!independentSelection([...examItems.values()],count,distinct,()=>.5));
  return {settings:profile,plan,map,coach,recovered,trend:[0,7,14,30].map(progressAt),cardQueue,independentAvailable,active:list.filter(s=>!s.finished).sort((a,b)=>b.started-a.started).map(s=>({id:s.id,mode:s.mode,count:Object.keys(s.answers).length,total:s.questions.length})),stats,errors,bank:bank.length,reserved:reservedBank.length,reviewed:[...examItems.values()].filter(q=>q.reviewed).length,reviewCandidates,review:[...mastery.values()].filter(m=>m.failed&&m.step<2||m.due<=now).length,history:list.filter(s=>s.finished).slice(0,8).map(s=>({id:s.id,score:result(s),mode:s.mode})),dailyDone:list.some(s=>s.mode==='daily'&&dateKey(s.started)===dateKey()&&s.finished)};
}
export function exportReport(){
  const {map}=dashboard();
  const line=(values:(string|number)[])=>values.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');
  return ['Objetivo,Estado,Dominio,Preguntas distintas,Aciertos recientes,Retención',...map.map(m=>line([m.lesson,m.status,m.value,m.distinct,m.accuracy,m.retained]))].join('\r\n');
}
const examItems=new Map([...byId].map(([id,entry])=>[id,{id,objective:entry.question.objective,family:entry.family,reviewed:entry.validation==='revisada',reserved:entry.reserved}]));
export const startSchema=z.object({mode:modeSchema,domain:z.number().int().min(0).max(2).optional(),objective:z.number().int().min(0).max(11).optional(),difficulty:z.number().int().min(1).max(3).optional(),minutes:z.number().int().min(1).max(120).optional(),count:z.union([z.literal(40),z.literal(50)]).optional(),coached:z.boolean().optional(),examKind:examKindSchema.optional(),transfer:z.string().optional()});
export function start(input:z.infer<typeof startSchema>){
  const {mode,domain,objective,difficulty}=input;
  const list=all().map(s=>settle(s));
  const existing=mode==='daily'&&list.find(s=>s.mode===mode&&s.questions.length===TEST_SIZE&&dateKey(s.started)===dateKey());
  if(existing)return snapshot(existing);
  const {mastery,rows}=history(list);
  const transfer=input.transfer&&byId.get(input.transfer);
  if(input.transfer&&(!transfer||transfer.reserved||mode!=='adaptive'))throw new Error('Ejercicio de transferencia no disponible.');
  const count=transfer?1:mode==='mock'?input.count??TEST_SIZE:mode==='adaptive'&&input.coached?Math.min(TEST_SIZE,coachingBudget(settings().minutes).practice):TEST_SIZE;
  const examKind=mode==='mock'?input.examKind??'mixed':mode==='initial'?'diagnostic':undefined;
  const pool=bank.map(b=>b.question).filter(q=>mode!=='domain'||domain===undefined||domainOf(q.objective)===domain);
  const random=mode==='daily'?dailyRandom(dateKey()):Math.random;
  const shuffled=shuffle(pool,random);
  const priority=(id:string,objective:number,difficulty:number)=>{
    const m=mastery.get(id), examples=rows.filter(r=>r.objective===objective).slice(0,8);
    const weak=examples.length ? 4*(1-examples.filter(r=>r.correct).length/examples.length) : 3;
    const target=examples.length>=5&&weak<1?3:2;
    return (m?dueWeight(m.correct,m.confidence,m.due,Date.now())-Math.min(m.attempts,3):5)+weak-Math.abs(target-difficulty);
  };
  const preferred=(q:typeof shuffled[number])=>Number(q.objective===objective)*3+Number(q.difficulty===difficulty);
  let selected=[...shuffled].sort((a,b)=>preferred(b)-preferred(a));
  if(mode==='mock'||mode==='initial'||mode==='daily'){
    const q=quotas(count);
    const ordered=mode==='mock'?[...shuffled].sort((a,b)=>(mastery.get(a.id)?.attempts??0)-(mastery.get(b.id)?.attempts??0)):shuffled;
    const exposed=new Set(list.filter(s=>s.mode==='mock').flatMap(s=>s.questions.map(q=>q.id)));
    selected=shuffle(q.flatMap((n,i)=>{
      const reserve=examKind==='mixed'?shuffle(reservedBank.filter(x=>domainOf(x.question.objective)===i&&!exposed.has(x.question.id)),random).slice(0,[1,2,2][i]).map(x=>x.question):[];
      return [...reserve,...ordered.filter(x=>domainOf(x.objective)===i).slice(0,n-reserve.length)];
    }),random);
  }
  if(examKind==='independent'){
    const seen=new Set(list.flatMap(s=>s.questions.map(q=>examItems.get(q.id)!.family)));
    const exam=independentSelection([...examItems.values()],count,seen,random);
    if(!exam)throw new Error('No hay suficientes preguntas reservadas, revisadas y de familias nuevas para un simulacro independiente.');
    selected=exam.map(q=>byId.get(q.id)!.question);
  }
  if(examKind==='repeat'){
    const previous=list.filter(s=>s.mode==='mock'&&s.finished&&s.questions.length===count).sort((a,b)=>b.finished!-a.finished!)[0];
    if(!previous)throw new Error('Todavía no hay un simulacro entregado de esa longitud que puedas repetir.');
    selected=shuffle(previous.questions,random);
  }
  if(mode==='adaptive'||mode==='review'){
    const isReview=(id:string)=>{const m=mastery.get(id);return !!m&&(m.failed&&m.step<2||m.due<=Date.now());};
    const weight=(q:typeof shuffled[number])=>priority(q.id,q.objective,q.difficulty)+preferred(q)*4+(mode==='review'&&isReview(q.id)?100:0);
    selected=shuffled.sort((a,b)=>weight(b)-weight(a));
  }
  if(mode==='survival')selected.sort((a,b)=>a.difficulty-b.difficulty);
  if(transfer)selected=[transfer.question];
  selected=selected.slice(0,count);
  if(selected.length!==count)throw new Error('Este modo necesita '+count+' preguntas originales distintas.');
  const now=Date.now(),duration=input.minutes??(mode==='mock'||mode==='initial'?45:mode==='timed'?30:0);
  const s:Session={id:randomUUID(),mode,examKind,questions:selected.map(q=>({...q,choices:shuffle(q.choices,random)})),flags:[],answers:{},position:0,started:now,deadline:duration?now+duration*60000:null,finished:null};
  save(s);
  return snapshot(s);
}
export function getSession(id:string){
  const state=requestStore.getStore();
  if(state){const session=state.progress.sessions.find(s=>s.id===id);if(!session)throw new Error('No se ha encontrado la sesión.');return settle(session);}
  const row=connection().orm.select().from(sessions).where(eq(sessions.id,id)).get();
  if(!row)throw new Error('No se ha encontrado la sesión.');
  return settle(JSON.parse(row.payload) as Session);
}
export const mutation=z.object({id:z.uuid(),position:z.number().int().nonnegative().optional(),flag:z.string().optional(),qid:z.string().optional(),answer:storedAnswer.optional(),finish:z.boolean().optional(),reflection:reflectionSchema.optional(),cause:causeSchema.optional()});
function validAnswer(q:Session['questions'][number],choice:string[]){
  if(choice.length!==q.count||new Set(choice).size!==q.count||choice.some(id=>!q.choices.some(c=>c.id===id)))return false;
  return q.type!=='matriz'||new Set(q.choices.filter(c=>choice.includes(c.id)).map(c=>c.group)).size===q.count;
}
function applyChange(input:z.infer<typeof mutation>){
  const s=getSession(input.id);
  if(input.qid&&(input.reflection!==undefined||input.cause!==undefined)){
    const answer=s.answers[input.qid];
    if(!answer||deferred(s.mode)&&!s.finished)throw new Error('Primero debes obtener la corrección.');
    if(input.reflection!==undefined)answer.reflection=input.reflection;
    if(input.cause!==undefined&&!grade(s,input.qid)?.correct)answer.cause=input.cause;
    save(s);
    return snapshot(s);
  }
  if(s.finished)return snapshot(s);
  if(input.position!==undefined&&input.position<s.questions.length)s.position=input.position;
  if(input.flag&&s.questions.some(q=>q.id===input.flag))s.flags=s.flags.includes(input.flag)?s.flags.filter(id=>id!==input.flag):[...s.flags,input.flag];
  if(input.qid&&input.answer){
    const q=s.questions.find(q=>q.id===input.qid);
    if(!q||!validAnswer(q,input.answer.choice))throw new Error('Selecciona una respuesta válida.');
    if(deferred(s.mode)||!s.answers[q.id])s.answers[q.id]={...input.answer,at:Date.now()};
  }
  if(input.finish)s.finished=Date.now();
  save(s);
  return snapshot(s);
}
export const change=(input:z.infer<typeof mutation>)=>transaction(()=>applyChange(input));
export const view=(id:string)=>snapshot(getSession(id));
export const exportProgress=()=>({version:2,settings:settings(),sessions:all(),reviews:reviews()});
export function importProgress(raw:unknown){
  const incoming=snapshots.parse(raw);
  const prepared=incoming.sessions.map(s=>{
    const questions=s.questions.map(q=>{
      const original=byId.get(q.id)?.question;
      if(!original||q.choices.length!==original.choices.length||new Set(q.choices.map(c=>c.id)).size!==original.choices.length)throw new Error('Pregunta incompatible.');
      const choices=q.choices.map(c=>{const option=original.choices.find(o=>o.id===c.id);if(!option)throw new Error('Opción desconocida.');return option;});
      return {...original,choices};
    });
    if(s.position>=questions.length||new Set(questions.map(q=>q.id)).size!==questions.length||Object.entries(s.answers).some(([id,a])=>{const q=questions.find(q=>q.id===id);return !q||!validAnswer(q,a.choice);}))throw new Error('Sesión incompatible.');
    return {...s,questions};
  });
  transaction(()=>{
    const existing=new Set(all().map(s=>s.id));
    for(const s of prepared)if(!existing.has(s.id)){save(s);existing.add(s.id);}
    for(const review of incoming.reviews??[])saveReview(review);
    updateSettings(incoming.settings);
  });
}
export async function backupProgress(){
  const target=join(data,'backup-'+randomUUID()+'.sqlite');
  try{await backup(connection().sqlite,target);return readFileSync(target);}
  finally{try{unlinkSync(target);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
