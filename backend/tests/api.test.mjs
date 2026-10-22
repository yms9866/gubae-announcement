import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../app.mjs';
import {ConflictError} from '../store.mjs';
import {monthlyReport,dateRange,validateReport,reportCsv} from '../../dist/reporting.mjs';
class MemoryStore{
 constructor(){this.data={meetings:new Map(),teachers:new Map(),reports:new Map(),programs:new Map(),report_links:new Map(),settings:new Map()};this.v=1}
 async createProgram(program,meetings){if(this.data.programs.has(program.id))throw new ConflictError();for(const m of meetings)this.data.meetings.set(m.id,{...m,revision:1});this.data.programs.set(program.id,program);this.v++;return program;}
 async saveMeetingReport(id,meetingRevision,reportRevision,data){const m=await this.get('meetings',id),r=await this.get('reports',id);if(!m)throw Object.assign(Error('Gubae not found.'),{status:404});if(m.revision!==meetingRevision||(r?.revision||0)!==reportRevision)throw new ConflictError();const record=await this.write('reports',id,reportRevision,()=>data);await this.write('meetings',id,meetingRevision,old=>({...old,outcome:'held',outcomeReason:''}));return record;}
 async updateProgram(id,expected,label){const old=this.data.programs.get(id);if(!old&&![...this.data.meetings.values()].some(m=>(m.programId||'2026-10')===id))throw Object.assign(Error('Month not found.'),{status:404});if((old?.revision||0)!==expected)throw new ConflictError();return this.write('programs',id,expected,()=>({id,month:id,label}));}
 async deleteProgram(id,expected){const old=this.data.programs.get(id),meetings=[...this.data.meetings.values()].filter(m=>(m.programId||'2026-10')===id);if(!old&&!meetings.length)throw Object.assign(Error('Month not found.'),{status:404});if((old?.revision||0)!==expected)throw new ConflictError();for(const m of meetings)for(const kind of ['meetings','reports','report_links'])this.data[kind].delete(m.id);this.data.programs.delete(id);this.v++;return{deleted:meetings.length};}
 async get(c,id){return structuredClone(this.data[c].get(id)||null)}
 async list(c){return structuredClone([...this.data[c].values()])}
 async version(){return this.v}
 async write(c,id,expected,updater){const old=await this.get(c,id);if(expected!=null&&expected!==(old?.revision||0))throw new ConflictError();const next={...updater(old),id,revision:(old?.revision||0)+1,updatedAt:'2026-10-16T12:00:00.000Z'};this.data[c].set(id,next);this.v++;return structuredClone(next)}
}
const meeting=(id,date)=>({id,topic:'ማኅበረ ልደታ ለማርያም',date,startTime:'21:00',durationMinutes:90,link:'https://rit.zoom.us/j/98378810255',recipient:'+971501234567',teacherId:null,sent:{},revision:1});
function setup({publicAccess=false}={}){const store=new MemoryStore();store.data.meetings.set('1',meeting('1','2026-10-15'));store.data.meetings.set('2',meeting('2','2026-10-20'));const app=createApp({store,publicAccess,verifyAdmin:async t=>{if(t!=='admin')throw Error('Invalid');return{email:'admin@example.com'}},origins:['https://app.example.com'],frontendUrl:'https://app.example.com',now:()=>new Date('2026-10-16T12:00:00Z')});return{store,api:request(app)}}
const report={organizerName:'Organizer',status:'held',participants:35,teachingRating:4,teachingFeedback:'Clear and helpful.',comments:'Follow up next week.',revision:0};
const admin=req=>req.set('Authorization','Bearer admin');
test('private data requires verified admin; disallowed browser origins receive no CORS permission',async()=>{const{api}=setup();assert.equal((await api.get('/api/state')).status,401);assert.equal((await api.get('/api/state').set('Authorization','Bearer invalid')).status,401);const cfg=await api.get('/api/config');assert.equal(cfg.status,200);assert(!JSON.stringify(cfg.body).includes('recipient'));const r=await admin(api.get('/api/state')).set('Origin','https://evil.example');assert(!r.headers['access-control-allow-origin']);assert.equal(r.body.meetings.length,2)});
test('ETag avoids returning all records when nothing changed',async()=>{const{api}=setup();const r=await admin(api.get('/api/state'));assert.equal((await admin(api.get('/api/state')).set('If-None-Match',r.headers.etag)).status,304)});
test('stale writes conflict; independent status changes preserve other flags',async()=>{const{api}=setup();const first=await admin(api.put('/api/meetings/1/status/poster')).send({revision:1,sent:true});assert.equal(first.status,200);assert.equal((await admin(api.put('/api/meetings/1/status/link')).send({revision:1,sent:true})).status,409);const second=await admin(api.put('/api/meetings/1/status/link')).send({revision:first.body.revision,sent:true});assert(second.body.sent.poster);assert(second.body.sent.link)});
test('meeting edits clear outdated sent flags; teacher reassignment clears only teacher flag',async()=>{const{api,store}=setup();store.data.meetings.get('1').sent={poster:'2026-10-12',link:'2026-10-14',teacher:'2026-10-14'};const t=await admin(api.post('/api/teachers')).send({name:'Private teacher',phone:'+971501234567'});const a=await admin(api.patch('/api/meetings/1')).send({revision:1,teacherId:t.body.id});assert(a.body.sent.poster);assert.equal(a.body.sent.teacher,null);const b=await admin(api.patch('/api/meetings/1')).send({revision:a.body.revision,details:{date:'2026-10-17'}});assert.deepEqual(b.body.sent,{});assert.equal((await admin(api.patch('/api/meetings/1')).send({revision:b.body.revision,details:{date:'2026-02-30'}})).status,400)});
test('organizer links restrict access to one report, open on Dubai meeting day, and can be revoked',async()=>{const{api}=setup();const created=await admin(api.post('/api/meetings/1/report-link')).send({});const token=new URLSearchParams(new URL(created.body.url).hash.slice(1)).get('token');const auth=req=>req.set('Authorization','Bearer '+token);const info=await auth(api.get('/api/public/report/1'));assert.equal(info.status,200);assert.equal(info.body.canSubmit,true);assert.equal(info.body.meeting.recipient,undefined);assert.equal(info.body.teachers,undefined);assert.equal((await auth(api.get('/api/public/report/2'))).status,401);const r=await auth(api.put('/api/public/report/1')).send(report);assert.equal(r.status,200);assert.equal(r.body.participants,35);assert.equal((await auth(api.put('/api/public/report/1')).send(report)).status,409);assert.equal((await admin(api.put('/api/meetings/2/report')).send(report)).status,403);await admin(api.delete('/api/meetings/1/report-link'));assert.equal((await auth(api.get('/api/public/report/1'))).status,401)});
test('replacing an organizer link invalidates old token',async()=>{const{api}=setup();const tokens=[];for(let i=0;i<2;i++){const r=await admin(api.post('/api/meetings/1/report-link')).send({});tokens.push(new URLSearchParams(new URL(r.body.url).hash.slice(1)).get('token'))}assert.equal((await api.get('/api/public/report/1').set('Authorization','Bearer '+tokens[0])).status,401);assert.equal((await api.get('/api/public/report/1').set('Authorization','Bearer '+tokens[1])).status,200)});
test('teacher contacts validate phone numbers and remain private',async()=>{const{api}=setup();assert.equal((await api.post('/api/teachers').send({name:'Teacher',phone:'+971501234567'})).status,401);assert.equal((await admin(api.post('/api/teachers')).send({name:'Teacher',phone:'+97150123456'})).status,400);assert.equal((await admin(api.post('/api/teachers')).send({name:'Teacher',phone:'+971501234567/+251911234567'})).status,201)});
test('legacy import fills missing data, preserves cloud changes, and is repeatable',async()=>{const{api,store}=setup();store.data.meetings.get('2').recipient='';const payload={format:'gubae-v1',recipients:{'1':'+971509876543','2':'+971509876543'},sent:{'1:poster':'2026-10-12T12:00:00Z'},meetingEdits:{'1':{topic:'Updated topic'}}};const r=await admin(api.post('/api/import')).send(payload);assert.equal(r.status,200);assert.equal((await store.get('meetings','1')).recipient,'+971501234567');assert.equal((await store.get('meetings','2')).recipient,'+971509876543');assert.equal((await admin(api.post('/api/import')).send(payload)).body.imported,0)});
test('monthly reports cover custom ranges, updated records once, missing and upcoming separately',async()=>{const{api}=setup();const saved=await admin(api.put('/api/meetings/1/report')).send(report);await admin(api.put('/api/meetings/1/report')).send({...report,revision:saved.body.revision,participants:40});const r=await admin(api.get('/api/monthly-report?month=2026-10'));assert.equal(r.status,200);assert.equal(r.body.summary.totalParticipants,40);assert.equal(r.body.summary.submitted,1);assert.equal(r.body.summary.upcoming,1);assert.equal(r.body.summary.missing,0);assert.equal(r.body.summary.averageTeachingRating,4);assert.equal((await admin(api.get('/api/monthly-report?month=invalid'))).status,400);const csv=await admin(api.get('/api/monthly-report?month=2026-10&format=csv'));assert.match(csv.headers['content-type'],/text\/csv/)});
test('report validation rejects incomplete counts; aggregates exclude cancellations and missing data',()=>{assert.throws(()=>validateReport({...report,participants:''}));assert.throws(()=>validateReport({...report,participants:-1}));assert.throws(()=>validateReport({...report,teachingRating:6}));assert.equal(validateReport({...report,status:'cancelled',missedReason:'Organizer unavailable',participants:'',teachingRating:''}).teachingRating,null);const result=monthlyReport([meeting('1','2026-10-15'),meeting('2','2026-10-16'),meeting('3','2026-10-17')],[{...report,meetingId:'1'},{...report,meetingId:'2',status:'cancelled',participants:0,teachingRating:null}],{month:'2026-10'},'2026-10-17');assert.equal(result.summary.totalParticipants,35);assert.equal(result.summary.averageParticipants,35);assert.equal(result.summary.averageTeachingRating,4);assert.equal(result.summary.missing,1);assert.deepEqual(dateRange({month:'2028-02'}),{from:'2028-02-01',to:'2028-02-29'});assert.match(reportCsv({...result,rows:[{...result.rows[0],topic:'=SUM(1,1)'}]}),/"'=SUM/)});
test('unexpected database failures return safe server error',async()=>{const{api,store}=setup();store.version=async()=>{throw Error('secret database internals')};const r=await admin(api.get('/api/state'));assert.equal(r.status,500);assert(!r.body.error.includes('secret'))});

test('new monthly programs preserve history, reset statuses, reuse contacts only by choice, and reject repeat imports',async()=>{
 const {api,store}=setup();store.data.meetings.get('2').topic='Another mahber';store.data.meetings.get('1').sent={poster:'2026-10-12'};store.data.meetings.get('1').teacherId='teacher-one';store.data.reports.set('1',{...report,id:'1',meetingId:'1'});
 const old=structuredClone(store.data.meetings.get('1'));const input={month:'2026-11',label:'ኅዳር 2019',carryContacts:true,meetings:[{topic:old.topic,date:'2026-11-15',link:old.link}]};
 assert.equal((await api.post('/api/programs').send(input)).status,401);
 assert.equal((await admin(api.post('/api/programs')).send({...input,meetings:[...input.meetings,{topic:'Bad',date:'2026-11-16',link:'https://evil.example/j/12345678901'}]})).status,400);assert.equal(store.data.meetings.size,2);
 assert.equal((await admin(api.post('/api/programs')).send(input)).status,201);
 const next=store.data.meetings.get('2026-11-1');assert.deepEqual(next.sent,{});assert.equal(next.recipient,old.recipient);assert.equal(next.teacherId,'teacher-one');assert.equal(next.poster,'');assert.deepEqual(store.data.meetings.get('1'),old);assert(store.data.reports.has('1'));
 assert.equal((await admin(api.post('/api/programs')).send(input)).status,409);
 assert.equal((await admin(api.post('/api/programs')).send({...input,month:'2026-12',carryContacts:false,meetings:[{...input.meetings[0],date:'2026-12-15'}]})).status,201);assert.equal(store.data.meetings.get('2026-12-1').recipient,'');
 const state=(await admin(api.get('/api/state'))).body;assert.equal(state.programs.length,2);assert.equal(state.meetings.length,4);
 const november=(await admin(api.get('/api/monthly-report?month=2026-11&program=2026-11'))).body;assert.equal(november.summary.scheduled,1);
});

test('teacher replacement snapshots survive later reassignment and organizer links disclose no teacher phone',async()=>{
 const {api,store}=setup();const assigned=await admin(api.post('/api/teachers')).send({name:'Assigned teacher',phone:'+971501234567'});store.data.meetings.get('1').teacherId=assigned.body.id;
 const link=await admin(api.post('/api/meetings/1/report-link')).send({});const token=new URLSearchParams(new URL(link.body.url).hash.slice(1)).get('token');
 const info=await api.get('/api/public/report/1').set('Authorization','Bearer '+token);assert.equal(info.body.meeting.assignedTeacherName,'Assigned teacher');assert(!JSON.stringify(info.body).includes('+971'));
 const saved=await api.put('/api/public/report/1').set('Authorization','Bearer '+token).send({...report,teacherOutcome:'replacement',actualTeacherName:'Cover teacher',teacherChangeReason:'Assigned teacher unavailable'});assert.equal(saved.status,200);assert.equal(saved.body.assignedTeacherName,'Assigned teacher');
 const other=await admin(api.post('/api/teachers')).send({name:'Later assigned teacher',phone:'+971509876543'});await admin(api.patch('/api/meetings/1')).send({revision:2,teacherId:other.body.id});
 const summary=(await admin(api.get('/api/monthly-report?month=2026-10'))).body;assert.equal(summary.summary.teacherReplacements,1);assert.equal(summary.summary.assignedDidNotTeach,1);assert.equal(summary.teacherChanges[0].assignedTeacherName,'Assigned teacher');assert.equal(summary.teacherChanges[0].actualTeacherName,'Cover teacher');
});

test('schedule imports assign known teachers, keep missing names pending and resolve them without overwriting manual choices',async()=>{
 const {api,store}=setup();const known=(await admin(api.post('/api/teachers')).send({name:'ዲያቆን ዶክተር ሙከራ',phone:'+971501234567'})).body;
 const loaded=await admin(api.post('/api/programs')).send({month:'2026-11',label:'New schedule',carryContacts:true,meetings:[{topic:'One',date:'Nov. 15',scheduledTeacherName:'ዲ/ን ዶ/ር ሙከራ'},{topic:'Two',date:'Nov 16',scheduledTeacherName:'Missing teacher'},{topic:'Three',date:'Nov 16',scheduledTeacherName:'Missing teacher'}]});assert.equal(loaded.status,201);
 assert.equal(store.data.meetings.get('2026-11-1').teacherId,known.id);assert.equal(store.data.meetings.get('2026-11-2').teacherId,null);assert.equal(store.data.meetings.get('2026-11-2').date,'2026-11-16');assert.equal(store.data.meetings.get('2026-11-2').link,'');
 assert.equal((await admin(api.put('/api/meetings/2026-11-2/status/link')).send({revision:1,sent:true})).status,400);
 await admin(api.patch('/api/meetings/2026-11-3')).send({revision:1,teacherId:known.id});
 const added=(await admin(api.post('/api/teachers')).send({name:'Missing teacher',phone:'+971509876543'})).body;
 assert.equal((await api.post('/api/teachers/resolve-assignments').send({})).status,401);
 const resolved=await admin(api.post('/api/teachers/resolve-assignments')).send({});assert.equal(resolved.status,200);assert.equal(resolved.body.assigned,1);assert.equal(store.data.meetings.get('2026-11-2').teacherId,added.id);assert.equal(store.data.meetings.get('2026-11-3').teacherId,known.id);
 const linked=await admin(api.patch('/api/meetings/2026-11-2')).send({revision:2,details:{link:'https://rit.zoom.us/j/98378810255'}});assert.equal(linked.status,200);assert.equal(linked.body.linkPending,false);
});

test('explicit public-access mode permits shared reads and writes without Google but keeps validation and revisions',async()=>{
 const {api}=setup({publicAccess:true});const cfg=await api.get('/api/config');assert.equal(cfg.body.accessMode,'public');
 const state=await api.get('/api/state');assert.equal(state.status,200);assert.equal(state.body.meetings.length,2);
 const teacher=await api.post('/api/teachers').send({name:'Shared teacher',phone:'+971501234567'});assert.equal(teacher.status,201);assert((await api.get('/api/state')).body.teachers.some(t=>t.phone==='+971501234567'));
 assert.equal((await api.post('/api/teachers').send({name:'Invalid',phone:'bad'})).status,400);
 const updated=await api.put('/api/meetings/1/status/link').send({revision:1,sent:true});assert.equal(updated.status,200);assert(updated.body.sent.link);
 assert.equal((await api.put('/api/meetings/1/status/link').send({revision:1,sent:false})).status,409);
 const saved=await api.put('/api/meetings/1/report').send(report);assert.equal(saved.status,200);assert.equal(saved.body.submittedBy,'public-visitor');
 assert.equal((await api.put('/api/meetings/2/report').send(report)).status,403);
});

test('shared reminder configuration validates recipients and revisions; due endpoint excludes sent and ended meetings',async()=>{
 const {api,store}=setup({publicAccess:true});
 assert.equal((await api.put('/api/reminders/config').send({revision:0,enabled:true,recipients:['bad\r\nBcc:evil@example.com']})).status,400);
 const saved=await api.put('/api/reminders/config').send({revision:0,enabled:true,recipients:['JossiMogs@gmail.com','jossimogs@gmail.com']});assert.equal(saved.status,200);assert.deepEqual(saved.body.recipients,['jossimogs@gmail.com']);
 assert.equal((await api.put('/api/reminders/config').send({revision:0,enabled:false,recipients:[]})).status,409);
 store.data.meetings.set('3',meeting('3','2026-10-17'));store.data.meetings.get('3').sent={poster:'done'};
 const due=await api.get('/api/reminders/due');assert.equal(due.status,200);assert.deepEqual(due.body.items.map(i=>i.key),['3:link']);assert.equal(due.body.enabled,true);assert.equal(due.body.dueUrl,'https://app.example.com/due.html');assert(!JSON.stringify(due.body).includes('+971'));
 assert.deepEqual((await api.get('/api/state')).body.reminderSettings.recipients,['jossimogs@gmail.com']);
});

test('month rename and confirmed deletion preserve other months and teacher contacts',async()=>{
 const {api,store}=setup({publicAccess:true});store.data.meetings.set('other',{...meeting('other','2026-11-20'),programId:'2026-11'});store.data.reports.set('1',{id:'1',status:'held'});store.data.report_links.set('1',{tokenHash:'old'});store.data.teachers.set('teacher',{name:'Teacher'});
 assert.equal((await api.patch('/api/programs/2026-10').send({revision:0,label:''})).status,400);
 const renamed=await api.patch('/api/programs/2026-10').send({revision:0,label:'ጥቅምት 2019'});assert.equal(renamed.status,200);assert.equal(renamed.body.revision,1);assert.equal(store.data.meetings.size,3);
 assert.equal((await api.delete('/api/programs/2026-10').send({revision:1,confirm:'wrong'})).status,400);
 assert.equal((await api.delete('/api/programs/2026-10').send({revision:0,confirm:'2026-10'})).status,409);assert.equal(store.data.meetings.size,3);
 const deleted=await api.delete('/api/programs/2026-10').send({revision:1,confirm:'2026-10'});assert.equal(deleted.status,200);assert.equal(deleted.body.deleted,2);assert.equal(store.data.meetings.size,1);assert(store.data.meetings.has('other'));assert.equal(store.data.reports.size,0);assert.equal(store.data.report_links.size,0);assert.equal(store.data.teachers.size,1);assert.equal((await api.get('/api/reminders/due')).body.count,0);
 assert.equal((await api.delete('/api/programs/2026-10').send({revision:0,confirm:'2026-10'})).status,404);
});

test('organizer reports always mark held; meeting-list status is independent and reflected in reports',async()=>{
 const {api,store}=setup({publicAccess:true});
 assert.equal((await api.put('/api/meetings/1/outcome').send({revision:1,outcome:'missed',reason:''})).status,400);
 const missed=await api.put('/api/meetings/1/outcome').send({revision:1,outcome:'missed',reason:'Teacher unavailable'});assert.equal(missed.status,200);assert.equal(store.data.reports.size,0);
 let dashboard=(await api.get('/api/monthly-report?month=2026-10')).body;assert.equal(dashboard.summary.missed,1);assert.equal(dashboard.missedReasons[0].reason,'Teacher unavailable');
 const saved=await api.put('/api/meetings/1/report').send({...report,status:'missed'});assert.equal(saved.status,200);assert.equal(saved.body.status,'held');assert.equal(store.data.meetings.get('1').outcome,'held');assert.equal(store.data.meetings.get('1').outcomeReason,'');
 const revision=store.data.meetings.get('1').revision;assert.equal((await api.put('/api/meetings/1/outcome').send({revision:1,outcome:'cancelled',reason:'No venue'})).status,409);
 const manual=await api.put('/api/meetings/1/outcome').send({revision,outcome:'cancelled',reason:'No venue'});assert.equal(manual.status,200);dashboard=(await api.get('/api/monthly-report?month=2026-10')).body;assert.equal(dashboard.summary.held,0);assert.equal(dashboard.summary.cancelled,1);assert.equal(dashboard.summary.totalParticipants,0);assert.equal(dashboard.rows[0].report.participants,35,'manual change preserves report content');
 const restored=await api.put('/api/meetings/1/report').send({...report,revision:saved.body.revision});assert.equal(restored.status,200);assert.equal(store.data.meetings.get('1').outcome,'held');
 const direct=await api.put('/api/meetings/2/outcome').send({revision:1,outcome:'held'});assert.equal(direct.status,200);dashboard=(await api.get('/api/monthly-report?month=2026-10')).body;assert.equal(dashboard.summary.held,2);assert.equal(dashboard.summary.totalParticipants,35);assert.equal(dashboard.summary.averageParticipants,35);assert.equal(dashboard.rows[1].report,null,'manual held does not fabricate attendance');
});

test('single teacher-name reports infer coverage and preserve the original assignment',async()=>{
 const {api,store}=setup();store.data.teachers.set('scheduled',{id:'scheduled',name:'ዲያቆን ዳዊት'});store.data.meetings.get('1').teacherId='scheduled';
 const link=await admin(api.post('/api/meetings/1/report-link')).send({});
 const token=new URLSearchParams(new URL(link.body.url).hash.slice(1)).get('token');
 const write=body=>api.put('/api/public/report/1').set('Authorization','Bearer '+token).send(body);
 const first=await write({...report,teacherEntryMode:'name',actualTeacherName:'ዲ/ን ዳዊት',assignedTeacherName:'Spoofed name'});
 assert.equal(first.status,200);assert.equal(first.body.teacherOutcome,'assigned');assert.equal(first.body.assignedTeacherName,'ዲያቆን ዳዊት');assert.equal(first.body.actualTeacherName,'ዲ/ን ዳዊት');
 const second=await write({...report,revision:1,teacherEntryMode:'name',actualTeacherName:'ቀሲስ አብነት'});
 assert.equal(second.status,200);assert.equal(second.body.teacherOutcome,'replacement');assert.equal(second.body.teacherChangeReason,'');assert.equal(second.body.status,'held');
 store.data.teachers.set('later',{id:'later',name:'Later teacher'});store.data.meetings.get('1').teacherId='later';
 const third=await write({...report,revision:2,teacherEntryMode:'name',actualTeacherName:'ቀሲስ አብነት'});
 assert.equal(third.status,200);assert.equal(third.body.assignedTeacherName,'ዲያቆን ዳዊት');
 const dashboard=(await admin(api.get('/api/monthly-report?month=2026-10'))).body;
 assert.equal(dashboard.summary.teacherReplacements,1);assert.equal(dashboard.teacherChanges[0].actualTeacherName,'ቀሲስ አብነት');
 assert.equal((await write({...report,revision:3,teacherEntryMode:'name',actualTeacherName:''})).status,400);
});
