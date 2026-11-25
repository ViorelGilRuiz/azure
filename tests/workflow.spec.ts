import {test,expect,type Page} from '@playwright/test';
import {bank} from '../lib/bank';
import {TEST_SIZE} from '../lib/catalog';
import {mkdirSync} from 'node:fs';
async function answerVisible(page:Page){
 const id=await page.locator('.question').getAttribute('data-question-id');
 const active=page.locator('[data-question-id="'+id+'"]');
 const rows=active.locator('.matrix-row');
 const matrix=await rows.count();
 if(matrix){for(let i=0;i<matrix;i++)await rows.nth(i).locator('input').first().click();return;}
 const ordering=active.locator('fieldset button.option');
 const ordered=await ordering.count();
 if(ordered){for(let i=0;i<ordered;i++)await ordering.nth(i).click();return;}
 const options=active.locator('fieldset input');
 const multiple=await options.first().getAttribute('type')==='checkbox';
 const selection=multiple?Number((await active.locator('fieldset > legend').innerText()).match(/\d+/)?.[0]??2):1;
 for(let i=0;i<selection;i++)await options.nth(i).click();
}
function wrongChoice(item:typeof bank[number]){
 const keys=item.feedback.keys;
 if(item.question.type==='ordenación')return [...keys].reverse();
 const first=item.question.choices.find(option=>option.id===keys[0])!;
 const distractor=item.question.choices.find(option=>!keys.includes(option.id)&&option.group===first.group)!.id;
 return [...keys.slice(1),distractor];
}

test('evaluación inicial, reanudación y corrección tras la entrega',async({page})=>{
 await page.goto('/');
 if(process.env.AZURE_CAPTURE){
  await page.setViewportSize({width:1440,height:1000});
  mkdirSync('docs',{recursive:true});
  await expect(page.getByRole('heading',{name:'Inicio',exact:true})).toBeVisible();
  await page.screenshot({path:'docs/inicio.png',fullPage:true,animations:'disabled'});
 }
 await page.getByRole('button',{name:'Comenzar evaluación inicial'}).click();
 await expect(page.getByText('Pregunta 1 de 40')).toBeVisible();
 await expect(page.getByRole('timer',{name:'Tiempo restante'})).toBeVisible();
 await expect(page.getByText('por pregunta pendiente.',{exact:false})).toBeVisible();
 await answerVisible(page);
 await expect(page.getByText('Pregunta 2 de 40')).toBeVisible();
 await expect(page.getByText('1 respondidas · 39 pendientes')).toBeVisible();
 await expect(page.getByText('Consultar Microsoft Learn')).toHaveCount(0);
 await page.reload();
 await page.getByRole('button',{name:'Evaluación inicial · 1/40'}).click();
 await expect(page.getByText('Pregunta 2 de 40')).toBeVisible();
 await expect(page.getByText('1 respondidas · 39 pendientes')).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Entregar sesión'}).click();
 await expect(page.getByRole('heading',{name:/Resultados/})).toBeVisible();
 await page.locator('.session > details > summary').first().click();
 await expect(page.getByRole('link',{name:'Consultar Microsoft Learn'})).toBeVisible();
 await page.getByRole('button',{name:'Aprender de mis errores'}).click();
 await expect(page.getByRole('heading',{name:'Itinerario de recuperación'})).toBeVisible();
 await page.getByRole('button',{name:'Volver a las correcciones'}).click();
 await page.getByRole('button',{name:'Volver a inicio'}).click();
 await expect(page.getByRole('button',{name:'Continuar entrenamiento'})).toBeVisible();
});

