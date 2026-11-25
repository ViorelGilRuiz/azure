import {dateKey,domainOf,percent,TEST_SIZE} from './catalog.ts';
import {masteryEvidence} from './learning';
export function shuffle<T>(items:T[],random=Math.random){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function quotas(n:number){
  const weights=[.28,.39,.33], raw=weights.map(w=>w*n), counts=raw.map(Math.floor);
  const order=[0,1,2].sort((a,b)=>(raw[b]-counts[b])-(raw[a]-counts[a]));
  order.slice(0,n-counts.reduce((a,b)=>a+b,0)).forEach(i=>counts[i]++);
  return counts;
}
export function score(choice:string[],keys:string[],ordered=false){
  return choice.length===keys.length && keys.every((key,i)=>ordered?choice[i]===key:choice.includes(key));
}
export function spaced(previous:number,correct:boolean,confidence:number,distinctDay:boolean){
  if(!correct || confidence<2)return 0;
  return distinctDay ? Math.min(previous+1,4) : previous;
}
export const intervals=[1,3,7,14,30];
export function dailyRandom(day:string){
  let seed=Array.from(day).reduce((a,b)=>Math.imul(31,a)+b.charCodeAt(0),0)>>>0;
  return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32;};
}
export const dueWeight=(correct:boolean,confidence:number,due:number,now:number)=> (correct?0:5)+(confidence<2?3:0)+(due<=now?4:0);
export type Evidence={correct:boolean;objective:number;started:number;mode:string;id:string;confidence:number;seconds:number;difficulty?:number;sessionId?:string;independent?:boolean};
export function summarize(rows:Evidence[],tests:{mode:string;score:number;finished:number;count?:number;independent?:boolean;onTime?:boolean}[],due:number,mastered:number){
  const rate=(r:Evidence[])=>percent(r.filter(a=>a.correct).length,r.length);
  const first=[...new Map([...rows].reverse().map(r=>[r.id,r])).values()];
  const groups=Array.from({length:12},(_,i)=>rows.filter(r=>r.objective===i));
  const domains=[0,1,2].map(i=>rows.filter(r=>domainOf(r.objective)===i));
  const mock=tests.filter(t=>t.mode==='mock'&&(t.count??0)>=TEST_SIZE&&t.finished>Date.now()-30*86400000).slice(0,5);
  const average=(numbers:number[])=>numbers.length?Math.round(numbers.reduce((a,b)=>a+b,0)/numbers.length):0;
  const coverage=percent(groups.filter(g=>new Set(g.map(r=>r.id)).size>=2).length,12);
  const pace=average(rows.map(r=>r.seconds));
  const independent=tests.filter(t=>t.mode==='mock'&&t.independent&&(t.count??0)>=TEST_SIZE&&t.finished>Date.now()-30*86400000).slice(0,3);
  const recentMockAnswers=rows.filter(r=>r.independent&&r.started>Date.now()-30*86400000);
  const independentMocks=[...new Map(recentMockAnswers.map(r=>[r.id,r])).values()];
  const mockDomainRates=[0,1,2].map(i=>rate(independentMocks.filter(r=>domainOf(r.objective)===i)));
  const components=[
    {name:'Simulacros con preguntas reservadas',weight:35,value:average(independent.map(t=>t.score))},
    {name:'Dominio y cobertura de objetivos',weight:25,value:Math.round(coverage*average(groups.map(rate))/100)},
    {name:'Retención en días diferentes',weight:20,value:percent(mastered,first.length)},
    {name:'Primer intento en preguntas nuevas',weight:15,value:rate(first)},
    {name:'Finalización de simulacros a tiempo',weight:5,value:percent(independent.filter(t=>t.onTime).length,independent.length)}
  ];
  const readiness=Math.round(components.reduce((sum,c)=>sum+c.weight*c.value/100,0));
  const requirements=[
    {text:'Completa tres simulacros íntegramente independientes recientes ('+independent.length+'/3)',met:independent.length>=3},
    {text:'Alcanza el 85 % en cada uno de esos tres simulacros',met:independent.length===3&&independent.every(t=>t.score>=85)},
    {text:'Alcanza el 80 % en cada dominio en simulacros recientes',met:mockDomainRates.every(value=>value>=80)},
    {text:'Evalúa todos los grupos de objetivos (actual '+coverage+' %)',met:coverage===100},
    {text:'Alcanza el 80 % al primer intento en preguntas distintas (actual '+rate(first)+' %)',met:first.length>=TEST_SIZE&&rate(first)>=80},
    {text:'Demuestra retención en al menos diez preguntas en días distintos ('+mastered+'/10)',met:mastered>=10},
    {text:'Responde todas las preguntas de esos simulacros dentro del tiempo',met:independent.length===3&&independent.every(t=>t.onTime)}
  ];
  const days=[...new Set(rows.map(r=>dateKey(r.started)))].sort();
  const dayOffset=(offset:number)=>dateKey(Date.now()-offset*86400000);
  let streak=0;
  const firstOffset=days.includes(dayOffset(0))?0:1;
  while(days.includes(dayOffset(firstOffset+streak)))streak++;
  let longest=0, run=0, prior=0;
  for(const day of days){const t=Date.parse(day);run=t-prior===86400000?run+1:1;longest=Math.max(longest,run);prior=t;}
  const objectives=groups.map((g,i)=>{
    const mastery=masteryEvidence(g,Date.now());
    const latest=[...new Map([...g].reverse().map(r=>[r.id,r])).values()];
    return {i,unique:mastery.distinct,value:mastery.accuracy,mastery:mastery.value,errors:latest.filter(r=>!r.correct).length,state:mastery.status};
  });
  const xp=first.reduce((x,r)=>x+(r.correct?10:3),0)+mastered*8;
  const byDifficulty=[1,2,3].map(i=>{const group=rows.filter(r=>r.difficulty===i);return {count:group.length,value:rate(group)};});
  const daily=days.filter(day=>day>=dayOffset(29)).map(day=>({day:day.slice(5),value:rate(rows.filter(r=>dateKey(r.started)===day))}));
  const seen=new Set<string>(), repeated:Evidence[]=[];
  for(const row of [...rows].reverse()){if(seen.has(row.id))repeated.push(row);seen.add(row.id);}
  const ready=requirements.every(r=>r.met), enough=independent.length>=3&&first.length>=TEST_SIZE;
  const priorities=[...objectives].sort((a,b)=>(a.unique<2?55:a.value)-(b.unique<2?55:b.value)||b.errors-a.errors||a.unique-b.unique);
  return {total:rows.length,unique:first.length,correct:rows.filter(r=>r.correct).length,rate:rate(rows),tests:tests.length,best:Math.max(0,...tests.map(t=>t.score)),average:average(tests.slice(0,5).map(t=>t.score)),seconds:rows.reduce((n,r)=>n+r.seconds,0),pace,due,coverage,streak,longest,xp,level:Math.min(6,1+Math.floor(xp/220)),readiness,components,freshRate:rate(first),repeatRate:rate(repeated),repeatCount:repeated.length,weeklyRate:rate(rows.filter(r=>r.started>Date.now()-7*86400000)),status:!enough?'Evaluación insuficiente':ready?'Preparación sólida':readiness>=70?'Cerca del objetivo':readiness>=45?'En progreso':'Necesitas practicar',verdict:ready?'Puedes plantearte presentarte':enough?'Todavía no te recomiendo presentarte':'Aún no hay datos suficientes para recomendarte presentarte',requirements,objectives,domains:domains.map(rate),byDifficulty,daily,mocks:mock.reverse().map((t,i)=>({day:String(i+1),value:t.score})),overconfidence:rows.filter(r=>!r.correct&&r.confidence===3).length,recommendation:priorities[0].i,priorities:priorities.slice(0,3),weekly:rows.filter(r=>r.started>Date.now()-7*86400000).length,latestDaily:tests.filter(t=>t.mode==='daily').slice(0,2).map(t=>t.score)};
}

