import test from 'node:test';
import assert from 'node:assert/strict';
import {assignTeachers} from '../assign-teachers.mjs';
test('assignment import matches names/date, flags unresolved rows and never reapplies manual changes',async()=>{
 const meetings=[{id:'a',topic:'Gubae A',date:'2026-10-26',revision:1,sent:{poster:'kept',teacher:'old'},outcome:'held'},{id:'b',topic:'Gubae B',date:'2026-10-26',revision:1,sent:{link:'kept'}}];
 const teachers=[{id:'t',name:'ዲያቆን አሰፋ'}];
 const store={list:async c=>structuredClone(c==='meetings'?meetings:teachers),write:async(c,id,revision,fn)=>{const i=meetings.findIndex(m=>m.id===id);assert.equal(meetings[i].revision,revision);meetings[i]={...fn(meetings[i]),revision:revision+1}}};
 const rows=[{topic:'Gubae A',date:'2026-10-26',teacherName:'ዲ/ን አሰፋ'},{topic:'Gubae B',date:'2026-10-26',teacherName:'Missing'}];
 assert.deepEqual((await assignTeachers(store,rows)).counts,{assigned:1,missing:1});assert.equal(meetings[0].teacherId,undefined);
 assert.deepEqual((await assignTeachers(store,rows,{apply:true})).counts,{assigned:1,missing:1});
 assert.equal(meetings[0].teacherId,'t');assert.equal(meetings[0].sent.poster,'kept');assert.equal(meetings[0].sent.teacher,null);assert.equal(meetings[0].outcome,'held');assert.equal(meetings[1].scheduledTeacherName,'Missing');
 meetings[0].teacherId='manual';assert.deepEqual((await assignTeachers(store,rows,{apply:true})).counts,{'already-applied':2});assert.equal(meetings[0].teacherId,'manual');
 await assert.rejects(assignTeachers(store,[rows[0],rows[0]]),/Duplicate/);
});
test('ambiguous teacher contacts and duplicate meetings are not guessed',async()=>{
 const row={topic:'A',date:'2026-10-26',teacherName:'Test'};
 const store={list:async c=>c==='meetings'?[{...row,id:'a',revision:1}]:[{id:'x',name:'Test'},{id:'y',name:'Test'}]};
 assert.equal((await assignTeachers(store,[row])).results[0].status,'ambiguous');
 store.list=async c=>c==='meetings'?[{...row,id:'a'},{...row,id:'b'}]:[];
 assert.equal((await assignTeachers(store,[row])).results[0].status,'ambiguous-meeting');
});
