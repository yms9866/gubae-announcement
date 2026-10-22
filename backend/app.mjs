import {normalizeTiming,DEFAULT_TIMING} from '../dist/announcement-timing.mjs';
import{dueAnnouncements,reminderEmails}from'../dist/announcements-due.mjs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import{randomBytes,randomUUID,createHash,timingSafeEqual}from'node:crypto';
import{normalizeMeetingEdit,phoneList,phoneDigits,dubaiDate}from'../dist/core.mjs';
import{validateReport,dateRange,monthlyReport,reportCsv}from'../dist/reporting.mjs';
import{validateProgram,programOf,topicKey}from'../dist/programs.mjs';
import{matchTeacher}from'../dist/teacher-match.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const validated=fn=>{try{return fn()}catch(e){throw fail(400,e.message)}};
const hash=token=>createHash('sha256').update(token).digest('hex');
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const revision=body=>{if(!Number.isInteger(body.revision)||body.revision<0)throw fail(400,'A record revision is required. Refresh and try again.');return body.revision};
const requireMeeting=m=>{if(!m)throw fail(404,'Gubae not found.');return m};
function teacherData(body){const name=clean(body.name,120),phone=clean(body.phone,100),email=clean(body.email,200),notes=clean(body.notes,2000);if(!name)throw fail(400,'Enter the teacher’s name.');if(!phone||!phoneList(phone).every(phoneDigits))throw fail(400,'Enter a valid international WhatsApp number.');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Enter a valid email address.');return{name,phone,email,notes,archived:body.archived===true};}
export function createApp({store,verifyAdmin,createSessionCookie,verifySessionCookie,publicAccess=false,webConfig={},signInDomainReady,origins=[],frontendUrl,now=()=>new Date()}){
 const app=express();app.disable('x-powered-by');app.use(helmet());app.use(cors({origin(origin,cb){cb(null,!origin||origins.includes(origin));},exposedHeaders:['ETag']}));app.use(express.json({limit:'512kb'}));app.param('id',(req,res,next,id)=>next(/^[A-Za-z0-9_-]{1,100}$/.test(id)?null:fail(400,'Invalid record ID.')));app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next()});app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));
 const cookieValue=req=>{const entry=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-gubae_session='));return entry?entry.slice('__Host-gubae_session='.length):''};
 const sameOrigin=req=>{if(req.headers.origin&&!origins.includes(req.headers.origin))throw fail(403,'This browser origin is not allowed.');};
 const verified=async req=>{const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(token)return verifyAdmin(token);const cookie=cookieValue(req);if(cookie&&verifySessionCookie)return verifySessionCookie(cookie);throw fail(401,'Sign in with your administrator Google account.');};
 const admin=async(req,res,next)=>{if(publicAccess){req.admin={email:'public-visitor'};return next();}try{req.admin=await verified(req);next()}catch(e){next(e.status?e:fail(401,'Your sign-in expired. Sign in again.'))}};

 const linkAuth=async(req,res,next)=>{try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^gbr_[A-Za-z0-9_-]{43}$/.test(token))throw fail(401,'This report link is invalid.');const record=await store.get('report_links',req.params.id);const actual=hash(token);if(!record||record.expiresAt<=now().toISOString()||![record.tokenHash,record.previousTokenHash].filter(v=>typeof v==='string'&&v.length===64).some(v=>timingSafeEqual(Buffer.from(actual),Buffer.from(v))))throw fail(401,'This report link expired or was replaced. Ask the organizer for a new link.');req.linkRecord=record;next()}catch(e){next(e)}};
 app.get('/health',(req,res)=>res.json({ok:true,service:'gubae-announcements-api'}));
 app.get('/api/config',(req,res)=>res.json({firebase:webConfig,frontendUrl,timezone:'Asia/Dubai',signInDomainReady,accessMode:publicAccess?'public':'google'}));

 app.post('/api/browser-session',async(req,res)=>{
  sameOrigin(req);const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!token||!createSessionCookie)throw fail(401,'Sign in with your administrator Google account.');
  let user;try{user=await verifyAdmin(token);}catch(e){throw fail(e.status||401,'Sign in with your authorized administrator Google account.');}const cookie=await createSessionCookie(token);
  res.cookie('__Host-gubae_session',cookie,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:5*86400000});
  res.json({authenticated:true,email:user.email});
 });
 app.get('/api/browser-session',async(req,res)=>{
  const cookie=cookieValue(req);if(!cookie||!verifySessionCookie)throw fail(401,'Sign in required.');
  try{const user=await verifySessionCookie(cookie);res.json({authenticated:true,email:user.email});}catch{throw fail(401,'Your sign-in expired.');}
 });
 app.delete('/api/browser-session',(req,res)=>{sameOrigin(req);res.clearCookie('__Host-gubae_session',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});res.status(204).end();});
 app.put('/api/announcement-timing',admin,async(req,res)=>{
  const timing=validated(()=>normalizeTiming(req.body.timing));
  res.json(await store.write('settings','announcement-timing',revision(req.body),()=>({timing})));
 });

 app.get('/api/state',admin,async(req,res)=>{const v=await store.version(),tag='"'+v+'"';res.set('Cache-Control','private, no-cache');res.set('ETag',tag);if(req.headers['if-none-match']===tag)return res.status(304).end();const[meetings,teachers,reports,programs,reminderSettings,announcementTiming]=await Promise.all([...['meetings','teachers','reports','programs'].map(n=>store.list(n)),store.get('settings','email-reminders'),store.get('settings','announcement-timing')]);res.json({version:v,meetings,teachers,reports,programs,reminderSettings:reminderSettings||{recipients:[],enabled:false,revision:0},announcementTiming:announcementTiming||{timing:DEFAULT_TIMING,revision:0},adminEmail:req.admin.email});});
 app.put('/api/reminders/config',admin,async(req,res)=>{const recipients=validated(()=>reminderEmails(req.body.recipients));if(typeof req.body.enabled!=='boolean')throw fail(400,'Choose whether reminders are enabled.');if(req.body.enabled&&!recipients.length)throw fail(400,'Add at least one reminder email.');res.json(await store.write('settings','email-reminders',revision(req.body),()=>({recipients,enabled:req.body.enabled})));});

 const schedulerOrAdmin=async(req,res,next)=>{
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(token.startsWith('gsr_')){try{const config=await store.get('settings','reminder-scheduler');const actual=hash(token);if(!config?.tokenHash||config.tokenHash.length!==64||!timingSafeEqual(Buffer.from(actual),Buffer.from(config.tokenHash)))throw fail(401,'The reminder scheduler must reconnect.');req.admin={email:'reminder-scheduler'};return next();}catch(e){return next(e);}}
  return admin(req,res,next);
 };
 app.post('/api/reminders/scheduler-token',admin,async(req,res)=>{
  const token='gsr_'+randomBytes(32).toString('base64url');
  await store.write('settings','reminder-scheduler',null,()=>({tokenHash:hash(token)}));
  res.json({token});
 });

 app.get('/api/reminders/due',schedulerOrAdmin,async(req,res)=>{const[meetings,reports,settings,timingSettings]=await Promise.all([store.list('meetings'),store.list('reports'),store.get('settings','email-reminders'),store.get('settings','announcement-timing')]);const items=dueAnnouncements(meetings,reports,now(),{},timingSettings?.timing).map(t=>({key:t.key,meetingId:t.meeting.id,topic:t.meeting.topic,type:t.type,due:t.due,dueAt:t.dueAt,meetingDate:t.meeting.date}));res.json({date:dubaiDate(now()),timezone:'Asia/Dubai',enabled:settings?.enabled===true,recipients:settings?.recipients||[],count:items.length,dueUrl:new URL('due.html',frontendUrl).href,items});});
 app.patch('/api/meetings/:id',admin,async(req,res)=>{const expected=revision(req.body);let teacherId=req.body.teacherId;if(teacherId!==undefined&&teacherId!==null){if(typeof teacherId!=='string'||!(await store.get('teachers',teacherId)))throw fail(400,'Choose an existing teacher.');}const result=await store.write('meetings',req.params.id,expected,old=>{requireMeeting(old);let next={...old};if(req.body.details){const details=validated(()=>normalizeMeetingEdit(old,req.body.details));if(Object.entries(details).some(([k,v])=>(old[k]??(k==='startTime'?'21:00':k==='durationMinutes'?90:undefined))!==v))next.sent={};Object.assign(next,details);}if(req.body.recipient!==undefined){if(typeof req.body.recipient!=='string'||req.body.recipient.length>100)throw fail(400,'Recipient numbers are too long.');next.recipient=req.body.recipient.trim();}if(teacherId!==undefined){next.teacherId=teacherId;if(teacherId!==old.teacherId)next.sent={...next.sent,teacher:null};}return next;});res.json(result);});
 app.put('/api/meetings/:id/outcome',admin,async(req,res)=>{const outcome=req.body.outcome;if(!['held','missed','cancelled','postponed','auto'].includes(outcome))throw fail(400,'Choose a valid meeting status.');const reason=typeof req.body.reason==='string'?req.body.reason.trim():'';if(reason.length>2000||(['missed','cancelled','postponed'].includes(outcome)&&!reason))throw fail(400,'Give a reason up to 2000 characters.');res.json(await store.write('meetings',req.params.id,revision(req.body),old=>{requireMeeting(old);return{...old,outcome:outcome==='auto'?null:outcome,outcomeReason:['held','auto'].includes(outcome)?'':reason};}));});
 app.put('/api/meetings/:id/status/:kind',admin,async(req,res)=>{if(!['poster','link','report','teacher'].includes(req.params.kind)||typeof req.body.sent!=='boolean')throw fail(400,'Choose a valid announcement status.');const result=await store.write('meetings',req.params.id,revision(req.body),old=>{requireMeeting(old);if(req.body.sent&&['link','teacher'].includes(req.params.kind)&&!old.link)throw fail(400,'Add a Zoom link before marking its invitation sent.');return{...old,sent:{...old.sent,[req.params.kind]:req.body.sent?now().toISOString():null}}});res.json(result);});
 app.patch('/api/programs/:id',admin,async(req,res)=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.params.id))throw fail(400,'Choose a valid month.');const label=typeof req.body.label==='string'?req.body.label.trim():'';if(!label||label.length>100)throw fail(400,'Enter a month label up to 100 characters.');res.json(await store.updateProgram(req.params.id,revision(req.body),label));});
 app.delete('/api/programs/:id',admin,async(req,res)=>{if(req.body.confirm!==req.params.id)throw fail(400,'Type the month ID to confirm deletion.');res.json(await store.deleteProgram(req.params.id,revision(req.body)));});
 app.post('/api/programs',admin,async(req,res)=>{const program=validated(()=>validateProgram(req.body));const [existing,teacherContacts]=await Promise.all([store.list('meetings'),store.list('teachers')]);if(existing.some(m=>programOf(m)===program.id))throw fail(409,'This month already has a program. Select it to edit its meetings, or choose a different starting month.');const previous=existing.filter(m=>programOf(m)<program.id).sort((a,b)=>b.date.localeCompare(a.date));const meetings=program.meetings.map((m,index)=>{const prior=program.carryContacts?previous.find(p=>topicKey(p.topic)===topicKey(m.topic)):null;return{...m,id:program.id+'-'+(index+1),recipient:prior?.recipient||'',teacherId:m.scheduledTeacherName?matchTeacher(m.scheduledTeacherName,teacherContacts).teacherId:prior?.teacherId||null,sent:{}}});const record=await store.createProgram({id:program.id,month:program.month,label:program.label},meetings);res.status(201).json(record);});
 app.post('/api/teachers/resolve-assignments',admin,async(req,res)=>{const[meetings,teachers]=await Promise.all([store.list('meetings'),store.list('teachers')]);let assigned=0;const unresolved=[];for(const m of meetings.filter(m=>!m.teacherId&&m.scheduledTeacherName)){const match=matchTeacher(m.scheduledTeacherName,teachers);if(match.status!=='matched'){unresolved.push({meetingId:m.id,name:m.scheduledTeacherName,status:match.status});continue;}try{await store.write('meetings',m.id,m.revision,old=>{if(old.teacherId)throw fail(409,'Teacher was assigned on another device.');return{...old,teacherId:match.teacherId,sent:{...old.sent,teacher:null}}});assigned++;}catch(e){if(e.status!==409)throw e;}}res.json({assigned,unresolved});});
 app.post('/api/teachers',admin,async(req,res)=>res.status(201).json(await store.write('teachers',randomUUID(),0,()=>teacherData(req.body))));
 app.patch('/api/teachers/:id',admin,async(req,res)=>res.json(await store.write('teachers',req.params.id,revision(req.body),old=>{if(!old)throw fail(404,'Teacher not found.');return{...old,...teacherData({...old,...req.body})}})));
 const saveReport=async(req,res,isAdmin)=>{const meeting=requireMeeting(await store.get('meetings',req.params.id));if(meeting.date>dubaiDate(now()))throw fail(403,'Reporting opens on the gubae day in Dubai.');const previous=await store.get('reports',meeting.id),teacher=meeting.teacherId?await store.get('teachers',meeting.teacherId):null;const data=validated(()=>validateReport({...previous,...req.body,status:'held',assignedTeacherName:req.body.teacherEntryMode==='name'?(previous?.assignedTeacherName??teacher?.name??meeting.scheduledTeacherName??''):(req.body.assignedTeacherName??previous?.assignedTeacherName??teacher?.name??meeting.scheduledTeacherName??'')}));const report=await store.saveMeetingReport(meeting.id,meeting.revision,revision(req.body),{...data,meetingId:meeting.id,meetingDate:meeting.date,submittedAt:previous?.submittedAt||now().toISOString(),submittedBy:isAdmin?req.admin.email:'organizer-link',lastUpdatedBy:isAdmin?req.admin.email:'organizer-link'});res.json(report)};
 app.put('/api/meetings/:id/report',admin,(req,res)=>saveReport(req,res,true));

 const prepareReportLink=async(req,res,reuse)=>{
  const m=requireMeeting(await store.get('meetings',req.params.id)),previous=await store.get('report_links',m.id);
  const expiry=new Date(m.date+'T23:59:59+04:00');expiry.setUTCDate(expiry.getUTCDate()+45);
  if(expiry<=now())throw fail(400,'This gubae is too old for a new organizer link. Use the admin report form.');
  let token=reuse&&previous?.token&&previous.expiresAt>now().toISOString()?previous.token:null;
  if(!token){token='gbr_'+randomBytes(32).toString('base64url');await store.write('report_links',m.id,previous?.revision||0,()=>({token,tokenHash:hash(token),...(reuse&&previous?.expiresAt>now().toISOString()?{previousTokenHash:previous.tokenHash}:{}),expiresAt:expiry.toISOString()}));}
  const url=new URL('report.html',frontendUrl);url.searchParams.set('report',m.id);url.hash=new URLSearchParams({token,api:req.protocol+'://'+req.get('host')}).toString();
  res.json({url:url.href,expiresAt:expiry.toISOString()});
 };
 app.post('/api/meetings/:id/report-link',admin,(req,res)=>prepareReportLink(req,res,false));
 app.post('/api/meetings/:id/report-link/prepare',admin,(req,res)=>prepareReportLink(req,res,true));

 app.delete('/api/meetings/:id/report-link',admin,async(req,res)=>{requireMeeting(await store.get('meetings',req.params.id));await store.write('report_links',req.params.id,null,()=>({tokenHash:hash(randomBytes(32).toString('hex')),expiresAt:now().toISOString()}));res.status(204).end()});
 app.get('/api/public/report/:id',linkAuth,async(req,res)=>{const m=requireMeeting(await store.get('meetings',req.params.id)),report=await store.get('reports',m.id),teacher=m.teacherId?await store.get('teachers',m.teacherId):null;res.set('Cache-Control','no-store');res.json({meeting:{id:m.id,topic:m.topic,date:m.date,startTime:m.startTime||'21:00',assignedTeacherName:report?.assignedTeacherName||teacher?.name||m.scheduledTeacherName||''},report,canSubmit:m.date<=dubaiDate(now()),expiresAt:req.linkRecord.expiresAt});});
 app.put('/api/public/report/:id',linkAuth,(req,res)=>saveReport(req,res,false));
 app.post('/api/import',admin,async(req,res)=>{const input=req.body;if(!input||input.format!=='gubae-v1')throw fail(400,'Choose a Gubae backup or contact import.');const records=await store.list('meetings');let imported=0;for(const m of records){const patch={};if(!m.recipient&&typeof input.recipients?.[m.id]==='string')patch.recipient=input.recipients[m.id].slice(0,100);if(m.revision===1&&input.meetingEdits?.[m.id])patch.details=validated(()=>normalizeMeetingEdit(m,input.meetingEdits[m.id]));const sent={...m.sent};for(const kind of ['poster','link','report']){const at=input.sent?.[m.id+':'+kind];if(!sent[kind]&&typeof at==='string'&&!isNaN(Date.parse(at)))sent[kind]=new Date(at).toISOString();}if(Object.keys(patch).length||JSON.stringify(sent)!==JSON.stringify(m.sent)){await store.write('meetings',m.id,m.revision,old=>({...old,...(patch.details||{}),...(patch.recipient?{recipient:patch.recipient}:{}),sent}));imported++;}}res.json({imported,message:'Imported missing data; existing cloud records were preserved.'});});
 app.get('/api/monthly-report',admin,async(req,res)=>{const range=validated(()=>dateRange(req.query)),[meetings,reports,teachers]=await Promise.all([store.list('meetings'),store.list('reports'),store.list('teachers')]);const result=monthlyReport(req.query.program?meetings.filter(m=>programOf(m)===req.query.program):meetings,reports,range,dubaiDate(now()),teachers);if(req.query.format==='csv'){res.set('Content-Disposition',`attachment; filename="gubae-report-${range.from}-${range.to}.csv"`);res.type('text/csv').send(reportCsv(result));}else res.json(result);});
 app.use((err,req,res,next)=>{const status=Number.isInteger(err.status)&&err.status>=400&&err.status<=599?err.status:500;if(status>=500)console.error('API error:',err.code||err.name);res.status(status).json({error:status>=500?'The database could not be reached. Your change was not confirmed. Try again.':err.message||'Request failed.'});});return app;
}
