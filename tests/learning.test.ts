import {describe,expect,it} from 'vitest';
import {cards,coverageMap,lessons} from '../lib/academy';
import {bank,reservedBank} from '../lib/bank';
import {dailyPlan,masteryEvidence,reviewCard} from '../lib/learning';
describe('Entrenamiento 2.0',()=>{
 it('mantiene la trazabilidad entre los 12 objetivos, lecciones, tarjetas y preguntas',()=>{
  expect(lessons).toHaveLength(12);
  for(const row of coverageMap){
   expect(row.concepts.length).toBeGreaterThan(1);
   expect(row.cards.every(id=>cards[id].objective===row.objective)).toBe(true);
   expect(bank.filter(q=>q.question.objective===row.objective).length).toBeGreaterThan(1);
  }
  expect(reservedBank.every(q=>q.reserved&&!bank.some(b=>b.question.id===q.question.id))).toBe(true);
 });
 it('reduce el intervalo cuando falla y evita subirlo dos veces el mismo día',()=>{
  const now=Date.parse('2026-11-25T10:00:00Z');
  const initial=reviewCard(1,3,now);
  const repeat=reviewCard(1,3,now+600000,initial);
  expect(initial.step).toBe(1);
  expect(repeat.step).toBe(1);
  const later=reviewCard(1,2,now+86400000,repeat);
  expect(later.step).toBe(2);
  expect(reviewCard(1,0,now+86400000,later).step).toBe(0);
 });
 it('no confunde repetición de una sola pregunta con dominio',()=>{
  const now=Date.now();
  const rows=Array.from({length:7},(_,i)=>({id:'same',correct:true,objective:0,started:now-i*86400000,mode:'quick',confidence:3,seconds:15,difficulty:2}));
  expect(masteryEvidence(rows,now)).toMatchObject({distinct:1,status:'Principiante'});
 });
 it('recalcula el calendario sin perder la fecha objetivo ni los objetivos débiles',()=>{
  const now=Date.parse('2026-11-25T10:00:00Z');
  const plan=dailyPlan('2026-12-25',45,[6],now);
  expect(plan.days).toBe(30);
  expect(plan.calendar).toHaveLength(30);
  expect(plan.calendar[0].objective).toBe(6);
  expect([plan.review,plan.concepts,plan.practice,plan.reflection]).toEqual([10,15,15,5]);
  expect(dailyPlan('2026-12-25',45,[2],now+86400000).calendar[0]).toMatchObject({date:'2026-11-26',objective:2});
 });
});

