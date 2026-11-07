import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {FirestoreStore,ConflictError} from '../store.mjs';
import {createApp} from '../app.mjs';
function database({fail=null}={}){
 const data=new Map([['gubae_meta/state',{initialized:true,version:1}],['gubae_meetings/a',{topic:'A',revision:1}],['gubae_meetings/b',{topic:'B',revision:1}],['gubae_teachers/t',{name:'Teacher',revision:1}],['gubae_settings/email-reminders',{recipients:[],revision:1}]]);
 const stats={reads:0,queries:0};let block=fail;
 const snap=path=>{stats.reads++;return{id:path.split('/').pop(),ref:{path},exists:data.has(path),data:()=>structuredClone(data.get(path))}};
 const check=async()=>{await new Promise(r=>setTimeout(r,5));if(block)throw block;};
 const ref=path=>({path,id:path.split('/').pop(),get:async()=>{await check();return snap(path)}});
 const db={doc:ref,collection:name=>({name,doc:id=>ref(name+'/'+id),get:async()=>{await check();stats.queries++;return{docs:[...data.keys()].filter(k=>k.startsWith(name+'/')).sort().map(snap)}}}),
  runTransaction:async fn=>{await check();const writes=[];const result=await fn({get:async r=>snap(r.path),getAll:async(...refs)=>refs.map(r=>snap(r.path)),set:(r,v,opt)=>writes.push(()=>data.set(r.path,opt?.merge?{...data.get(r.path),...v}:v)),create:(r,v)=>writes.push(()=>data.set(r.path,v)),delete:r=>writes.push(()=>data.delete(r.path))});writes.forEach(w=>w());return result;}};
 return{data,stats,db,setFail:e=>{block=e}};
}
const clock=()=>{let t=1000;return{now:()=>t,advance:ms=>{t+=ms}}};
test('concurrent reads share one Firestore query and later reads use the cache',async()=>{
 const {db,stats}=database(),c=clock(),store=new FirestoreStore(db,{now:c.now,cacheTtlMs:45000});
 const results=await Promise.all(Array.from({length:10},()=>store.list('meetings')));
 assert.equal(stats.queries,1);assert(results.every(r=>r.length===2));
 results[0][0].topic='mutated by caller';assert.equal((await store.list('meetings'))[0].topic,'A');
 assert.equal((await store.get('meetings','b')).topic,'B');assert.equal(stats.queries,1);
 const before=stats.reads;c.advance(50000);await store.list('meetings');assert.equal(stats.queries,1,'expired entry is revalidated with the version document');assert.equal(stats.reads,before+1);
  c.advance(3600000);await store.list('meetings');assert.equal(stats.queries,1,'an unchanged version keeps the cache valid for hours');
 c.advance(21600000);await store.list('meetings');assert.equal(stats.queries,2,'max age forces a full refresh');
});
test('writes update cached collections without rereading and never keep stale data',async()=>{
 const {db,stats,data}=database(),c=clock(),store=new FirestoreStore(db,{now:c.now});
 await Promise.all([store.list('meetings'),store.list('teachers')]);const queries=stats.queries;
 const saved=await store.write('meetings','a',1,old=>({...old,topic:'A2'}));assert.equal(saved.revision,2);
 assert.equal((await store.list('meetings')).find(m=>m.id==='a').topic,'A2');assert.equal(await store.version(),2);
 c.advance(50000);await store.list('teachers');await store.list('meetings');assert.equal(stats.queries,queries,'untouched collections stay valid after an in-process write');
 data.set('gubae_meetings/b',{topic:'B-external',revision:5});data.set('gubae_meta/state',{initialized:true,version:9});
 c.advance(50000);assert.equal((await store.list('meetings')).find(m=>m.id==='b').topic,'B-external','a version change from another writer forces a refetch');
 await assert.rejects(()=>store.write('meetings','a',1,old=>old),e=>e instanceof ConflictError);
 assert.equal(data.get('gubae_meetings/a').topic,'A2');
});
test('in-flight reads that started before a write are not cached',async()=>{
 const {db}=database(),c=clock(),store=new FirestoreStore(db,{now:c.now});
 await store.version();const pending=store.list('meetings');await store.write('meetings','a',1,old=>({...old,topic:'A2'}));await pending;
 assert.equal((await store.list('meetings')).find(m=>m.id==='a').topic,'A2');
});
test('quota errors stop further Firestore calls, serve cached data and surface 503',async()=>{
 const {db,stats,setFail}=database(),c=clock(),logs=[],store=new FirestoreStore(db,{now:c.now,logger:{error:m=>logs.push(m)}});
 await store.list('meetings');setFail(Object.assign(Error('8 RESOURCE_EXHAUSTED: Quota exceeded.'),{code:8}));
 c.advance(50000);assert.equal((await store.list('meetings')).length,2,'stale cache served while quota is exhausted');
 await assert.rejects(()=>store.list('teachers'),e=>e.status===503&&e.reason==='quota-exceeded'&&e.retryAfter>0);
 const queries=stats.queries;await assert.rejects(()=>store.write('meetings','a',1,o=>o),e=>e.status===503);assert.equal(stats.queries,queries);
 assert.equal(logs.length,1);assert.match(logs[0],/"code":8/);assert.doesNotMatch(logs[0],/private_key|token/i);
});
test('transient errors retry with backoff and failures are never cached',async()=>{
 const {db,stats,setFail}=database(),sleeps=[],store=new FirestoreStore(db,{sleep:async ms=>{sleeps.push(ms);if(sleeps.length===2)setFail(null)},logger:{error(){}}});
 setFail(Object.assign(Error('unavailable'),{code:14}));assert.equal((await store.list('meetings')).length,2);assert.equal(sleeps.length,2);
 setFail(Object.assign(Error('unavailable'),{code:14}));const fresh=new FirestoreStore(db,{sleep:async()=>{},logger:{error(){}}});
 await assert.rejects(()=>fresh.list('meetings'),e=>e.status===503);setFail(null);assert.equal((await fresh.list('meetings')).length,2);assert(stats.queries>=2);
});
test('API returns a meaningful 503 with Retry-After for quota errors',async()=>{
 const {db,setFail}=database(),store=new FirestoreStore(db,{logger:{error(){}}});setFail(Object.assign(Error('quota'),{code:8}));
 const errors=[],original=console.error;console.error=m=>errors.push(m);
 try{const app=createApp({store,verifyAdmin:async()=>({email:'owner@example.com',owner:true,scope:'full'}),origins:[],frontendUrl:'https://app.example.com'});
 const res=await request(app).get('/api/state').set('Authorization','Bearer admin');
 assert.equal(res.status,503);assert.equal(res.body.reason,'quota-exceeded');assert.match(res.body.error,/daily read limit/);assert(Number(res.headers['retry-after'])>0);assert.match(errors[0],/"route":"\/api\/state"/);}
 finally{console.error=original;}
});
