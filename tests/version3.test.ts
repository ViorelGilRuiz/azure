import {afterEach,describe,expect,it,vi} from 'vitest';
import {examEvidence,independentSelection} from '../lib/exams';
import {coachingBudget,recoveredObjectives} from '../lib/learning';
import {bank,byId} from '../lib/bank';
import {GET,POST} from '../app/api/lab/route';
import type {Evidence} from '../lib/engine';

afterEach(()=>vi.unstubAllEnvs());
const scoringRows=([14,20,16] as const).flatMap((count,domain)=>Array.from({length:count},(_,i)=>({id:domain+'-'+i,objective:[0,6,9][domain],family:domain+'-'+i,reviewed:true,reserved:true})));

describe('AZ-900 3.0',()=>{
 it('filtra familias expuestas, revisión y reserva antes de asignar un simulacro completo',()=>{
  expect(independentSelection(scoringRows,50,new Set(),()=>.5)).toHaveLength(50);
  expect(independentSelection(scoringRows,50,new Set(['0-0']),()=>.5)).toBeNull();
  expect(independentSelection(scoringRows.map((q,i)=>({...q,reviewed:i!==0})),50,new Set(),()=>.5)).toBeNull();
  expect(examEvidence(scoringRows,'mixed',new Set())).toBe(false);
  expect(examEvidence(scoringRows,'independent',new Set())).toBe(true);
  expect(examEvidence(scoringRows.map((q,i)=>i===1?{...q,family:scoringRows[0].family}:q),'independent',new Set())).toBe(false);
 });
 it('preserva los IDs preexistentes y vincula variantes de una misma familia',()=>{
  expect(bank[0].question.id).toBe('az900-001');
  expect(byId.get('az900-179')?.question.id).toBe('az900-179');
  expect(byId.get('az900-069')?.family).toBe(byId.get('az900-eval-034')?.family);
 });
 it('exige preguntas distintas y una verificación diferida para recuperar un objetivo',()=>{
  const start=Date.parse('2026-11-20T12:00:00Z');
  const first={id:'a',objective:6,mode:'quick',started:start,correct:false,confidence:3,seconds:20} satisfies Evidence;
  const a={...first,id:'b',correct:true,started:start+4000};
  const b={...a,id:'c',started:start+2*86400000};
  expect(recoveredObjectives([first,a,{...a,started:b.started}])).toEqual([]);
  expect(recoveredObjectives([first,a,b])[0]).toMatchObject({objective:6,distinct:2});
 });
 it('mantiene el presupuesto diario y permite sesiones cortas',()=>{
  expect(coachingBudget(45)).toEqual({recall:5,theory:10,practice:20,apply:5,finish:5});
  const short=coachingBudget(15);
  expect(Object.values(short).reduce((sum,n)=>sum+n,0)).toBe(15);
  expect(short.practice).toBeLessThan(20);
 });
 it('protege el progreso, la exportación y las mutaciones del despliegue sin sesión',async()=>{
  vi.stubEnv('AZURE_DEPLOYMENT','cloud');
  vi.stubEnv('AZURE_PUBLIC_ORIGIN','https://azurecert.netlify.app');
  vi.stubEnv('SUPABASE_URL','https://contract-test.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','contract-test-key');
  for(const query of ['', '?export', '?backup','?csv','?id=15ca05e8-184a-4716-8bd1-88f1cfa49b63']){
   const response=await GET(new Request('https://azurecert.netlify.app/api/lab'+query));
   expect(response.status).toBe(401);
   expect(response.headers.get('Cache-Control')).toContain('no-store');
  }
  const action=(origin:string)=>POST(new Request('https://azurecert.netlify.app/api/lab',{method:'POST',headers:{Origin:origin},body:JSON.stringify({action:'start',value:{mode:'quick'}})}));
  expect((await action('https://otro.example')).status).toBe(403);
  expect((await action('https://azurecert.netlify.app')).status).toBe(401);
 });
});
