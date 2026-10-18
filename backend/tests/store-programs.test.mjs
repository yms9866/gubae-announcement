import test from 'node:test';
import assert from 'node:assert/strict';
import {FirestoreStore} from '../store.mjs';
function database(){
 const data=new Map([['gubae_meta/state',{initialized:true,version:1}],['gubae_meetings/a',{id:'a',date:'2026-10-18',revision:1,outcome:'missed'}],['gubae_meetings/b',{id:'b',programId:'2026-11'}],['gubae_reports/a',{status:'held'}],['gubae_report_links/a',{tokenHash:'secret'}],['gubae_teachers/t',{name:'Teacher'}]]);
 const ref=path=>({path}),snap=path=>({id:path.split('/').pop(),ref:ref(path),exists:data.has(path),data:()=>structuredClone(data.get(path))});
 const db={doc:ref,collection:name=>({name,doc:id=>ref(name+'/'+id)}),runTransaction:async fn=>{const writes=[];let writing=false;const result=await fn({get:async target=>{assert.equal(writing,false,'all reads precede writes');return target.name?{docs:[...data.keys()].filter(k=>k.startsWith(target.name+'/')).map(snap)}:snap(target.path)},set:(r,v,opt)=>{writing=true;writes.push(()=>data.set(r.path,opt?.merge?{...data.get(r.path),...v}:v))},delete:r=>{writing=true;writes.push(()=>data.delete(r.path))}});writes.forEach(fn=>fn());return result;}};return{data,store:new FirestoreStore(db)};
}
test('Firestore month lifecycle deletes scoped records atomically and preserves initialized state',async()=>{
 const {data,store}=database();await store.updateProgram('2026-10',0,'Original renamed');assert.equal(data.get('gubae_programs/2026-10').revision,1);await assert.rejects(()=>store.deleteProgram('2026-10',0),e=>e.status===409);assert(data.has('gubae_meetings/a'));
 const result=await store.deleteProgram('2026-10',1);assert.equal(result.deleted,1);for(const name of ['meetings','reports','report_links'])assert(!data.has('gubae_'+name+'/a'));assert(data.has('gubae_meetings/b'));assert(data.has('gubae_teachers/t'));assert.equal(data.get('gubae_meta/state').initialized,true);assert.equal(data.get('gubae_meta/state').version,3);await assert.rejects(()=>store.updateProgram('2026-10',0,'Missing'),e=>e.status===404);
});

test('Firestore commits report and Held outcome together with revision protection',async()=>{
 const {store,data}=database();data.delete('gubae_reports/a');await assert.rejects(()=>store.saveMeetingReport('a',9,0,{status:'held'}),e=>e.status===409);assert.equal(data.get('gubae_meetings/a').outcome,'missed');assert(!data.has('gubae_reports/a'));
 const saved=await store.saveMeetingReport('a',1,0,{status:'held',participants:12});assert.equal(saved.revision,1);assert.equal(data.get('gubae_meetings/a').outcome,'held');assert.equal(data.get('gubae_meetings/a').revision,2);assert.equal(data.get('gubae_reports/a').participants,12);assert.equal(data.get('gubae_meta/state').version,2);
});
