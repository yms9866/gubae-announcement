import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {dubaiDate,shiftDate} from '../../dist/core.mjs';
test('teachers by day confirms shared sent status, supports undo, and preserves status on failed saves',async()=>{
 const {window,document}=parseHTML(await readFile(new URL('../../dist/teachers-day.html',import.meta.url),'utf8'));
 let meeting={id:'test',topic:'Test gubae',date:shiftDate(dubaiDate(),1),startTime:'21:00',durationMinutes:90,link:'https://zoom.us/j/12345678901',teacherId:'teacher',sent:{poster:'kept'},revision:4},fail=false;const writes=[];
 const saved={},fake={document,window,location:{hash:'',pathname:'/teachers-day.html'},setInterval:()=>0,fetch:async(url,options)=>{
  if(url==='./cloud-config.json')return Response.json({apiBase:'https://api.example.com'});
  if(url==='/api/teachers-day')return Response.json({}, {status:401});
  if(url==='/api/state')return Response.json({meetings:[meeting],teachers:[{id:'teacher',name:'Teacher',phone:'+971501234567'}],reports:[]});
  writes.push({url,...JSON.parse(options.body)});if(fail)return Response.json({error:'Conflict'},{status:409});
  const body=JSON.parse(options.body);assert.equal(body.revision,meeting.revision);meeting={...meeting,revision:meeting.revision+1,sent:{...meeting.sent,teacher:body.sent?'2026-10-22T12:00:00Z':null}};return Response.json(meeting);
 }};
 for(const[k,v]of Object.entries(fake)){saved[k]=globalThis[k];globalThis[k]=v}
 try{
  await import('../../dist/teachers-day.mjs?test='+Date.now());
  let control=document.querySelector('[data-teacher-sent]');assert.equal(control.textContent,'Mark sent');
  await control.onclick();assert.equal(writes[0].url,'/api/meetings/test/status/teacher');assert.equal(writes[0].sent,true);assert.equal(writes[0].revision,4);assert.equal(meeting.sent.poster,'kept');
  assert.equal(document.querySelector('[data-teacher-sent]'),null,'sent invitation leaves default Unsent tab');document.querySelector('[data-teacher-tab="sent"]').onclick();control=document.querySelector('[data-teacher-sent]');assert.equal(control.textContent,'✓ Sent · undo');
  await control.onclick();assert.equal(writes[1].sent,false);assert.equal(writes[1].revision,5);assert.equal(document.querySelector('[data-teacher-sent]'),null);document.querySelector('[data-teacher-tab="unsent"]').onclick();assert.equal(document.querySelector('[data-teacher-sent]').textContent,'Mark sent');
  fail=true;await document.querySelector('[data-teacher-sent]').onclick();assert.equal(document.querySelector('[data-teacher-sent]').textContent,'Mark sent');assert.match(document.querySelector('#dayStatus').textContent,/another device/);assert.equal(document.querySelector('[data-teacher-sent]').disabled,false);
 }finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
