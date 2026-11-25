'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {Activity,BookOpen,CalendarDays,ChartNoAxesCombined,Check,ChevronRight,Cloud,Flag,Flame,House,Layers,ListChecks,Settings as Gear,ShieldCheck,Timer,Trophy,Zap} from 'lucide-react';
import {Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {causes,defaults,domainOf,domains,guide,modes,objectives,percent,reflections,TEST_SIZE,type Mode,type Session,type Settings} from '../lib/catalog';
import type {dashboard} from '../lib/store';
import {reinforcement} from '../lib/reinforcement';
import {Academy,Flashcards,Knowledge,Labs,StudyPlan} from './learning-panels';
import {Account} from './account';
import type {ExamKind} from '../lib/catalog';

type Dashboard=ReturnType<typeof dashboard>&{cloud?:boolean};
class RequestError extends Error{constructor(readonly status:number,message:string){super(message);}}
const navigation=[['Inicio',House],['Hacer test',ListChecks],['Simulacros',Timer],['Repasar errores',BookOpen],['Desafíos',Trophy],['Estadísticas',ChartNoAxesCombined],['Configuración',Gear],['Qué reforzar',Layers],['Academia',BookOpen],['Plan de estudio',CalendarDays],['Flashcards',Layers],['Laboratorios',Cloud],['Mapa de conocimientos',Layers],['Preparación para el examen',Activity],['Certificaciones',ShieldCheck],['Mi entrenamiento de hoy',CalendarDays],['Errores superados',Check]] as const;
const sections=[['Aprendizaje',[0,15,8,9,10,11]],['Entrenamiento',[1,2,3,4]],['Rendimiento',[12,7,16,5,13]],['Sistema',[14,6]]] as const;
const levelNames=['Cloud Rookie','Azure Explorer','Cloud Practitioner','Infrastructure Specialist','Azure Expert Trainee','Exam Ready'];
const confidenceLabels=['No tengo ni idea','Tengo dudas','Estoy bastante seguro','Estoy completamente seguro'];
const clock=(seconds:number)=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
const practiceLinks=[
 ['Guía oficial AZ-900',guide],
 ['Evaluación oficial de Microsoft Learn','https://aka.ms/AZ900-LearnPA'],
 ['AI Skills Navigator','https://aka.ms/AZ900-PA'],
 ['Certificación Azure Fundamentals','https://learn.microsoft.com/es-es/credentials/certifications/azure-fundamentals/']
];
async function api<T>(query='', action?:string,value?:unknown):Promise<T>{
 const res=await fetch('/api/lab'+query,action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,value})}:{cache:'no-store'});
 const data=await res.json();
 if(!res.ok)throw new RequestError(res.status,data.error??'No se ha podido conectar.');
 return data;
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;}
function Chart({title,data}:{title:string;data:{day:string;value:number}[]}){
 return <section className="panel"><h2>{title}</h2>{!data.length?<p>Completa una sesión para ver la evolución.</p>:<div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line)"/><XAxis dataKey="day" stroke="var(--muted)"/><YAxis domain={[0,100]} stroke="var(--muted)" unit="%"/><Tooltip formatter={value=>[value+' %','Aciertos']}/><Area type="monotone" dataKey="value" stroke="#33a5fc" fill="#278bd540" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>}</section>;
}
export default function Home(){
 const [data,setData]=useState<Dashboard>();
 const [login,setLogin]=useState(false);
 const [settings,setSettings]=useState<Settings>(defaults);
 const [tab,setTab]=useState(0);
 const [session,setSession]=useState<Session>();
 const [choice,setChoice]=useState<string[]>([]);
 const [confidence,setConfidence]=useState(2);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [previous,setPrevious]=useState<{question:Session['questions'][number];answer:Session['answers'][string]}>();
 const [now,setNow]=useState(0);
 const [shown,setShown]=useState(0);
 const [mode,setMode]=useState<Mode>('quick');
 const [domain,setDomain]=useState(0);
 const [objective,setObjective]=useState(-1);
 const [difficulty,setDifficulty]=useState(0);
 const [mockTime,setMockTime]=useState(45);
 const [mockCount,setMockCount]=useState(40);
 const [examKind,setExamKind]=useState<ExamKind>('mixed');
 const [practiceLimit,setPracticeLimit]=useState(0);
 const [lesson,setLesson]=useState(2);
 const [recovery,setRecovery]=useState<Session>();
 const [focused,setFocused]=useState(false);
 function update(d:Dashboard){setData(d);setSettings(d.settings);}
 useEffect(()=>{api<Dashboard>().then(update).catch(e=>{if(e instanceof RequestError&&e.status===401)setLogin(true);else setError(e.message);});},[]);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 function receive(s:Session,timestamp:number){
  setSession(s);
  const a=s.answers[s.questions[s.position].id];
  setChoice(a?.choice??[]);setConfidence(a?.confidence??2);setShown(timestamp);setNow(timestamp);
 }
 async function run(fn:()=>Promise<void>){
  setBusy(true);setError('');setNotice('');
  try{await fn();}catch(e){if(e instanceof RequestError&&e.status===401){setLogin(true);setData(undefined);setSession(undefined);}else setError(e instanceof Error?e.message:'Error inesperado.');}finally{setBusy(false);}
 }
 async function launch(m:Mode,options:Record<string,unknown>={}){
  setPrevious(undefined);
  await run(async()=>receive(await api<Session>('','start',{mode:m,...options}),Date.now()));
 }
 function resume(id:string){setPrevious(undefined);return run(async()=>receive(await api<Session>('?id='+id),Date.now()));}
 const deadline=session?.deadline, sessionId=session?.id, finished=session?.finished;
 useEffect(()=>{
  if(!deadline||!sessionId||finished||busy)return;
  let current=true;
  const timeout=setTimeout(()=>{
   api<Session>('?id='+sessionId).then(async s=>{
    if(!current)return;
    receive(s,Date.now());
    if(s.finished){const d=await api<Dashboard>();if(current)update(d);}
   }).catch(e=>{if(current)setError(e.message);});
  },Math.max(0,deadline-Date.now()+20));
  return()=>{current=false;clearTimeout(timeout);};
 },[deadline,sessionId,finished,busy]);
 function change(fields:Record<string,unknown>){
  return run(async()=>{
   const s=await api<Session>('','change',{id:session!.id,...fields});
   receive(s,Date.now());
   if(s.finished)update(await api<Dashboard>());
  });
 }
 function navigate(i:number){setFocused(false);setSession(undefined);setPrevious(undefined);setTab(i);setNotice('');void run(async()=>update(await api<Dashboard>()));}
 function openLesson(i:number){setLesson(i);navigate(8);}
 function practice(i:number){void launch('adaptive',{objective:i});}
 function today(){
  const next=data?.plan.calendar[0];
  if(!data?.stats.total){const initial=data?.active.find(s=>s.mode==='initial');if(initial)void resume(initial.id);else void launch('initial');return;}
  if(next?.mode==='mock')void launch('mock');
  else void launch('adaptive',{objective:next?.objective,minutes:data.settings.minutes});
 }
 const stats=data?.stats;
 const days=data?.plan.days??0;
 const recommendation=stats?.recommendation??0;
 const awaitingInitial=!data?.history.some(h=>h.mode==='initial')&&!stats?.total;
 const phase=['Fundamentos','Servicios Azure','Administración','Preparación final'][data?.plan.calendar[0]?.phase??0];
 const q=session?.questions[session.position];
 const answer=q&&session?.answers[q.id];
 const deferred=session?.mode==='mock'||session?.mode==='initial';
 const remaining=deadline?Math.max(0,Math.ceil((deadline-now)/1000)):0;
 const answered=session?Object.keys(session.answers).length:0;
 const elapsed=session?Math.max(0,Math.floor(((session.finished??now)-session.started)/1000)):0;
 const questionBudget=deadline&&session&&answered<session.questions.length?Math.floor(remaining/(session.questions.length-answered)):null;
 const avgSeconds=session&&answered?Math.round(Object.values(session.answers).reduce((sum,a)=>sum+a.seconds,0)/answered):null;
 function toggle(id:string){
  if(!q||!session||busy)return;
  const group=q.choices.find(option=>option.id===id)?.group;
  const selected=group?[...choice.filter(i=>q.choices.find(option=>option.id===i)?.group!==group),id]:q.count===1?[id]:choice.includes(id)?choice.filter(i=>i!==id):[...choice,id];
  setChoice(selected);
  if(selected.length!==q.count)return;
  const next=session.questions.findIndex((item,i)=>i>session.position&&!session.answers[item.id]);
  const pending=next>=0?next:session.questions.findIndex(item=>item.id!==q.id&&!session.answers[item.id]);
  void run(async()=>{
   try{
    const s=await api<Session>('','change',{
     id:session.id,qid:q.id,answer:{choice:selected,confidence,seconds:Math.min(3600,Math.round((Date.now()-shown)/1000))},
     ...(pending>=0?{position:pending}:{finish:!deferred})
    });
    const graded=s.answers[q.id];
    setPrevious(graded?.feedback?{question:q,answer:graded}:undefined);
    receive(s,Date.now());
    if(s.finished||!deferred)update(await api<Dashboard>());
   }catch(error){setChoice(answer?.choice??[]);throw error;}
  });
 }
 function annotate(id:string,field:'reflection'|'cause',value:number){
  if(value<0||!session)return;
  void run(async()=>{
   const s=await api<Session>('','change',{id:session.id,qid:id,[field]:value});
   setSession(s);
   if(previous?.question.id===id)setPrevious({...previous,answer:s.answers[id]});
   update(await api<Dashboard>());
  });
 }
 function correction(question:NonNullable<typeof q>,a:NonNullable<typeof answer>){
  const f=a.feedback;
  if(!f)return null;
  return <div className={'feedback '+(f.correct?'good':'bad')}>
   <strong>{f.correct?'Respuesta correcta':a.choice.length?'Respuesta incorrecta':'Solución'}</strong><p>{f.explain}</p>
   {question.type==='ordenación'?<><p><b>Tu orden.</b> {a.choice.map(id=>question.choices.find(c=>c.id===id)?.text).join(' → ')||'Sin responder'}</p><p><b>Orden correcto.</b> {f.keys.map(id=>question.choices.find(c=>c.id===id)?.text).join(' → ')}</p></>:<ul>{question.choices.map(c=><li key={c.id}><b>{c.group?c.group+' · ':''}{c.text}</b>{a.choice.includes(c.id)?' (tu selección)':''}{f.keys.includes(c.id)?' (correcta)':''}<br/>{f.choices[c.id]}</li>)}</ul>}
   <p><b>Cómo distinguirlo</b> {f.tip}</p>
   <p><b>Ejemplo práctico</b> {reinforcement[question.objective].example}</p>
   <h3>Cómo razonar esta pregunta en el examen</h3><p>{f.reasoning??f.explain+' '+f.tip}</p>
   {!f.correct&&a.choice.length>0&&<p><b>Posible confusión.</b> {a.cause!==undefined?causes[a.cause]:a.confidence===3?'Marcaste confianza máxima. Comprueba qué condición del escenario descartaba tu elección.':'Revisa qué requisito debe cumplir el servicio. Puedes indicar qué te llevó al error.'}</p>}
   {a.choice.length>0&&<div className="actions">
    <label>Cómo llegaste a la respuesta <select disabled={busy} value={a.reflection??-1} onChange={e=>annotate(question.id,'reflection',+e.target.value)}><option disabled value={-1}>Sin indicar</option>{reflections.map((label,i)=><option key={label} value={i}>{label}</option>)}</select></label>
    {!f.correct&&<label>Motivo del error <select disabled={busy} value={a.cause??-1} onChange={e=>annotate(question.id,'cause',+e.target.value)}><option disabled value={-1}>Sin clasificar</option>{causes.map((label,i)=><option key={label} value={i}>{label}</option>)}</select></label>}
   </div>}
   <div className="actions"><a href={f.source} target="_blank" rel="noreferrer">Consultar Microsoft Learn</a><button className="secondary" onClick={()=>openLesson(question.objective)}>Abrir microlección</button>{f.related&&<button className="secondary" disabled={busy} onClick={()=>void launch('adaptive',{transfer:f.related})}>Resolver pregunta de transferencia</button>}</div>
  </div>;
 }
 if(login)return <main className="shell account-shell" data-theme={settings.theme}><Account onSignedIn={async()=>{update(await api<Dashboard>());setLogin(false);setTab(0);}}/></main>;
 return <div className={'shell '+(focused&&session&&!session.finished?'focus-session':'')} data-theme={settings.theme}>
  <aside className="sidebar">
   <div className="brand"><span className="brand-icon"><Cloud size={23}/></span><div>Azure Exam Lab<small>MICROSOFT AZ-900</small></div></div>
   <nav aria-label="Principal">{sections.map(([heading,ids])=><div className="nav-group" key={heading}><span>{heading}</span>{ids.map(i=>{const [name,Icon]=navigation[i];return <button key={name} aria-current={tab===i&&!session?'page':undefined} onClick={()=>navigate(i)}><Icon size={17}/>{name}</button>;})}</div>)}</nav>
   <div className="sidebar-footer"><ShieldCheck size={18}/> Progreso guardado en local</div>
  </aside>
  <main className="main">
   <header className="topbar"><span>Entrenamiento <ChevronRight size={15}/> <b>{session?modes[session.mode]:navigation[tab][0]}</b></span><span className="pill"><Flame size={16}/> {stats?.streak??0} días</span><span className="pill"><Zap size={16}/> {stats?.xp??0} XP</span></header>
   <div className="content">
   {error&&<p role="alert" className="alert">{error}</p>}{notice&&<p role="status" className="alert">{notice}</p>}
   {!data&&!session&&!error&&<p role="status">Cargando progreso…</p>}
   {stats&&<aside className="readiness-strip" aria-label="Recomendación para el examen">
    <div><strong>{stats.verdict}</strong><span>Exam Readiness · {stats.readiness}/100</span></div>
    <div><b>{stats.total?'Refuerzo prioritario':'Siguiente paso'}</b><span>{stats.total?objectives[recommendation]:'Haz la evaluación inicial'}</span></div>
    <details><summary>Qué reforzar y qué falta</summary><ul>{stats.total>0&&stats.priorities.map(o=><li key={o.i}>{objectives[o.i]} · {o.state}{o.unique>=2?' · '+o.value+' %':''}</li>)}</ul><ul>{stats.requirements.filter(r=>!r.met).map(r=><li key={r.text}>{r.text}</li>)}</ul><p>Recomendación basada en tu práctica. En evaluación y simulacro se actualiza al entregar.</p>{(!deferred||finished)&&tab!==7&&<button className="secondary" onClick={()=>navigate(7)}>Abrir refuerzo personalizado</button>}</details>
   </aside>}
   {session && q && (session.finished ?
    <section className="session">
     <h1>Resultados del {modes[session.mode].toLowerCase()}</h1>
     {session.mode==='mock'&&<p>{session.examKind==='independent'?'Simulacro íntegramente independiente':session.examKind==='repeat'?'Simulacro de repetición':'Simulacro mixto o anterior'}</p>}
     <div className="metrics">
      <Metric label="Aciertos" value={Object.values(session.answers).filter(a=>a.feedback?.correct).length}/>
      <Metric label="Respondidas" value={Object.keys(session.answers).length+'/'+session.questions.length}/>
      <Metric label="Puntuación interna" value={percent(Object.values(session.answers).filter(a=>a.feedback?.correct).length,session.questions.length)+' %'}/>
      <Metric label="Duración" value={clock(elapsed)}/>
     </div>
     {avgSeconds!==null&&<p>Tiempo medio al responder: {avgSeconds} s.</p>}
     {session.deadline&&session.finished===session.deadline&&<p>Tiempo agotado. Quedaron {session.questions.length-answered} preguntas sin responder.</p>}
     <p className="muted">El porcentaje corresponde a esta sesión. Microsoft utiliza su propia escala de puntuación.</p>
     {session.report&&<section className="panel"><h2>Informe de aprendizaje</h2><p>{session.report.unanswered} sin responder · {session.report.firstSeen} preguntas nuevas respondidas · {session.report.overconfidence} fallos con confianza máxima · {session.report.guesses} aciertos con dudas o por descarte.</p>
     {session.report.previous!==null&&<p>Resultado anterior comparable: {session.report.previous} %.</p>}
     <p>{session.report.recurring} errores recurrentes. Marca voluntariamente el motivo de los errores en la corrección.</p>
     {!!session.report.causes.length&&<ul>{session.report.causes.map(c=><li key={c.index}>{causes[c.index]} · {c.count}</li>)}</ul>}
     <div className="objective-grid">{session.report.domains.map(row=><div key={row.index}><b>{domains[row.index]}</b><span>{row.correct}/{row.total} aciertos</span></div>)}</div>
     <details><summary>Rendimiento por objetivo</summary><ul>{session.report.objectives.map(row=><li key={row.index}>{objectives[row.index]} · {row.correct}/{row.total}</li>)}</ul></details>
     {session.report.weak.length>0&&<><p>Empieza por {objectives[session.report.weak[0]]}. Estudia la microlección, revisa las correcciones y comprueba que puedes aplicar el concepto a otro escenario.</p><button className="primary" onClick={()=>{setRecovery(session);openLesson(session.report!.weak[0]);}}>Aprender de mis errores</button></>}</section>}
     <div className="actions"><button className="primary" onClick={()=>navigate(0)}>Volver a inicio</button><button className="secondary" disabled={busy} onClick={()=>void launch('adaptive',{objective:recommendation})}>Reforzar {objectives[recommendation]}</button></div>
     <h2>Corrección y explicaciones</h2>
     {session.questions.map((item,i)=>{
      const a=session.answers[item.id];
      const skipped=session.skipped?.[item.id];
      return <details key={item.id} className="panel"><summary>{i+1}. {item.text} <small>{a?.feedback?.correct?'Correcta':a?'Incorrecta':'Sin responder'}</small></summary>{a?correction(item,a):skipped&&correction(item,{choice:[],confidence:0,seconds:0,feedback:skipped})}</details>;
     })}
    </section>:
    <section className="session">
     <div className="session-meta"><span className="tag">AZ-900</span><span>Pregunta {session.position+1} de {session.questions.length}</span><span>{answered} respondidas · {session.questions.length-answered} pendientes</span><span role="timer" aria-label={deadline?'Tiempo restante':'Tiempo transcurrido'} className={'pill '+(deadline&&remaining<=300?'timer-low':'')}><Timer size={17}/>{clock(deadline?remaining:elapsed)}</span>{session.mode==='survival'&&<span className="pill">{Math.max(0,3-Object.values(session.answers).filter(a=>a.feedback?.correct===false).length)} vidas</span>}</div>
     <button className="ghost focus-toggle" aria-pressed={focused} onClick={()=>setFocused(!focused)}>{focused?'Salir de pantalla limpia':'Pantalla limpia'}</button>
     <progress aria-label="Preguntas respondidas" value={Object.keys(session.answers).length} max={session.questions.length}/>
     {questionBudget!==null&&<p className="pace">Te quedan unos <b>{questionBudget} s</b> por pregunta pendiente. {questionBudget<45?'Marca las que te lleven más tiempo y vuelve al final.':'Puedes marcar preguntas para revisarlas al final.'}</p>}
     {previous&&previous.question.id!==q.id&&<details key={previous.question.id} className="panel"><summary><span role="status">{previous.answer.feedback?.correct?'Correcta':'Incorrecta'} · Ver explicación de la pregunta anterior</span></summary>{correction(previous.question,previous.answer)}</details>}
     <div className="panel question" key={q.id} data-question-id={q.id}>
      <div className="session-meta"><span className="eyebrow">{objectives[q.objective]} · {['','Básica','Intermedia','Avanzada'][q.difficulty]}</span><button className="ghost" aria-pressed={session.flags.includes(q.id)} disabled={busy} onClick={()=>void change({flag:q.id})}><Flag size={16}/> {session.flags.includes(q.id)?'Marcada':'Marcar'}</button></div>
      <h1>{q.text}</h1>
      <fieldset disabled={busy||!!answer&&!deferred}><legend>{q.type==='matriz'?'Responde cada afirmación':q.type==='ordenación'?'Selecciona los elementos en orden':q.count===1?'Selecciona una opción':'Selecciona '+q.count+' opciones'}</legend>
      {q.type==='matriz'?[...new Set(q.choices.map(c=>c.group))].map((group,i)=><fieldset className="matrix-row" key={group}><legend>{group}</legend>{q.choices.filter(c=>c.group===group).map(c=><label className="option" key={c.id}><input type="radio" name={q.id+'-'+i} checked={choice.includes(c.id)} onChange={()=>toggle(c.id)}/>{c.text}</label>)}</fieldset>):
       q.type==='ordenación'?q.choices.map(c=><button type="button" className="option" key={c.id} aria-pressed={choice.includes(c.id)} onClick={()=>toggle(c.id)}><span className="letter">{choice.includes(c.id)?choice.indexOf(c.id)+1:'–'}</span>{c.text}</button>):
       q.choices.map((c,i)=><label className={'option '+(choice.includes(c.id)?'selected ':'')+(answer?.feedback?.keys.includes(c.id)?'right':answer?.feedback&&choice.includes(c.id)?'wrong':'')} key={c.id}><input type={q.count===1?'radio':'checkbox'} name={q.id} checked={choice.includes(c.id)} onChange={()=>toggle(c.id)}/><span className="letter">{String.fromCharCode(65+i)}</span>{c.text}</label>)}
      </fieldset>
      <div className="actions"><label>Confianza antes de responder <select disabled={busy||!!answer&&!deferred} value={confidence} onChange={e=>setConfidence(+e.target.value)}>{confidenceLabels.map((s,i)=><option value={i} key={s}>{s}</option>)}</select></label></div>
      {answer&&deferred&&<p role="status" className="muted"><Check size={16}/> Respuesta guardada</p>}
      {answer&&correction(q,answer)}
     </div>
     <div className="actions"><button className="secondary" disabled={busy||session.position===0} onClick={()=>void change({position:session.position-1})}>Anterior</button><button className="primary" disabled={busy||session.position===session.questions.length-1} onClick={()=>void change({position:session.position+1})}>Continuar</button><button className="ghost" disabled={busy||!Object.keys(session.answers).length} onClick={()=>{if(Object.keys(session.answers).length===session.questions.length||confirm('Quedan preguntas pendientes. ¿Entregar la sesión?'))void change({finish:true});}}>Entregar sesión</button></div>
     <div className="number-grid" aria-label="Navegar entre preguntas">{session.questions.map((item,i)=><button key={item.id} title={session.flags.includes(item.id)?'Marcada':session.answers[item.id]?'Respondida':'Pendiente'} aria-current={i===session.position?'step':undefined} className={session.flags.includes(item.id)?'flagged':session.answers[item.id]?'answered':''} disabled={busy} onClick={()=>void change({position:i})}>{i+1}</button>)}</div>
    </section>)}
   {!session&&data&&<>
    {tab===0&&<>
     <div className="intro"><div className="eyebrow">TU ESPACIO DE ENTRENAMIENTO</div><h1>Inicio</h1><p>Practica para Microsoft Azure Fundamentals y mide tu progreso.</p></div>
     <div className="home-grid">
      <section className="hero">
       <div className="hero-content"><span className="tag"><Cloud size={15}/> CERTIFICACIÓN AZ-900</span><h2>Azure<br/>Fundamentals</h2><p>{awaitingInitial?'Descubre qué objetivos necesitas reforzar con un diagnóstico de '+TEST_SIZE+' preguntas y corrección al finalizar.':'Continúa con preguntas adaptadas a tu progreso y refuerza los objetivos con menor dominio.'}</p>
       <button className="primary hero-button" disabled={busy} onClick={()=>{const active=data.active.find(s=>s.mode==='initial');if(awaitingInitial&&active)void resume(active.id);else void launch(awaitingInitial?'initial':'adaptive',{objective:recommendation});}}>{awaitingInitial?'Comenzar evaluación inicial':'Continuar entrenamiento'}</button></div>
       <div className="hero-art" aria-hidden="true"><div className="orbit one"/><div className="orbit two"/><div className="orbit three"/><div className="core"><Cloud size={89} strokeWidth={1.15}/></div><span className="satellite"><Layers size={22}/></span><span className="spark"><Zap size={19}/></span></div>
      </section>
      <section className="panel readiness"><div className="panel-icon"><Activity size={20}/></div><h2>Exam Readiness</h2><div className="readiness-score">{stats?.readiness??0}<span> / 100</span></div><progress aria-label="Exam Readiness" value={stats?.readiness??0} max={100}/><b>{stats?.status}</b><p>Indicador interno basado en tu práctica.</p><button className="ghost" onClick={()=>navigate(5)}>Ver diagnóstico <ChevronRight size={15}/></button></section>
     </div>
     <div className="metrics"><Metric label="Días hasta tu objetivo" value={days}/><Metric label="Primer intento" value={stats?.unique?stats.freshRate+' %':'—'}/><Metric label="Preguntas repetidas" value={stats?.repeatCount?stats.repeatRate+' %':'—'}/><Metric label="Minutos respondiendo" value={Math.round((stats?.seconds??0)/60)}/><Metric label="Objetivos evaluados" value={(stats?.coverage??0)+' %'}/><Metric label="Objetivos dominados" value={data.map.filter(m=>m.status==='Dominado').length}/><Metric label="Flashcards disponibles" value={data.cardQueue.length}/><Metric label="Aciertos últimos 7 días" value={stats?.weekly?stats.weeklyRate+' %':'—'}/></div>
     <h2 className="section-title">Tu próxima sesión</h2>
     <div className="lower-grid">
      <section className="panel"><div className="panel-icon"><CalendarDays size={20}/></div><h3>Plan de hoy</h3><p>{settings.minutes} min · {phase}</p><p>{stats?.total?'Objetivo recomendado: '+objectives[recommendation]:'Empieza con la evaluación inicial para personalizar tu plan.'}</p>{data.plan.calendar.find(day=>day.mode==='mock')&&<p>Próximo simulacro previsto: {data.plan.calendar.find(day=>day.mode==='mock')?.date.split('-').reverse().join('/')}</p>}<button className="primary" disabled={busy} onClick={()=>navigate(15)}>Comenzar entrenamiento de hoy</button></section>
      <section className="panel"><div className="panel-icon"><Trophy size={20}/></div><h3>Desafío diario</h3><p>{data.dailyDone?'Desafío de hoy completado.':'40 preguntas variadas. Pon a prueba tu precisión.'}</p><button className="secondary" disabled={busy} onClick={()=>void launch('daily')}>{data.dailyDone?'Ver resultado':'Jugar desafío'}</button></section>
      <section className="panel"><div className="panel-icon"><BookOpen size={20}/></div><h3>Sesiones en curso</h3>{data.active.length?data.active.map(s=><button className="ghost" disabled={busy} key={s.id} onClick={()=>void resume(s.id)}>{modes[s.mode]} · {s.count}/{s.total}</button>):<p>Tus sesiones sin entregar aparecerán aquí.</p>}</section>
     </div>
     <Chart title="Evolución de los últimos 30 días" data={stats?.daily??[]}/>
    </>}
    {tab===1&&<section className="panel form-panel"><h1>Hacer test</h1><p>{TEST_SIZE} preguntas por test de un banco de {data.bank} preguntas originales de preparación AZ-900.</p><form onSubmit={(e:FormEvent)=>{e.preventDefault();void launch(mode,{...(mode==='domain'?{domain,objective:objective<0?undefined:objective}:{}),...(mode==='quick'||mode==='domain'?{difficulty:difficulty||undefined}:{}),minutes:practiceLimit||undefined});}}>
     <label>Modo <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>{(['quick','domain','adaptive','timed','survival'] as const).map(m=><option value={m} key={m}>{modes[m]}</option>)}</select></label>
     <label>Tiempo <select value={practiceLimit} onChange={e=>setPracticeLimit(+e.target.value)}><option value={0}>{mode==='timed'?'30 minutos por defecto':'Cronómetro sin límite'}</option><option value={30}>30 minutos</option><option value={45}>45 minutos</option><option value={60}>60 minutos</option></select></label>
     {mode==='domain'&&<><label>Dominio <select value={domain} onChange={e=>{setDomain(+e.target.value);setObjective(-1);}}>{domains.map((d,i)=><option value={i} key={d}>{d}</option>)}</select></label><label>Subcategoría <select value={objective} onChange={e=>setObjective(+e.target.value)}><option value={-1}>Todas</option>{objectives.map((o,i)=>domainOf(i)===domain&&<option value={i} key={o}>{o}</option>)}</select></label></>}
     {(mode==='quick'||mode==='domain')&&<label>Dificultad <select value={difficulty} onChange={e=>setDifficulty(+e.target.value)}>{['Cualquiera','Básica','Intermedia','Avanzada'].map((d,i)=><option value={i} key={d}>{d}</option>)}</select></label>}
     <button className="primary" disabled={busy}>Empezar test</button></form></section>}
    {tab===2&&<section className="panel form-panel"><h1>Simulacros</h1><p>Recibirás la corrección al entregar. Solo un simulacro compuesto íntegramente de preguntas reservadas, revisadas y de familias nuevas cuenta como independiente.</p>{!data.independentAvailable.includes(mockCount)&&<p role="status">El banco disponible aún no permite un simulacro independiente de {mockCount} preguntas.</p>}<form onSubmit={e=>{e.preventDefault();void launch('mock',{minutes:mockTime,count:mockCount,examKind});}}><label>Tipo <select value={examKind} onChange={e=>setExamKind(e.target.value as ExamKind)}><option value="mixed">Mixto</option><option value="independent">Independiente</option><option value="repeat">Repetir último de esta longitud</option></select></label><label>Preguntas <select value={mockCount} onChange={e=>setMockCount(+e.target.value)}><option value={40}>40</option><option value={50}>50</option></select></label><label>Duración (minutos) <input type="number" min="1" max="120" value={mockTime} onChange={e=>setMockTime(+e.target.value)} required/></label><button className="primary" disabled={busy||examKind==='independent'&&!data.independentAvailable.includes(mockCount)}>Comenzar simulacro</button></form><p>Microsoft publica 45 minutos para AZ-900. El aprobado oficial requiere 700 puntos en una escala de hasta 1000. El porcentaje de este simulacro usa las preguntas acertadas y las preguntas totales. <a href="https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience/" target="_blank" rel="noreferrer">Consultar información oficial</a></p></section>}
    {tab===3&&<section className="panel form-panel"><h1>Repasar errores</h1><p>{data.review?data.review+' preguntas entre errores por consolidar y repasos pendientes.':'La cola está al día. Los errores y repasos programados aparecerán aquí.'}</p><button className="primary" disabled={busy||!data.review} onClick={()=>void launch('review')}>Empezar repaso</button></section>}
    {tab===4&&<><section className="panel"><h1>Desafíos</h1><p>{levelNames[(stats?.level??1)-1]} · {stats?.xp??0} XP · Racha de {stats?.streak??0} días</p><p>Objetivo semanal de práctica: {stats?.weekly??0}/100 respuestas.</p><progress aria-label="Objetivo semanal" value={Math.min(100,stats?.weekly??0)} max={100}/><p>{stats?.latestDaily.length?'Último desafío: '+stats.latestDaily[0]+' %'+(stats.latestDaily.length>1?' · Anterior: '+stats.latestDaily[1]+' %':''):'Completa el desafío para registrar tu primer resultado.'}</p><button className="primary" disabled={busy} onClick={()=>void launch('daily')}>{data.dailyDone?'Ver desafío de hoy':'Jugar desafío diario'}</button></section><section className="panel"><h2>Logros</h2><ul>{[[!!stats?.tests,'Primer test completado'],[(stats?.total??0)>=100,'100 preguntas respondidas'],[(stats?.longest??0)>=7,'Siete días consecutivos'],[!!stats?.mocks.some(m=>m.value>=80),'Simulacro con al menos 80 %']].map(([earned,label])=><li key={String(label)}>{earned?'Conseguido':'Pendiente'} · {label}</li>)}</ul></section></>}
    {tab===5&&stats&&<><h1>Estadísticas</h1><div className="metrics">{[['Sesiones',stats.tests],['Respuestas',stats.total],['Preguntas únicas',stats.unique],['Correctas',stats.correct],['Incorrectas',stats.total-stats.correct],['Aciertos',stats.rate+' %'],['Últimos 5 tests',stats.average+' %'],['Mejor resultado',stats.best+' %'],['Tiempo de práctica',Math.round(stats.seconds/60)+' min'],['Tiempo medio',stats.pace+' s'],['Racha máxima',stats.longest+' días'],['Cobertura evaluada',stats.coverage+' %']].map(([label,value])=><Metric key={label} label={String(label)} value={value}/>)}</div>
     <section className="panel"><h2>Mi evolución como profesional Azure</h2><p>{stats.weekly?stats.weekly+' respuestas · '+stats.weeklyRate+' % de aciertos en los últimos 7 días.':'Aún no hay respuestas en los últimos 7 días.'}</p><p>{data.map.reduce((sum,row)=>sum+row.retained,0)} preguntas con evidencia de recuperación en días distintos.</p><table className="learn-table"><thead><tr><th>Corte</th><th>Respuestas acumuladas</th><th>Aciertos acumulados</th></tr></thead><tbody>{data.trend.map((item,i)=><tr key={i}><td>{['Hoy','Hace 7 días','Hace 14 días','Hace 30 días'][i]}</td><td>{item?.total??'Sin datos'}</td><td>{item?item.accuracy+' %':'Sin datos'}</td></tr>)}</tbody></table><p><a className="secondary" href="/api/lab?csv">Descargar informe CSV</a></p></section>
     <div className="lower-grid"><Chart title="Últimos 30 días" data={stats.daily}/><Chart title="Simulacros recientes" data={stats.mocks}/></div>
     <section className="panel"><h2>Rendimiento por dificultad</h2>{stats.byDifficulty.map((d,i)=><p key={i}>{['Básica','Intermedia','Avanzada'][i]} · {d.count?d.value+' % en '+d.count+' respuestas':'Sin respuestas'}</p>)}</section>
     <section className="panel"><h2>Exam Readiness · {stats.readiness}/100</h2><p>{stats.status} · Indicador interno de entrenamiento</p><ul>{stats.requirements.map(r=><li key={r.text}>{r.met?'Cumplido':'Pendiente'} · {r.text}</li>)}</ul></section>
     <section className="panel"><h2>Diagnóstico por objetivo</h2><p>{stats.overconfidence} errores con confianza máxima. {stats.pace>54?'Practica la velocidad con Contrarreloj.':''}</p>{domains.map((d,i)=><p key={d}><b>{d}</b> · {stats.domains[i]} %</p>)}<div className="objective-grid">{stats.objectives.map(o=><div key={o.i}><b>{objectives[o.i]}</b><span>{o.state} · {o.unique} únicas · {o.errors} errores recientes</span></div>)}</div><button className="secondary" disabled={busy} onClick={()=>void launch('adaptive',{objective:recommendation})}>Practicar {objectives[recommendation]}</button></section>
     <section className="panel"><h2>Sesiones recientes</h2>{data.history.length?data.history.map(s=><button className="ghost" disabled={busy} key={s.id} onClick={()=>void resume(s.id)}>{modes[s.mode]} · {s.score} %</button>):<p>Completa tu primer test para consultar sus resultados aquí.</p>}</section></>}
    {tab===6&&<><section className="panel form-panel"><h1>Configuración</h1><form onSubmit={e=>{e.preventDefault();void run(async()=>{update(await api<Dashboard>('','settings',settings));setNotice('Configuración guardada.');});}}><label>Fecha objetivo provisional <input type="date" required value={settings.target} onChange={e=>setSettings({...settings,target:e.target.value})}/></label><label>Dedicación diaria <select value={settings.minutes} onChange={e=>setSettings({...settings,minutes:+e.target.value})}>{[10,15,20,30,45,60,90].map(n=><option key={n} value={n}>{n} minutos</option>)}</select></label><label>Aspecto <select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value as Settings['theme']})}><option value="dark">Oscuro</option><option value="light">Claro</option></select></label><button className="primary" disabled={busy}>Guardar configuración</button></form></section>
    <section className="panel"><h2>Progreso local</h2><div className="actions"><a className="secondary" href="/api/lab?export">Exportar JSON</a>{!data.cloud&&<a className="secondary" href="/api/lab?backup">Descargar copia SQLite</a>}{data.cloud&&<button className="secondary" disabled={busy} onClick={()=>void run(async()=>{const result=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});if(!result.ok)throw Error("No se pudo cerrar la sesión.");setData(undefined);setSession(undefined);setRecovery(undefined);setLogin(true);})}>Cerrar sesión</button>}<label>Importar progreso JSON <input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&confirm('Se añadirán las sesiones y los repasos que falten y se aplicarán las preferencias del archivo. ¿Importar?'))void run(async()=>{update(await api<Dashboard>('','import',JSON.parse(await file.text())));setNotice('Progreso importado.');});}}/></label></div></section>
    <section className="panel"><h2>Fuentes oficiales externas</h2><ul>{practiceLinks.map(([label,url])=><li key={url}><a href={url} target="_blank" rel="noreferrer">{label}</a></li>)}</ul><p>Banco local de preguntas originales. Temario consultado el 24 de noviembre de 2026.</p></section></>}
    {tab===7&&stats&&<>
     <h1 className="section-title">Qué reforzar</h1>
     {stats.total===0?<section className="panel"><p>Haz la evaluación inicial para identificar tus puntos débiles.</p><button className="primary" disabled={busy} onClick={()=>{const active=data.active.find(s=>s.mode==='initial');if(active)void resume(active.id);else void launch('initial');}}>Comenzar evaluación inicial</button></section>:
      stats.priorities.map((item,index)=>{
       const material=reinforcement[item.i], examples=data.errors.find(e=>e.objective===item.i)?.examples??[];
       return <section className="panel" key={item.i}>
        <span className="eyebrow">{index===0?'Prioridad principal':objectives[item.i]}</span>
        <h2>{material.focus}</h2><p>{item.state} · {item.unique} preguntas distintas{item.unique>=2?' · '+item.value+' % de aciertos recientes':''}</p>
        <p><b>Cómo distinguirlo</b> {material.rule}</p><p><b>Ejemplo práctico</b> {material.example}</p>
        {examples.length>0&&<><h3>Errores de tus tests</h3>{examples.map(example=><details className="error-example" key={example.id}><summary>{example.text}</summary><p><b>Elegiste</b> {example.selected.join(', ')}{example.confident?' · confianza máxima':''}</p><p><b>Respuesta correcta</b> {example.expected.join(', ')}</p><p>{example.explain}</p><a href={example.source} target="_blank" rel="noreferrer">Consultar Microsoft Learn</a></details>)}</>}
        <button className="secondary" disabled={busy} onClick={()=>void launch('adaptive',{objective:item.i})}>Entrenar este objetivo</button>
       </section>;
      })}
    </>}
    {tab===8&&<>
     {recovery?.report&&<section className="panel"><h2>Itinerario de recuperación</h2><p>Consulta cada microlección y vuelve al informe para revisar la corrección y responder una pregunta de transferencia. Las preguntas con fallos quedan disponibles en el repaso.</p><div className="actions">{recovery.report.weak.map(i=><button className={lesson===i?'primary':'secondary'} aria-pressed={lesson===i} key={i} onClick={()=>setLesson(i)}>{objectives[i]}</button>)}</div><div className="actions"><button className="secondary" disabled={busy} onClick={()=>void resume(recovery.id)}>Volver a las correcciones</button><button className="ghost" onClick={()=>setRecovery(undefined)}>Cerrar itinerario</button></div></section>}
     <Academy selected={lesson} onSelect={setLesson} practice={practice}/>
    </>}
    {tab===9&&<StudyPlan plan={data.plan} training={()=>navigate(15)} open={openLesson} settings={()=>navigate(6)}/>}
    {tab===10&&<Flashcards queue={data.cardQueue} busy={busy} rate={(id,rating)=>void run(async()=>update(await api<Dashboard>('','card',{id,rating,request:crypto.randomUUID()})))}/>}
    {tab===11&&<Labs practice={practice}/>}
    {tab===12&&<Knowledge map={data.map} open={openLesson} practice={practice}/>}
    {tab===13&&stats&&<section className="panel learn"><h1>Preparación para el examen</h1><p>{stats.verdict} · {stats.readiness}/100</p><h2>Qué mide el indicador</h2><ul>{stats.components.map(c=><li key={c.name}>{c.name} · {c.value}/100 · peso {c.weight} %</li>)}</ul><h2>Qué falta</h2><ul>{stats.requirements.map(r=><li key={r.text}>{r.met?'Cumplido':'Pendiente'} · {r.text}</li>)}</ul><button className="primary" onClick={()=>navigate(2)}>Preparar un simulacro</button></section>}
    {tab===14&&<section className="panel learn"><h1>Certificaciones</h1><h2>AZ-900 · Azure Fundamentals</h2><p>Certificación activa. El temario consultado está vigente desde el 20 de julio de 2026.</p><p>{data.bank} preguntas de práctica · {data.reserved} reservadas para evaluación · {data.map.length} grupos de objetivos.</p><p>{data.reviewed} preguntas con revisión editorial registrada en esta versión. {data.reviewCandidates} pares candidatos a revisión por similitud textual.</p><p>AZ-104, SC-900 y otras certificaciones quedan pendientes de contenido y comprobación de vigencia.</p><a href={guide} target="_blank" rel="noreferrer">Ver guía oficial AZ-900</a></section>}
    {tab===15&&<section className="panel learn"><h1>Mi entrenamiento de hoy</h1><p>{data.settings.minutes} minutos · {objectives[data.coach.objective]}</p>
     <ol className="schedule">
      <li><span>Recuperación activa · {data.coach.budget.recall} min</span><button className="secondary" onClick={()=>navigate(10)}>Repasar tarjetas</button></li>
      <li><span>Microlección · {data.coach.budget.theory} min</span><button className="secondary" onClick={()=>openLesson(data.coach.objective)}>Estudiar {objectives[data.coach.objective]}</button></li>
      <li><span>Preguntas · {data.coach.budget.practice} min</span><button className="primary" disabled={busy} onClick={()=>void launch('adaptive',{objective:data.coach.objective,minutes:data.coach.budget.practice,coached:true})}>Iniciar práctica de hoy</button></li>
      <li><span>Aplicación · {data.coach.budget.apply} min</span><button className="secondary" onClick={()=>navigate(11)}>Resolver un caso de laboratorio</button></li>
      <li><span>Consolidación · {data.coach.budget.finish} min</span><button className="secondary" onClick={()=>navigate(3)}>Consultar errores pendientes</button></li>
     </ol>
     {data.plan.calendar[0]?.mode==='mock'&&<p><button className="secondary" onClick={today}>Empezar el simulacro previsto</button></p>}
     <h2>Esto es lo que has aprendido hoy</h2>
     {data.coach.answered?<p>{data.coach.correct} aciertos de {data.coach.answered} respuestas en {data.coach.todayObjectives.map(i=>objectives[i]).join(', ')}.</p>:<p>Responde preguntas o entrega tu evaluación para ver evidencias aquí.</p>}
     <p>{data.coach.recovered.length?'Recuperados hoy: '+data.coach.recovered.map(i=>objectives[i]).join(', '):'Aún sin nuevas evidencias de recuperación diferida hoy.'}</p>
     <p>{data.cardQueue.length} tarjetas listas · {data.plan.pending.length} objetivos todavía pendientes de evaluación o refuerzo.</p>
    </section>}
    {tab===16&&<section className="panel learn"><h1>Errores que ya he superado</h1><p>El criterio exige acertar dos preguntas distintas de la fallada con confianza suficiente y demostrarlo de nuevo al menos un día después.</p>
     {data.recovered.length?<ul>{data.recovered.map(item=><li key={item.objective}><button className="ghost" onClick={()=>openLesson(item.objective)}>{objectives[item.objective]} · {item.distinct} preguntas distintas</button></li>)}</ul>:<p>Todavía no hay evidencias de recuperación diferida en tus respuestas. Tras un fallo, estudia el concepto, aplica lo aprendido a otro caso y vuelve a repasarlo otro día.</p>}
    </section>}
   </>}
   </div>
  </main>
 </div>;
}
