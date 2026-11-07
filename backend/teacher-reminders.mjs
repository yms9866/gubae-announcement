import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {teacherDays} from '../dist/teacher-days.mjs';
import {reminderEmails} from '../dist/announcements-due.mjs';
const hash=token=>createHash('sha256').update(token).digest('hex');
export function teacherReminderConfig(input,old){
 const recipients=reminderEmails(input.recipients);if(typeof input.enabled!=='boolean'||input.enabled&&!recipients.length)throw Error('Add a recipient email before enabling teacher reminders.');
 return{enabled:input.enabled,recipients,links:recipients.map(email=>{const prior=old?.links?.find(e=>e.email===email);if(prior)return prior;const token='gtd_'+randomBytes(32).toString('base64url');return{email,token,tokenHash:hash(token)}})};
}
export async function teacherReminderIdentity(store,token){
 const denied=()=>Object.assign(Error('Open your private teacher reminder link. It may have been removed or replaced.'),{status:401});
 if(!/^gtd_[A-Za-z0-9_-]{43}$/.test(token||''))throw denied();const settings=await store.get('settings','teacher-reminders'),actual=hash(token);
 const link=settings?.links?.find(e=>e.tokenHash?.length===64&&timingSafeEqual(Buffer.from(actual),Buffer.from(e.tokenHash)));
 if(!link||!settings.recipients?.includes(link.email))throw denied();return{email:link.email};
}
export function teacherReminderPayload(meetings,teachers,reports,settings,frontendUrl,now){
 const items=teacherDays(meetings,teachers,reports,now).flatMap(g=>g.meetings).filter(({meeting})=>!meeting.sent?.teacher).map(({meeting,teacher})=>({meetingId:meeting.id,topic:meeting.topic,meetingDate:meeting.date,teacherName:teacher?.name||meeting.scheduledTeacherName||'Teacher not assigned'}));
 return{enabled:settings?.enabled===true,recipients:settings?.recipients||[],count:items.length,items,recipientLinks:Object.fromEntries((settings?.links||[]).filter(e=>settings.recipients.includes(e.email)).map(e=>{const url=new URL('teachers-day.html',frontendUrl);url.hash=new URLSearchParams({teacherAccess:e.token}).toString();return[e.email,url.href]}))};
}
