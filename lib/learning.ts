import {dateKey,percent} from './catalog';
import type {Evidence} from './engine';
const day=86400000;
const gaps=[0,1,3,7,14,30];
export type CardReview={id:number;rating:number;at:number;step:number;due:number};
export function reviewCard(id:number,rating:number,at:number,previous?:CardReview):CardReview{
 const old=previous?.step??0;
 const distinct=!previous||dateKey(previous.at)!==dateKey(at);
 const candidate=rating===0?0:rating===1?Math.max(1,old-1):!distinct?Math.max(1,old):Math.min(5,old+(rating===3&&old>0?2:1));
 return {id,rating,at,step:candidate,due:at+(candidate?gaps[candidate]*day:5*60000)};
}
export function masteryEvidence(rows:Evidence[],now:number){
 const byQuestion=new Map<string,Evidence[]>();
 for(const row of rows){
  const attempts=byQuestion.get(row.id)??[];
  attempts.push(row);byQuestion.set(row.id,attempts);
 }
 const ordered=[...byQuestion.values()].map(attempts=>attempts.sort((a,b)=>b.started-a.started));
 const distinct=ordered.length;
 const recent=ordered.filter(a=>a[0].started>=now-30*day);
 const latest=recent.map(a=>a[0]);
 const retained=recent.filter(([last,...older])=>last.correct&&last.confidence>=2&&older.some(a=>a.started<=last.started-day)).length;
 const applied=latest.filter(r=>r.correct&&(r.difficulty??1)>=2).length;
 const confident=latest.filter(r=>r.correct&&r.confidence>=2).length;
 const accuracy=percent(latest.filter(r=>r.correct).length,latest.length);
 const value=Math.round(.45*accuracy+.2*percent(applied,latest.length)+.15*percent(confident,latest.length)+.2*percent(retained,latest.length));
 const status=!distinct?'Sin evaluar':latest.length<2?'Principiante':accuracy<60?'Necesita refuerzo':distinct>=5&&retained>=2&&applied>=2&&value>=80?'Dominado':distinct>=4&&value>=70?'Consolidado':'En progreso';
 return {distinct,retained,applied,value,status,last:rows.length?Math.max(...rows.map(r=>r.started)):null,accuracy};
}
const schedule=[
 [0,2,1,3,2,0,3],[4,5,6,7,6,5,7],[8,9,10,11,9,8,11],[2,6,7,11,8,9,10,5,3]
];
export function recoveredObjectives(rows:Evidence[]){
 const groups=new Map<number,Evidence[]>();
 for(const event of [...rows].sort((a,b)=>a.started-b.started)){
  const group=groups.get(event.objective)??[];
  group.push(event);groups.set(event.objective,group);
 }
 return [...groups].flatMap(([objective,events])=>{
  const lastMistake=events.findLastIndex(event=>!event.correct);
  if(lastMistake<0)return [];
  const mistake=events[lastMistake];
  const evidence=events.slice(lastMistake+1).filter(event=>event.correct&&event.confidence>=2&&event.id!==mistake.id);
  const ids=new Set(evidence.map(event=>event.id));
  const later=evidence.find(event=>event.started-mistake.started>=day);
  return ids.size>=2&&later?[{objective,failed:mistake.started,recovered:later.started,distinct:ids.size}]:[];
 });
}
export function coachingBudget(minutes:number){
  const recall=Math.max(1,Math.round(minutes/9)),theory=Math.max(2,Math.floor(minutes*2/9));
  const apply=Math.max(1,Math.floor(minutes/9)),finish=Math.max(1,Math.floor(minutes/9));
  return {recall,theory,practice:minutes-recall-theory-apply-finish,apply,finish};
}
export function dailyPlan(target:string,minutes:number,weak:number[],now:number){
 const today=dateKey(now);
 const days=Math.max(0,Math.round((Date.parse(target)-Date.parse(today))/day));
 const calendar=Array.from({length:Math.min(30,days+1)},(_,offset)=>{
  const until=days-offset;
  const phase=until>=23?0:until>=16?1:until>=9?2:3;
  const index=(30-Math.min(30,until))%schedule[phase].length;
  return {date:new Date(Date.parse(today)+offset*day).toISOString().slice(0,10),objective:offset===0&&weak.length?weak[0]:schedule[phase][index],mode:until<=8&&(until%3===0||until===1)?'mock' as const:'adaptive' as const,phase};
 });
 const review=Math.floor(minutes*2/9), concepts=Math.floor(minutes/3), practice=Math.floor(minutes/3);
 return {days,calendar,minutes,review,concepts,practice,reflection:minutes-review-concepts-practice};
}

