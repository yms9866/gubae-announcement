import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
test('private announcement page boots without Firebase or full workspace and filters tabs',async()=>{
 const html=await readFile(new URL('../../dist/announcements.html',import.meta.url),'utf8');const {window,document}=parseHTML(html);
 const saved={},calls=[];const fake={window,document,location:{hash:'#access=gsa_test',pathname:'/announcements.html',replace:()=>assert.fail('limited access must not redirect to sign-in')},history:{replaceState(){}},fetch:async(path,init)=>{calls.push([path,init]);return Response.json(path==='/api/access/session'?{scope:'announcements'}:{email:'helper@example.com',scope:'announcements',items:[{key:'a:link',type:'link',meeting:{id:'a',topic:'Mahber',date:'2026-10-23',revision:1}},{key:'b:poster',type:'poster',meeting:{id:'b',topic:'Other mahber',date:'2026-10-24',revision:1}}]})},setInterval:()=>0};
 for(const[k,v]of Object.entries(fake)){saved[k]=globalThis[k];globalThis[k]=v}
 try{
  await import('../../dist/announcements.mjs?test='+Date.now());
  assert.equal(document.querySelectorAll('.announcement-card').length,2);assert.equal(document.querySelectorAll('[data-kind]').length,4);
  document.querySelector('[data-kind="poster"]').onclick();assert.equal(document.querySelectorAll('.announcement-card').length,1);assert.match(document.querySelector('#announcementList').textContent,/Other mahber/);
  assert.equal(document.querySelector('#fullWorkspace').hidden,true);assert(!calls.some(([url])=>/firebase|state|meetings.json/.test(url)));
  assert(!html.includes('app.mjs'));assert(!html.includes('sidebar'));
 }finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
