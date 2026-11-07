
import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import {readFile} from 'node:fs/promises';import {dubaiDate,shiftDate} from '../../dist/core.mjs';
test('due page tabs separate links, posters and report links using saved timing',async()=>{
 const {window,document}=parseHTML(await readFile(new URL('../../dist/due.html',import.meta.url),'utf8'));
 const date=shiftDate(dubaiDate(),1),values=new Map();
 const timing={poster:{amount:3,unit:'days'},link:{amount:1,unit:'days'},report:{amount:48,unit:'hours'}};
 let record={id:'one',topic:'Gubae',date,startTime:'21:00',link:'https://zoom.us/j/12345678901',revision:1,sent:{}};
 const intervals=[],fake={document,window,location:{search:'',hash:'',reload(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout:()=>0,setInterval:fn=>{intervals.push(fn);return 0},fetch:async url=>({ok:true,status:200,headers:{get:()=>null},json:async()=>url==='./meetings.json'?[]:url==='./cloud-config.json'?{apiBase:'https://api.example.com'}:url.endsWith('/api/config')?{accessMode:'public'}:{meetings:[record],teachers:[],reports:[],programs:[],announcementTiming:{timing,revision:1}}})};
 const saved={};for(const[k,v]of Object.entries(fake)){saved[k]=globalThis[k];globalThis[k]=v}
 try{
  await import('../../dist/app.mjs?due-tabs');
  assert.equal(document.querySelectorAll('.due-card').length,3);
  for(const type of ['link','poster','report']){document.querySelector('[data-due-kind="'+type+'"]').click();assert.equal(document.querySelectorAll('.due-card').length,1);assert.equal(document.querySelector('.due-card [data-task]').dataset.task,'one:'+type);}
  record={...record,sent:{report:'sent'}};for(const fn of intervals)await fn();
  assert.equal(document.querySelectorAll('.due-card').length,0);assert.match(document.querySelector('#content').textContent,/No announcements due/);
 }finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
