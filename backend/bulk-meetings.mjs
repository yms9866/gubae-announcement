import {normalizeMeetingEdit} from '../dist/core.mjs';
import {matchTeacher} from '../dist/teacher-match.mjs';
import {ConflictError} from './store.mjs';

const fail=(status,message)=>Object.assign(new Error(message),{status});
export function validateCanvaUrl(value){
 let url;try{url=new URL(String(value||''))}catch{throw fail(400,'Use a full HTTPS Canva design link.')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='canva.com'||url.hostname.endsWith('.canva.com')||url.hostname==='canva.link'))throw fail(400,'Use an HTTPS Canva design link from canva.com or canva.link.');
 if(url.hostname!=='canva.link'&&!/^\/(?:d|design)\//.test(url.pathname))throw fail(400,'Use a Canva design link, not a general Canva page.');
 return url.href;
}
const zoomId=value=>{try{const u=new URL(String(value||''));if(u.protocol!=='https:'||!(u.hostname==='zoom.us'||u.hostname.endsWith('.zoom.us'))||!/^\/j\/\d{9,11}\/?$/.test(u.pathname))return'';return u.pathname.split('/')[2]}catch{return''}};

export function prepareBulkMeetingUpdates(rows,meetings,teachers){
 if(!Array.isArray(rows)||!rows.length||rows.length>100)throw fail(400,'Provide between 1 and 100 spreadsheet rows.');
 const byZoom=new Map();for(const m of meetings){const id=zoomId(m.link);if(id){if(!byZoom.has(id))byZoom.set(id,[]);byZoom.get(id).push(m)}}
 const counts=new Map();for(const row of rows){const id=zoomId(row?.zoomLink);if(id)counts.set(id,(counts.get(id)||0)+1)}
 const updates=[],unmatched=[],duplicates=[],invalid=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i]||{},id=zoomId(row.zoomLink),line=Number(row.rowNumber)||i+1;
  if(!id){invalid.push({row:line,reason:'Invalid Zoom meeting link or missing meeting ID.'});continue}
  if(counts.get(id)>1){duplicates.push({row:line,zoomId:id});continue}
  const candidates=byZoom.get(id)||[];
  if(candidates.length!==1){unmatched.push({row:line,zoomId:id,reason:candidates.length?'Zoom ID matches more than one existing meeting.':'No existing meeting has this Zoom ID.'});continue}
  const meeting=candidates[0],patch={},warnings=[];
  try{
   if(row.date){patch.date=normalizeMeetingEdit(meeting,{date:row.date}).date}
   if(row.startTime){patch.startTime=normalizeMeetingEdit(meeting,{startTime:row.startTime}).startTime}
   if(row.durationMinutes!==''&&row.durationMinutes!=null){patch.durationMinutes=normalizeMeetingEdit(meeting,{durationMinutes:Number(row.durationMinutes)}).durationMinutes}
   if(row.canva)patch.canva=validateCanvaUrl(row.canva);
   const teacher=String(row.teacher||'').trim();
   if(teacher&&teacher!=='1'){
    if(teacher.length>120)throw fail(400,'Teacher name must be up to 120 characters.');
    const match=matchTeacher(teacher,teachers);
    patch.scheduledTeacherName=teacher;patch.teacherId=match.status==='matched'?match.teacherId:null;
    if(match.status!=='matched')warnings.push(match.status==='ambiguous'?'Teacher name matches more than one contact. Assignment left unassigned.':'No matching teacher contact. Name saved; assignment left unassigned.');
   }
   if(!Object.keys(patch).length){invalid.push({row:line,reason:'This row has no nonblank fields to update.'});continue}
   updates.push({meetingId:meeting.id,topic:meeting.topic,zoomId:id,revision:meeting.revision,patch,warnings,old:{date:meeting.date,startTime:meeting.startTime||'21:00',durationMinutes:meeting.durationMinutes||90,teacher:meeting.scheduledTeacherName||'',canva:meeting.canva||''}});
  }catch(e){invalid.push({row:line,reason:e.message})}
 }
 return{updates,unmatched,duplicates,invalid};
}

export async function commitBulkMeetingUpdates(store,updates){
 if(!Array.isArray(updates)||!updates.length||updates.length>100)throw fail(400,'No valid meeting updates were provided.');
 const ids=new Set();for(const item of updates){if(!item||typeof item.meetingId!=='string'||ids.has(item.meetingId)||!Number.isInteger(item.revision)||!item.patch||typeof item.patch!=='object')throw fail(400,'The preview contains invalid or duplicate meeting records. Preview again.');ids.add(item.meetingId)}
 return store.transaction('meetings',async tx=>{
  const refs=updates.map(item=>store.collection('meetings').doc(item.meetingId));
  const docs=await tx.getAll(...refs,store.meta),meta=docs.at(-1),records=docs.slice(0,-1);
  for(let i=0;i<updates.length;i++)if(!records[i].exists||(records[i].data().revision||0)!==updates[i].revision)throw new ConflictError();
  const updatedAt=new Date().toISOString(),changes=[],saved=[];
  for(let i=0;i<updates.length;i++){
   const old={...records[i].data(),id:updates[i].meetingId},next={...old,...updates[i].patch,id:old.id,revision:(old.revision||0)+1,updatedAt};
   tx.set(refs[i],next);changes.push({name:'meetings',id:old.id,value:next});saved.push({id:old.id,revision:next.revision});
  }
  const version=(meta.data()?.version||0)+1;tx.set(store.meta,{version},{merge:true});
  return{value:{updated:saved.length,meetings:saved},version,changes};
 });
}
