import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
test('full workspace boots from a private-link cookie without Google and hides owner access settings',async()=>{
 const base=new URL('../../dist/',import.meta.url),{window,document}=parseHTML(await readFile(new URL('index.html',base),'utf8'));const saved={},values=new Map(),calls=[];
 const meetings=JSON.parse(await readFile(new URL('meetings.json',base),'utf8'));
 const fake={window,document,location:{origin:'https://app.example.com',pathname:'/',hash:'',search:'',replace:()=>assert.fail('must not redirect to Google'),reload(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setInterval:()=>0,setTimeout:()=>0,fetch:async(url,init)=>{calls.push([String(url),init]);if(String(url)==='./cloud-config.json')return Response.json({apiBase:'https://gubae-announcements-api.onrender.com'});if(String(url).endsWith('/api/config'))return Response.json({accessMode:'google'});if(String(url)==='/api/browser-session')return Response.json({authenticated:true,scope:'full',via:'link',email:'helper@example.com'});if(String(url).endsWith('/api/state'))return Response.json({meetings,teachers:[],reports:[],programs:[],isOwner:false,reminderSettings:{recipients:[],enabled:false,revision:0}});return Response.json(JSON.parse(await readFile(new URL(String(url),base),'utf8')))}};
 for(const[k,v]of Object.entries(fake)){saved[k]=globalThis[k];globalThis[k]=v}
 try{await import('../../dist/app.mjs?full-link-test='+Date.now());assert.match(document.querySelector('#syncText').textContent,/Cloud synced.*helper@example.com/);document.querySelector('[data-view="settings"]').onclick();assert.equal(document.querySelector('#emailReminderForm'),null);assert.match(document.querySelector('#content').textContent,/Access managed by the site owner/);assert(calls.some(([url,init])=>url==='https://app.example.com/api/state'&&init.credentials==='same-origin'&&!init.headers.Authorization));await new Promise(resolve=>setImmediate(resolve));}
 finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
