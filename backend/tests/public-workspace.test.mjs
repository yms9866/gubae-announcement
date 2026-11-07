import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {createWorkspace} from '../../dist/workspace.mjs';
test('public workspace loads cloud data and saves status without Google or an authorization header',async()=>{
 const {window,document}=parseHTML(await readFile(new URL('../../dist/index.html',import.meta.url),'utf8'));
 let timing={timing:{poster:{amount:3,unit:'days'},link:{amount:1,unit:'days'},report:{amount:12,unit:'hours'}},revision:0};let rows=[],state={recipients:{},sent:{},meetingEdits:{}},view='settings';const calls=[],values=new Map();
 let record={id:'1',topic:'Shared mahber',date:'2026-10-15',link:'https://rit.zoom.us/j/98378810255',revision:1,sent:{}};
 const fake={document,window,location:{search:'',hash:'',reload(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout:()=>0,setInterval:()=>0,fetch:async(url,options={})=>{
  calls.push({url,options});let data;
  if(url==='./cloud-config.json')data={apiBase:'https://api.example.com'};
  else if(url.endsWith('/api/config'))data={accessMode:'public'};
  else if(url.endsWith('/api/state'))data={meetings:[record],teachers:[{id:'t',name:'Shared teacher',phone:'+971501234567'}],reports:[],programs:[],announcementTiming:timing};
  else if(url.endsWith('/api/announcement-timing')){timing={...JSON.parse(options.body),revision:1};data=timing;}
  else if(url.endsWith('/api/meetings/1/status/link')){record={...record,revision:2,sent:{link:'2026-10-16T12:00:00Z'}};data=record;}
  else throw Error('Unexpected request '+url);
  return{ok:true,status:200,json:async()=>structuredClone(data),headers:{get:()=> '"1"'}};
 }};
 const saved={};for(const [key,value]of Object.entries(fake)){saved[key]=globalThis[key];globalThis[key]=value;}
 try{
  let workspace;const bridge={base:()=>rows,bundled:()=>[],program:()=> '2026-10',selectProgram(){},setBase:next=>{rows=next},restoreLocal(){},state:()=>state,setState:next=>{state=next},meetings:()=>rows,view:()=>view,toast:message=>{throw Error(message)},navigate:next=>{view=next;bridge.render()},render:()=>{document.querySelector('#content').innerHTML=workspace.render(view)||'<section class="setup"></section>';workspace.afterRender();}};
  workspace=createWorkspace(bridge);await workspace.start();assert.equal(workspace.cloud(),true);assert.equal(workspace.publicAccess(),true);assert.equal(rows.length,1);assert.match(document.querySelector('#syncText').textContent,/Open workspace/);assert.equal(document.querySelector('#signIn'),null);assert.match(document.querySelector('.cloud-setup').textContent,/No account is required/);
  const form=document.querySelector('#announcementTimingForm');assert(form,'timing controls appear in Setup');form.elements={namedItem:name=>({value:name.endsWith('Amount')?'2':'hours'})};form.dispatchEvent(new window.Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));assert.equal(timing.timing.report.amount,2);assert.equal(timing.timing.report.unit,'hours');assert.match(document.querySelector('#timingResult').textContent,/saved/);
  bridge.navigate('teachers');assert.match(document.querySelector('#content').textContent,/Shared teacher/);assert.match(document.querySelector('#content').textContent,/visible to everyone/);
  state.sent['1:link']='2026-10-16T12:00:00Z';workspace.persist(state);await workspace.flush();assert.equal(record.revision,2);assert.match(document.querySelector('#syncText').textContent,/synced/);
  for(const {options}of calls)assert(!options.headers?.Authorization);assert(!calls.some(c=>/firebase|google/.test(c.url)));
 }finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
