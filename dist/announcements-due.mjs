import {tasksFor,dubaiDate} from './core.mjs';
import {meetingStatus} from './meeting-status.mjs';
export function dueAnnouncements(meetings,reports=[],now=new Date(),sent={}){
 const today=dubaiDate(now),byId=new Map(reports.map(r=>[r.meetingId||r.id,r]));
 return tasksFor(meetings).filter(t=>!sent[t.key]&&!t.meeting.sent?.[t.type]&&t.due<=today&&meetingStatus(t.meeting,byId.get(t.meeting.id),now)==='upcoming');
}
export function reminderEmails(value){
 if(!Array.isArray(value)&&typeof value!=='string')throw Error('Enter email addresses separated by commas or new lines.');
 if((typeof value==='string'&&value.length>12000)||(Array.isArray(value)&&value.length>50))throw Error('Use up to 50 email addresses.');
 const list=Array.isArray(value)?value:value.split(/[,;\n\r]+/);const result=[];
 for(const entry of list){if(typeof entry!=='string')throw Error('Enter a valid email address.');const email=entry.trim().toLowerCase();if(!email)continue;if(email.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email))throw Error('Check this email address: '+email.slice(0,80));if(!result.includes(email))result.push(email);}
 if(result.length>50)throw Error('Use up to 50 email addresses.');return result;
}
