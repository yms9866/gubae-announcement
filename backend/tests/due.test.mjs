import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {dueAnnouncements,reminderEmails} from '../../dist/announcements-due.mjs';
test('Dubai deadlines include all programs and exclude sent, held and ended gubaes',()=>{
 const rows=[{id:'a',date:'2026-10-21',programId:'one'},{id:'b',date:'2026-10-19',programId:'two'},{id:'c',date:'2026-10-18'},{id:'d',date:'2026-10-19'}];
 const now=new Date('2026-10-18T20:01:00Z');
 assert.deepEqual(new Set(dueAnnouncements(rows,[{meetingId:'d',status:'held'}],now,{'b:poster':'sent'}).map(x=>x.key)),new Set(['a:poster','b:link']));
 assert.deepEqual(reminderEmails('JossiMogs@gmail.com; jossimogs@gmail.com\nhelper@example.com'),['jossimogs@gmail.com','helper@example.com']);assert.throws(()=>reminderEmails('a@example.com\r\nBcc:bad@example.com'));assert.throws(()=>reminderEmails(Array(51).fill('a@example.com')));
});
test('due-only page renders live announcements from every program and removes shared sent items',async()=>{
 const {window,document}=parseHTML(await readFile(new URL('../../dist/due.html',import.meta.url),'utf8'));const values=new Map([['gubae-active-program','different-month']]);const date=new Date(Date.now()+86400000).toISOString().slice(0,10);let rows=[{id:'live',programId:'next-month',topic:'Live due mahber',date,startTime:'21:00',link:'https://rit.zoom.us/j/98378810255',revision:1,sent:{}}];const intervals=[];
 const fake={document,window,location:{search:'',hash:'',reload(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout:()=>0,setInterval:fn=>{intervals.push(fn);return 0},fetch:async url=>({ok:true,status:200,headers:{get:()=>null},json:async()=>url==='./meetings.json'?[]:url==='./cloud-config.json'?{apiBase:'https://api.example.com'}:url.endsWith('/api/config')?{accessMode:'public'}:{meetings:rows,teachers:[],reports:[],programs:[]}})};const saved={};for(const[k,v]of Object.entries(fake)){saved[k]=globalThis[k];globalThis[k]=v}
 try{await import('../../dist/app.mjs?due-test');assert.equal(document.querySelectorAll('.due-card').length,2);assert.match(document.querySelector('#content').textContent,/Live due mahber/);assert.equal(document.querySelector('#content header'),null);assert.equal(document.querySelectorAll('#content [data-view]').length,0);
 rows=[{...rows[0],revision:2,sent:{poster:'done',link:'done'}}];for(const fn of intervals)await fn();assert.match(document.querySelector('#content').textContent,/No announcements due/);
 }finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
