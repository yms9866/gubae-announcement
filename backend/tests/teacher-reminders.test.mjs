import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../app.mjs';
class Store{
 data={settings:new Map(),meetings:new Map(),teachers:new Map(),reports:new Map(),programs:new Map(),report_links:new Map()};
 async get(c,id){return structuredClone(this.data[c].get(id)||null)} async list(c){return structuredClone([...this.data[c].values()])} async version(){return 1}
 async write(c,id,rev,fn){const old=await this.get(c,id);if(rev!=null&&rev!==(old?.revision||0))throw Object.assign(Error('Conflict'),{status:409});const next={...fn(old),id,revision:(old?.revision||0)+1};this.data[c].set(id,next);return structuredClone(next)}
}
const owner=r=>r.set('Authorization','Bearer owner');
test('teacher reminders use an independent email list and only pending assignments in the two-day window',async()=>{
 const store=new Store();for(const [id,date,sent,outcome]of [['a','2026-10-23',{},null],['b','2026-10-24',{teacher:'sent'},null],['c','2026-10-25',{},null],['d','2026-10-23',{},'held']])store.data.meetings.set(id,{id,date,topic:'Mahber '+id,teacherId:'t',link:'https://zoom.us/j/12345678901',revision:1,sent,outcome,recipient:'PRIVATE-MAHBER-NUMBER'});
 store.data.teachers.set('t',{id:'t',name:'Assigned teacher',phone:'+971501234567',notes:'PRIVATE-NOTES',email:'PRIVATE-TEACHER-EMAIL'});store.data.teachers.set('unrelated',{id:'unrelated',name:'UNRELATED-TEACHER',phone:'+971509999999'});
 const api=request(createApp({store,frontendUrl:'https://app.example.com',now:()=>new Date('2026-10-22T12:00:00Z'),verifyAdmin:async t=>{if(t==='owner')return{email:'owner@example.com',owner:true};if(t==='helper')return{email:'helper@example.com',scope:'full',owner:false};throw Error('Invalid')}}));
 assert.equal((await api.get('/api/reminders/teachers/config')).status,401);assert.equal((await api.put('/api/reminders/teachers/config').set('Authorization','Bearer helper').send({})).status,403);
 assert.equal((await owner(api.put('/api/reminders/teachers/config')).send({revision:0,enabled:true,recipients:['bad']})).status,400);
 const save=await owner(api.put('/api/reminders/teachers/config')).send({revision:0,enabled:true,recipients:['chosen@example.com']});assert.equal(save.status,200);assert(!JSON.stringify(save.body).includes('token'));
 const due=await owner(api.get('/api/reminders/due'));assert.equal(due.body.enabled,false,'announcement reminders remain independent');assert.equal(due.body.teacherReminders.enabled,true);assert.equal(due.body.teacherReminders.count,1);assert.equal(due.body.teacherReminders.items[0].meetingId,'a');assert.deepEqual(due.body.teacherReminders.recipients,['chosen@example.com']);
 const link=(await owner(api.post('/api/reminders/teachers/link')).send({email:'chosen@example.com'})).body.url;const token=new URLSearchParams(new URL(link).hash.slice(1)).get('teacherAccess');
 const session=await api.post('/api/teachers-day/session').set('Authorization','Bearer '+token);assert.equal(session.status,200);const cookie=session.headers['set-cookie'][0].split(';')[0];
 const data=await api.get('/api/teachers-day').set('Cookie',cookie);assert.equal(data.status,200);assert.equal(data.body.meetings.length,2);for(const secret of ['PRIVATE-MAHBER-NUMBER','PRIVATE-NOTES','PRIVATE-TEACHER-EMAIL','UNRELATED-TEACHER'])assert(!JSON.stringify(data.body).includes(secret));
 assert.equal((await api.get('/api/state').set('Cookie',cookie)).status,401);assert.equal((await api.get('/api/access').set('Cookie',cookie)).status,401);
 assert.equal((await api.put('/api/teachers-day/c/sent').set('Cookie',cookie).send({revision:1,sent:true})).status,403);
 const marked=await api.put('/api/teachers-day/a/sent').set('Cookie',cookie).send({revision:1,sent:true});assert.equal(marked.status,200);assert(!JSON.stringify(marked.body).includes('PRIVATE-MAHBER-NUMBER'));assert.equal((await owner(api.get('/api/reminders/due'))).body.teacherReminders.count,0);
 await owner(api.put('/api/reminders/teachers/config')).send({revision:1,enabled:false,recipients:[]});assert.equal((await api.get('/api/teachers-day').set('Cookie',cookie)).status,401,'removal revokes existing session');
});
