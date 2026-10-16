import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {message} from '../../dist/core.mjs';
const base=new URL('../../dist/',import.meta.url);
test('frontend boots all 41 gubaes and renders teacher, organizer, and monthly report screens',async()=>{
 const {window,document}=parseHTML(await readFile(new URL('index.html',base),'utf8'));
 const values=new Map([['gubae-private-workspace-v2',JSON.stringify({teachers:[{id:'teacher-test',name:'Private teacher',phone:'+971501234567',notes:'Private note'}],reports:[{meetingId:'1',organizerName:'Organizer',status:'held',participants:37,teachingRating:5,teachingFeedback:'Good teaching',comments:'Follow up'}],assignments:{'1':'teacher-test'},teacherSent:{}})]]);
 const saved={};const fake={document,window,location:{search:'',hash:'',pathname:'/',reload(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},fetch:async url=>({ok:true,json:async()=>String(url)==='./cloud-config.json'?{apiBase:''}:JSON.parse(await readFile(new URL(String(url),base),'utf8'))}),setTimeout:()=>0,setInterval:()=>0};
 for(const [k,v]of Object.entries(fake)){saved[k]=globalThis[k];globalThis[k]=v}
 try{
 await import('../../dist/app.mjs?test='+Date.now());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(document.querySelectorAll('.task-row').length>0,true);
 assert.match(document.querySelector('#syncText').textContent,/On this device/);
 for(const [view,title]of [['teachers','Teachers & Zoom invitations'],['reports','Gubae day reports'],['monthly','Monthly service report'],['settings','Shared workspace'],['meetings','41 gatherings']]){document.querySelector(`[data-view="${view}"]`).onclick();assert(document.querySelector('#content').textContent.includes(title),view+' renders')}
 document.querySelector('[data-view="teachers"]').onclick();assert.match(document.querySelector('#content').textContent,/Private teacher/);assert.equal(document.querySelectorAll('[data-assignment]').length,41);
 const dialog=document.querySelector('#workspaceDialog');dialog.showModal=()=>dialog.setAttribute('open','');dialog.close=()=>dialog.removeAttribute('open');
 document.querySelector('#importTeachers').click();document.querySelector('#teacherImportText').value='name,phone\n<script>alert(1)</script>,+971509876543\nPrivate teacher,+971501234567';
 document.querySelector('#teacherImportPreview').click();assert.match(document.querySelector('#teacherImportResults').textContent,/1 ready/);assert.match(document.querySelector('#teacherImportResults').textContent,/1 duplicates/);assert.equal(document.querySelector('#teacherImportResults script'),null,'import preview escapes names');
 await document.querySelector('#teacherImportSave').onclick();assert.equal(JSON.parse(values.get('gubae-private-workspace-v2')).teachers.length,2);assert.match(document.querySelector('.teacher-list').textContent,/alert/);
 document.querySelector('[data-view="reports"]').onclick();assert.equal(document.querySelectorAll('[data-report-edit]').length,41);assert.equal(document.querySelectorAll('[data-report-link]').length,0,'organizer links need backend');
 document.querySelector('[data-view="monthly"]').onclick();document.querySelector('#fullProgram').click();assert.equal(document.querySelectorAll('#content .report-table tbody tr').length,41);assert.match(document.querySelector('.report-summary').textContent,/37/);assert.match(document.querySelector('#content .report-table').textContent,/Follow up/);assert.equal(document.querySelectorAll('script:not([src])').length,0);
 document.querySelector('#newProgram').click();document.querySelector('[name="programMonth"]').value='2026-11';document.querySelector('#programText').value='topic,date,link\nTest next month,2026-11-15,https://rit.zoom.us/j/98378810255';document.querySelector('#programPreview').click();assert.equal(document.querySelector('#programSave').disabled,false);await document.querySelector('#programSave').onclick();assert.match(document.querySelector('#content').textContent,/1 gatherings/);assert.match(document.querySelector('#content').textContent,/Test next month/);assert.equal(JSON.parse(values.get('gubae-private-workspace-v2')).meetings.length,1);assert.equal(document.querySelectorAll('#activeProgram option').length,2);
 document.querySelector('#activeProgram').onchange({target:{value:'2026-10'}});await new Promise(resolve=>setImmediate(resolve));assert.match(document.querySelector('#content').textContent,/41 gatherings/);
 const meetings=JSON.parse(await readFile(new URL('meetings.json',base),'utf8'));assert(!message({...meetings[0],teacherName:'Private teacher'}).includes('Private teacher'));
 }finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