test('el test rápido conserva la corrección y termina al seleccionar la última respuesta',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Hacer test'}).click();
 await page.getByRole('button',{name:'Empezar test'}).click();
 await expect(page.getByRole('timer',{name:'Tiempo transcurrido'})).toBeVisible();
 await page.getByRole('button',{name:'Pantalla limpia',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Principal'})).toBeHidden();
 await page.getByRole('button',{name:'Salir de pantalla limpia'}).click();
 for(let i=1;i<=TEST_SIZE;i++){
  await expect(page.getByText('Pregunta '+i+' de 40')).toBeVisible();
  await answerVisible(page);
  if(i===1){
   await expect(page.getByText(/Ver explicación de la pregunta anterior/)).toBeVisible();
   await expect(page.getByText('Refuerzo prioritario')).toBeVisible();
  }
 }
 await expect(page.getByRole('heading',{name:'Resultados del test rápido'})).toBeVisible();
});

test('simulacro, caducidad y copia de seguridad SQLite',async({request})=>{
 const response=await request.post('/api/lab',{data:{action:'start',value:{mode:'mock',minutes:1}}});
 expect(response.ok()).toBe(true);
 const session=await response.json();
 expect(session.questions).toHaveLength(TEST_SIZE);
 expect(session.deadline-session.started).toBe(60000);
 const exported=await (await request.get('/api/lab?export')).json();
 const expired={...session,id:'a897565e-5208-4d4c-a4e2-df186a537e34',deadline:Date.now()-1,started:Date.now()-60001};
 const imported=await request.post('/api/lab',{data:{action:'import',value:{...exported,sessions:[expired]}}});
 expect(imported.ok()).toBe(true);
 const reopened=await (await request.get('/api/lab?id='+expired.id)).json();
 expect(reopened.finished).toBe(expired.deadline);
 const backup=await request.get('/api/lab?backup');
 expect(backup.ok()).toBe(true);
 expect((await backup.body()).subarray(0,15).toString()).toBe('SQLite format 3');
});

test('un error aparece en la cola y un acierto inmediato no lo elimina',async({request})=>{
 const call=async(action:string,value:unknown)=>{
  const res=await request.post('/api/lab',{data:{action,value}});
  expect(res.ok()).toBe(true);
  return res.json();
 };
 const incorrect=await call('start',{mode:'quick'});
 const item=bank.find(entry=>entry.question.id===incorrect.questions[0].id)!;
 const qid=item.question.id;
 const keys=item.feedback.keys;
 const graded=await call('change',{id:incorrect.id,qid,answer:{choice:wrongChoice(item),confidence:3,seconds:15},finish:true});
 expect(graded.answers[qid].feedback.correct).toBe(false);
 const review=await call('start',{mode:'review'});
 expect(review.questions.map((q:{id:string})=>q.id)).toContain(qid);
 const retry=await call('change',{id:review.id,qid,answer:{choice:keys,confidence:3,seconds:10},finish:true});
 expect(retry.answers[qid].feedback.correct).toBe(true);
 const next=await call('start',{mode:'review'});
 expect(next.questions.map((q:{id:string})=>q.id)).toContain(qid);
});

test('todos los modos nuevos conservan 40 preguntas originales distintas',async({request})=>{
 const cases=[{mode:'initial'},{mode:'quick',difficulty:3},{mode:'domain',domain:0},{mode:'domain',domain:1},{mode:'domain',domain:2,objective:9},{mode:'mock'},{mode:'adaptive'},{mode:'review'},{mode:'daily'},{mode:'timed'},{mode:'survival'}];
 for(const value of cases){
  const reply=await request.post('/api/lab',{data:{action:'start',value}});
  expect(reply.ok()).toBe(true);
  const {questions}=await reply.json();
  expect(questions).toHaveLength(TEST_SIZE);
  expect(new Set(questions.map((q:{id:string})=>q.id)).size).toBe(TEST_SIZE);
 }
});

test('la práctica con límite muestra el reloj y los errores alimentan el refuerzo',async({page,request})=>{
 const seeded=await (await request.post('/api/lab',{data:{action:'start',value:{mode:'adaptive',objective:11}}})).json();
 const known=seeded.questions.filter((q:{objective:number})=>q.objective===11).slice(0,4);
 expect(known).toHaveLength(4);
 for(const [index,q] of known.entries()){
  const item=bank.find(entry=>entry.question.id===q.id)!;
  const keys=item.feedback.keys;
  const wrong=item.question.choices.find(option=>!keys.includes(option.id))!.id;
  const recorded=await request.post('/api/lab',{data:{action:'change',value:{id:seeded.id,qid:q.id,answer:{choice:[...keys.slice(1),wrong],confidence:3,seconds:12},finish:index===3}}});
  expect(recorded.ok()).toBe(true);
 }
 await page.goto('/');
 await page.getByRole('button',{name:'Hacer test'}).click();
 await page.getByRole('combobox',{name:'Tiempo',exact:true}).selectOption('45');
 await page.getByRole('button',{name:'Empezar test'}).click();
 await expect(page.getByRole('timer',{name:'Tiempo restante'})).toBeVisible();
 await page.getByRole('button',{name:'Qué reforzar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Qué reforzar',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Entrenar este objetivo'})).toHaveCount(3);
 await expect(page.getByText('Errores de tus tests').first()).toBeVisible();
 await page.getByRole('button',{name:'Entrenar este objetivo'}).first().click();
 await expect(page.getByText('Pregunta 1 de 40')).toBeVisible();
});

test('academia, tarjetas y mapa funcionan en móvil',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const failures:string[]=[];
 page.on('pageerror',error=>failures.push(error.message));
 await page.getByRole('button',{name:'Academia',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Academia Azure'})).toBeVisible();
 await page.getByRole('button',{name:'Almacenamiento',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Almacenamiento',exact:true})).toBeVisible();
 await page.getByText('Comprobar respuesta',{exact:true}).click();
 await expect(page.getByText('Azure Files. Blob Storage está diseñado para objetos.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Flashcards',exact:true}).click();
 await page.getByRole('button',{name:'Ver respuesta'}).click();
 await page.getByRole('button',{name:'Bien',exact:true}).click();
 await expect(page.getByText(/37 tarjetas listas/)).toBeVisible();
 await page.getByRole('button',{name:'Mapa de conocimientos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mapa de conocimientos'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(failures).toEqual([]);
});

test('las preguntas reservadas no aparecen en entrenamiento ni muestran soluciones antes de la entrega',async({request})=>{
 const training=await (await request.post('/api/lab',{data:{action:'start',value:{mode:'adaptive'}}})).json();
 expect(training.questions.every((q:{id:string})=>!q.id.includes('-eval-'))).toBe(true);
 const exam=await (await request.post('/api/lab',{data:{action:'start',value:{mode:'mock',count:50}}})).json();
 expect(exam.questions).toHaveLength(50);
 const question=exam.questions.find((q:{id:string})=>q.id.includes('-eval-'));
 expect(question).toBeDefined();
 const saved=await (await request.post('/api/lab',{data:{action:'change',value:{id:exam.id,qid:question.id,answer:{choice:[question.choices[0].id],confidence:2,seconds:12}}}})).json();
 expect(saved.answers[question.id]).not.toHaveProperty('feedback');
 expect(saved).not.toHaveProperty('report');
 const results=await (await request.post('/api/lab',{data:{action:'change',value:{id:exam.id,finish:true}}})).json();
 expect(results.answers[question.id].feedback).toBeDefined();
 expect(results.report.firstSeen).toBe(1);
});

test('la matriz y el orden se corrigen según sus propias reglas',async({request})=>{
 for(const id of ['az900-186','az900-188']){
  const item=bank.find(entry=>entry.question.id===id)!;
  const created=await (await request.post('/api/lab',{data:{action:'start',value:{mode:'adaptive',transfer:id}}})).json();
  if(item.question.type==='matriz'){
   const sameGroup=item.question.choices.filter(q=>q.group===item.question.choices[0].group).map(q=>q.id);
   const invalid=await request.post('/api/lab',{data:{action:'change',value:{id:created.id,qid:id,answer:{choice:sameGroup,confidence:2,seconds:10}}}});
   expect(invalid.status()).toBe(400);
  }
  const wrong=await (await request.post('/api/lab',{data:{action:'change',value:{id:created.id,qid:id,answer:{choice:wrongChoice(item),confidence:2,seconds:10},finish:true}}})).json();
  expect(wrong.answers[id].feedback.correct).toBe(false);
  const retry=await (await request.post('/api/lab',{data:{action:'start',value:{mode:'adaptive',transfer:id}}})).json();
  const graded=await (await request.post('/api/lab',{data:{action:'change',value:{id:retry.id,qid:id,answer:{choice:item.feedback.keys,confidence:2,seconds:10},finish:true}}})).json();
  expect(graded.answers[id].feedback.correct).toBe(true);
 }
});
