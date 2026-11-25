import {readFileSync} from 'node:fs';

const [sourcePath,targetPath]=process.argv.slice(2);
if(!sourcePath||!targetPath)throw new Error('Indica los archivos JSON de origen y destino.');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const source=read(sourcePath), target=read(targetPath);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const targetSessions=new Map(target.sessions.map(session=>[session.id,session]));
const targetReviews=new Map((target.reviews??[]).map(review=>[review.request,review]));
const changed=source.sessions.filter(original=>{
 const migrated=targetSessions.get(original.id);
 return !migrated||!equal(original.answers,migrated.answers)||!equal(original.questions.map(q=>q.id),migrated.questions.map(q=>q.id))
  ||['started','finished','deadline','position','mode'].some(field=>original[field]!==migrated[field])||!equal(original.flags,migrated.flags);
}).length;
const changedReviews=(source.reviews??[]).filter(review=>!equal(review,targetReviews.get(review.request))).length;
const preferences=equal(source.settings,target.settings);
console.log(JSON.stringify({sessionsChecked:source.sessions.length,changed,changedReviews,preferences},null,2));
if(changed||changedReviews||!preferences)process.exitCode=1;
