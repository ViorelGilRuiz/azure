import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {bank} from '../lib/bank';

it('migra una copia del esquema 1 y conserva la sesión, las respuestas y las preferencias personalizadas',async()=>{
 const parent=join(process.cwd(),'data');
 mkdirSync(parent,{recursive:true});
 const folder=mkdtempSync(join(parent,'migration-test-'));
 process.env.AZURE_EXAM_DATA=folder;
 const db=new DatabaseSync(join(folder,'progress.sqlite'));
 db.exec('CREATE TABLE exam_session(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE study_settings(id INTEGER PRIMARY KEY,payload TEXT NOT NULL); PRAGMA user_version=1');
 const id=randomUUID(), item=bank[0], now=Date.now();
 const legacy={id,mode:'quick',questions:[item.question],answers:{[item.question.id]:{choice:item.feedback.keys,confidence:3,seconds:22}},flags:[],position:0,started:now-50000,finished:now-28000,deadline:null};
 db.prepare('INSERT INTO exam_session VALUES (?,?)').run(id,JSON.stringify(legacy));
 db.prepare('INSERT INTO study_settings VALUES (?,?)').run(1,JSON.stringify({target:'2027-03-10',minutes:60,theme:'light'})); db.close();
 try{
  const s=await import('../lib/store');
  const initial=s.dashboard();
  expect(initial.stats).toMatchObject({tests:1,total:1,correct:1});
  expect(initial.settings).toEqual({target:'2027-03-10',minutes:60,theme:'light'});
  expect(s.view(id).answers[item.question.id].feedback?.correct).toBe(true);
  const request=randomUUID();
  s.rateCard({id:0,rating:2,request});
  s.rateCard({id:0,rating:2,request});
  expect(s.dashboard().cardQueue.some(c=>c.id===0)).toBe(false);
  const exported=s.exportProgress();
  expect(exported.reviews).toHaveLength(1);
  s.importProgress(exported);
  expect(s.exportProgress().sessions).toHaveLength(1);
  expect(s.exportProgress().reviews).toHaveLength(1);
  const copied=s.change({id,qid:item.question.id,finish:true});
  expect(copied.finished).toBe(legacy.finished);
  expect(s.dashboard().stats.total).toBe(1);
  expect((await s.backupProgress()).subarray(0,15).toString()).toBe('SQLite format 3');
 }finally{delete process.env.AZURE_EXAM_DATA;}
});

