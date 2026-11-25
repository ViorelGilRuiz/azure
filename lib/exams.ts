import {domainOf, type ExamKind} from './catalog';
import {quotas,shuffle} from './engine';

export type ExamItem={id:string;objective:number;family:string;reviewed:boolean;reserved:boolean};
export function independentSelection<T extends ExamItem>(items:T[],count:number,seen:Set<string>,random=Math.random){
 const allowed=shuffle(items.filter(q=>q.reserved&&q.reviewed&&!seen.has(q.family)),random);
 const chosen:T[]=[];
 const families=new Set<string>();
 for(const [domain,needed] of quotas(count).entries()){
  const group:T[]=[];
  for(const q of allowed){
   if(group.length===needed)break;
   if(domainOf(q.objective)!==domain||families.has(q.family))continue;
   group.push(q);families.add(q.family);
  }
  if(group.length<needed)return null;
  chosen.push(...group);
 }
 return shuffle(chosen,random);
}
export function examEvidence(items:ExamItem[],kind:ExamKind|undefined,seen:Set<string>){
 if(kind!=='independent'||items.length<40)return false;
 const families=new Set(items.map(q=>q.family));
 return families.size===items.length&&items.every(q=>q.reserved&&q.reviewed&&!seen.has(q.family));
}
