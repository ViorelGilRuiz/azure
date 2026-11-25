import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
import {withProgress,exportProgress} from '../lib/store';
import {bank} from '../lib/bank';

it('aplica la migración PostgreSQL y aísla dos usuarios con RLS y revisiones',async()=>{
 const pg=new PGlite();
 const a='0f2b8721-1a99-44c8-b3ea-02854c16aab8', b='4e03491d-aab1-4c34-bc55-0a709d45469a';
 try{
  await pg.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable
   as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
   grant usage on schema auth to authenticated;
   insert into auth.users(id) values ('${a}'),('${b}');`);
  await pg.exec(readFileSync('supabase/migrations/202611250001_progress.sql','utf8'));
  await pg.exec('set role anon');
  await expect(pg.query('select * from public.azure_progress')).rejects.toThrow();
  await expect(pg.query("select public.azure_save_progress(0, '{}'::jsonb)")).rejects.toThrow();
  await pg.exec('reset role; set role authenticated');
  const user=async(id:string)=>pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const state=async()=>pg.query<{revision:number;progress:unknown}>('select revision, progress from public.azure_progress');
  const save=async(revision:number,data:unknown)=>(await pg.query<{saved:boolean}>('select public.azure_save_progress($1,$2::jsonb) as saved',[revision,JSON.stringify(data)])).rows[0].saved;
  const question=bank[0];
  const started=Date.parse('2026-11-24T10:00:00Z');
  const legacy={version:1,settings:{target:'2026-12-25',minutes:45,theme:'dark'},sessions:[{
    id:'940760dc-61aa-4cf0-bffe-dca68460b89a',mode:'quick',started,deadline:null,finished:started+5000,
    position:0,flags:[],questions:[question.question],answers:{[question.question.id]:{choice:question.feedback.keys,confidence:2,seconds:5}}
  }]};
  const canonical=withProgress(legacy,exportProgress).progress;
  await user(a);
  expect(await save(0,canonical)).toBe(true);
  expect(await save(0,canonical)).toBe(false);
  expect((await state()).rows[0].progress).toEqual(canonical);
  await user(b);
  expect((await state()).rows).toEqual([]);
  expect(await save(1,{version:2})).toBe(false);
  await expect(pg.query("update public.azure_progress set progress = '{}'::jsonb where user_id = $1",[a])).rejects.toThrow();
  expect(await save(0,{version:2,sessions:[]})).toBe(true);
  await user(a);
  expect((await state()).rows).toEqual([{revision:1,progress:canonical}]);
  expect(await save(1,canonical)).toBe(true);
  expect((await state()).rows[0].revision).toBe(2);
 }finally{await pg.close();}
});

