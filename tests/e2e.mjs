import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const probe=createServer().listen(0,'localhost');
await once(probe,'listening');
const {port}=probe.address();
await new Promise((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
const url='http://localhost:'+port;
const local=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','localhost','--port',String(port)],{
 stdio:'inherit',env:{...process.env,AZURE_EXAM_DATA:join(process.cwd(),'data','e2e-'+Date.now())}
});
try{
 const until=Date.now()+30000;
 while(true){
  if(local.exitCode!==null||Date.now()>until)throw new Error('El servidor de pruebas no responde.');
  const res=await fetch(url+'/api/lab').catch(()=>null);
  if(res?.ok)break;
  await delay(250);
 }
 const runner=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,AZURE_TEST_URL:url}
 });
 const [code]=await once(runner,'exit');
 process.exitCode=code??1;
}finally{local.kill();}

