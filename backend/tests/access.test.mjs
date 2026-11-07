import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../app.mjs';
import {accessForEmail,ensureRecipientAccess} from '../access.mjs';
class Store{
 data={settings:new Map(),meetings:new Map(),teachers:new Map(),reports:new Map(),programs:new Map(),report_links:new Map()};
 async get(c,id){return structuredClone(this.data[c].get(id)||null)}
 async list(c){return structuredClone([...this.data[c].values()])}
 async version(){return 1}
 async write(c,id,revision,fn){const old=await this.get(c,id);if(revision!=null&&revision!==(old?.revision||0))throw Object.assign(Error('Conflict'),{status:409});const next={...fn(old),id,revision:(old?.revision||0)+1};this.data[c].set(id,next);return next}
}
async function setup(){
 const store=new Store();store.data.settings.set('email-reminders',{recipients:['helper@example.com','other@example.com'],enabled:true,revision:1});
 store.data.meetings.set('a',{id:'a',date:'2026-10-23',topic:'Mahber',link:'https://zoom.us/j/12345678901',recipient:'+971501234567',revision:1,sent:{}});
 store.data.teachers.set('secret',{id:'secret',name:'Private teacher',phone:'+971509999999'});
 const owners=new Set(['owner@example.com']);
 const app=createApp({store,now:()=>new Date('2026-10-22T12:00:00Z'),frontendUrl:'https://app.example.com',origins:['https://app.example.com'],verifyAdmin:async token=>{if(!['owner','helper','other'].includes(token))throw Error('Invalid');return accessForEmail(store,{email:token+'@example.com',email_verified:true},owners)},verifySessionCookie:async cookie=>accessForEmail(store,{email:cookie+'@example.com',email_verified:true},owners),createSessionCookie:async token=>token});
 await ensureRecipientAccess(store);const config=await store.get('settings','workspace-access');
 return{store,api:request(app),token:config.entries[0].token};
}
const owner=r=>r.set('Authorization','Bearer owner');
test('recipient links need no Google sign-in, isolate due data, and cannot access any admin endpoint',async()=>{
 const {api,token}=await setup();
 assert.equal((await api.get('/api/announcements')).status,401);
 assert.equal((await api.post('/api/browser-session').set('Authorization','Bearer helper')).status,403,'private-link recipients do not implicitly get Google access');
 const opened=await api.post('/api/access/session').set('Authorization','Bearer '+token);assert.equal(opened.status,200);assert.equal(opened.body.scope,'announcements');
 const cookie=opened.headers['set-cookie'][0].split(';')[0];assert.match(opened.headers['set-cookie'][0],/HttpOnly/);
 const due=await api.get('/api/announcements').set('Cookie',cookie);assert.equal(due.status,200);assert(due.body.items.length);assert(!JSON.stringify(due.body).includes('Private teacher'));
 for(const url of ['/api/state','/api/access','/api/reminders/due','/api/monthly-report'])assert.equal((await api.get(url).set('Cookie',cookie)).status,403,url);
 assert.equal((await api.patch('/api/meetings/a').set('Cookie',cookie).send({revision:1,recipient:'changed'})).status,403);
 assert.equal((await api.put('/api/announcements/a/status/teacher').set('Cookie',cookie).send({revision:1,sent:true})).status,403);
 assert.equal((await api.put('/api/announcements/a/status/link').set('Cookie',cookie).send({revision:1,sent:true})).status,200);
 assert.equal((await api.get('/api/announcements').set('Cookie',cookie)).body.items.some(i=>i.type==='link'),false);
});
test('owner controls full link access, link rotation, blocking, and removal; members cannot manage access',async()=>{
 const {api,store,token}=await setup();let access=(await owner(api.get('/api/access'))).body;
 assert(!JSON.stringify(access).includes(token));
 const entries=access.entries.map(e=>({email:e.email,role:e.email==='helper@example.com'?'full':e.role,method:e.method}));
 assert.equal((await owner(api.put('/api/access')).send({revision:access.revision,entries})).status,200);
 assert.equal((await api.get('/api/announcements').set('Authorization','Bearer '+token)).status,403,'changing permissions replaces the old link');
 let url=(await owner(api.post('/api/access/open-link')).send({email:'helper@example.com'})).body.url;
 let fullToken=new URLSearchParams(new URL(url).hash.slice(1)).get('access');
 assert.equal((await api.get('/api/state').set('Authorization','Bearer '+fullToken)).status,200);
 assert.equal((await api.get('/api/state').set('Authorization','Bearer '+fullToken)).body.isOwner,false);
 for(const url of ['/api/access','/api/reminders/due'])assert.equal((await api.get(url).set('Authorization','Bearer '+fullToken)).status,403);
 assert.equal((await api.post('/api/reminders/scheduler-token').set('Authorization','Bearer '+fullToken)).status,403);
 access=(await owner(api.get('/api/access'))).body;
 const replaced=await owner(api.post('/api/access/link')).send({email:'helper@example.com',revision:access.revision});assert.equal(replaced.status,200);
 assert.equal((await api.get('/api/state').set('Authorization','Bearer '+fullToken)).status,403);
 fullToken=new URLSearchParams(new URL(replaced.body.url).hash.slice(1)).get('access');
 assert.equal((await api.get('/api/state').set('Authorization','Bearer '+fullToken)).status,200);
 access=(await owner(api.get('/api/access'))).body;
 await owner(api.put('/api/access')).send({revision:access.revision,entries:access.entries.map(e=>({...e,role:e.email==='helper@example.com'?'blocked':e.role}))});
 assert.equal((await api.get('/api/state').set('Authorization','Bearer '+fullToken)).status,403);
 await owner(api.put('/api/reminders/config')).send({revision:1,recipients:['other@example.com'],enabled:true});
 assert.equal((await store.get('settings','workspace-access')).entries.some(e=>e.email==='helper@example.com'),false);
});
test('optional Google permissions are checked on every request; owner keeps access outside recipient list',async()=>{
 const {api,store}=await setup();let access=(await owner(api.get('/api/access'))).body;
 const entries=access.entries.map(e=>({email:e.email,role:'announcements',method:'google'}));
 await owner(api.put('/api/access')).send({revision:access.revision,entries});
 const signed=await api.post('/api/browser-session').set('Authorization','Bearer helper');assert.equal(signed.status,200);assert.equal(signed.body.scope,'announcements');
 const cookie=signed.headers['set-cookie'][0].split(';')[0];assert.equal((await api.get('/api/announcements').set('Cookie',cookie)).status,200);assert.equal((await api.get('/api/state').set('Cookie',cookie)).status,403);
 access=(await owner(api.get('/api/access'))).body;
 await owner(api.put('/api/access')).send({revision:access.revision,entries:access.entries.map(e=>({...e,role:'blocked'}))});
 assert.equal((await api.get('/api/announcements').set('Cookie',cookie)).status,401);
 assert.equal((await owner(api.get('/api/state'))).status,200);
 assert.equal((await owner(api.put('/api/access')).send({revision:0,entries:[{email:'evil@example.com',role:'full',method:'link'}]})).status,400);
});
