import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../../proxy.js';
test('routing gate blocks workspace pages and assets but leaves only report dependencies public',async()=>{
 const prior=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:401});
 try{
  for(const path of ['/','/due.html','/teachers-day.html','/meetings.json','/posters/1.png']){
   const result=await proxy(new Request('https://app.example.com'+path));assert.equal(result.status,303);assert.match(result.headers.get('location'),/\/login.html/);
  }
  for(const path of ['/report.html?report=1','/report-page.mjs','/report-form.mjs','/login.html']){
   const result=await proxy(new Request('https://app.example.com'+path));assert.equal(result.headers.get('x-middleware-next'),'1');
  }
  globalThis.fetch=async()=>Response.json({authenticated:true});
  const valid=await proxy(new Request('https://app.example.com/',{headers:{cookie:'__Host-gubae_session=test-authorized'}}));
  assert.equal(valid.headers.get('x-middleware-next'),'1');
 }finally{globalThis.fetch=prior}
});
