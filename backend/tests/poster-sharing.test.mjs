import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {dubaiDate,shiftDate} from '../../dist/core.mjs';
test('a bundled original loads the preview and enables sharing the image file',async()=>{
 const root=new URL('../../dist/',import.meta.url),{window,document}=parseHTML(await readFile(new URL('index.html',root),'utf8')),values=new Map(),shares=[];
 const meeting={id:'1',topic:'Poster test',date:shiftDate(dubaiDate(),1),link:'https://rit.zoom.us/j/98378810255',poster:'posters/1.png',preview:'previews/1.webp'};
 const image=new Blob([await readFile(new URL('posters/1.png',root))],{type:'image/png'});
 const fake={document,window,location:{search:'',hash:'',pathname:'/',reload(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},navigator:{canShare:({files})=>files?.[0]?.type==='image/png',share:async data=>{shares.push(data)}},fetch:async url=>({ok:true,json:async()=>url==='./cloud-config.json'?{apiBase:''}:[meeting],blob:async()=>image}),setTimeout:()=>0,setInterval:()=>0};
 const saved={};for(const[k,v]of Object.entries(fake)){saved[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v})}
 try{await import('../../dist/app.mjs?poster-sharing');const dialog=document.querySelector('#detail');dialog.showModal=()=>dialog.setAttribute('open','');dialog.close=()=>dialog.removeAttribute('open');await document.querySelector('[data-task="1:poster"]').onclick();assert.equal(document.querySelector('#sharePoster').disabled,false);assert.equal(document.querySelector('#downloadPoster').disabled,false);assert.match(document.querySelector('.detail-poster img').getAttribute('src'),/^blob:/);document.querySelector('#sharePoster').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(shares.length,1);assert.equal(shares[0].files[0].type,'image/png');assert.equal(shares[0].files[0].size,image.size);assert.equal(values.get('gubae-announcements-v1'),undefined,'opening the share menu does not mark sent');
 }finally{for(const[k,d]of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
