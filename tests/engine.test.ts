import {describe,expect,it} from 'vitest';
import {bank,validateBank} from '../lib/bank';
import {dailyRandom,dueWeight,intervals,quotas,score,shuffle,spaced,summarize,type Evidence} from '../lib/engine';

describe('AZ-900',()=>{
 it('valida el banco original y sus objetivos',()=>{
  expect(validateBank().questions).toBeGreaterThanOrEqual(150);
  expect(validateBank().objectives).toBe(12);
  expect(bank.every(x=>new URL(x.feedback.source).hostname==='learn.microsoft.com')).toBe(true);
 });
 it('explica cada distractor de los casos prácticos con una referencia directa',()=>{
  const cases=bank.filter(x=>x.reviewed==='2026-11-25');
  expect(cases).toHaveLength(34);
  for(const {feedback,question} of cases){
   const alternatives=question.choices.filter(option=>!feedback.keys.includes(option.id));
   expect(new Set(alternatives.map(option=>feedback.choices[option.id])).size).toBe(alternatives.length);
   expect(feedback.source).toMatch(/learn\.microsoft\.com\/en-us\/(azure|entra|training)\//);
  }
 });
 it('corrige una respuesta múltiple sin depender del orden y rechaza parciales',()=>{
  expect(score(['2','0'],['0','2'])).toBe(true);
  expect(score(['0'],['0','2'])).toBe(false);
  expect(score(['0','0'],['0','2'])).toBe(false);
 });
 it('respeta los pesos de los 40 y 50 ejercicios',()=>{
  expect(quotas(40)).toEqual([11,16,13]);
  expect(quotas(50)).toEqual([14,20,16]);
 });
 it('aleatoriza sin perder opciones y conserva el desafío del día',()=>{
  const source=[1,2,3,4,5,6,7,8,9];
  const a=shuffle(source,dailyRandom('2026-11-24'));
  expect(a).not.toEqual(source);
  expect(a).toEqual(shuffle(source,dailyRandom('2026-11-24')));
  expect([...a].sort()).toEqual(source);
 });
 it('prioriza fallos de baja confianza y revisiones vencidas',()=>{
  expect(dueWeight(false,0,10,20)).toBeGreaterThan(dueWeight(true,3,30,20));
 });
 it('aplica intervalos y requiere días distintos para avanzar',()=>{
  expect(intervals).toEqual([1,3,7,14,30]);
  expect(spaced(1,true,3,true)).toBe(2);
  expect(spaced(1,true,3,false)).toBe(1);
  expect(spaced(3,false,3,true)).toBe(0);
  expect(spaced(3,true,0,true)).toBe(0);
 });
 it('empieza con estadísticas vacías y preparación insuficiente',()=>{
  const s=summarize([],[],0,0);
  expect(s.status).toBe('Evaluación insuficiente');
  expect(s.readiness).toBe(0);
  expect(s.xp).toBe(0);
 });
 it('otorga XP por identificación inicial, no por repetir una respuesta',()=>{
  const answer={id:'az900-001',correct:true,objective:0,started:Date.now(),mode:'quick',confidence:2,seconds:22};
  expect(summarize([answer,answer],[],0,0).xp).toBe(10);
 });
 it('recomienda presentarse solo cuando se cumplen los criterios de práctica',()=>{
  const now=Date.now();
  const good:Evidence[]=Array.from({length:48},(_,i)=>({id:'p'+i,correct:true,objective:i%12,started:now,mode:'mock',independent:true,confidence:2,seconds:30}));
  const mocks=Array.from({length:3},()=>({mode:'mock',score:90,finished:now,count:40,independent:true,onTime:true}));
  expect(summarize(good,mocks.slice(0,2),0,30).verdict).toMatch(/datos suficientes/);
  expect(summarize(good,mocks,0,30).verdict).toBe('Puedes plantearte presentarte');
  const weak=good.map(row=>({...row,correct:row.objective!==7}));
  const review=summarize(weak,mocks.map(m=>({...m,score:80})),0,30);
  expect(review.verdict).toBe('Todavía no te recomiendo presentarte');
  expect(review.recommendation).toBe(7);
 });
});

