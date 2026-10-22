import {dubaiDate,shiftDate} from './core.mjs';
import {meetingStatus} from './meeting-status.mjs';
// Show assignments from two calendar days before each gubae until it ends.
export function teacherDays(meetings,teachers,reports=[],now=new Date()){
 const today=dubaiDate(now),last=shiftDate(today,2);
 const contacts=new Map(teachers.map(t=>[t.id,t]));
 const outcomes=new Map(reports.map(r=>[r.meetingId||r.id,r]));
 const groups=new Map();
 for(const m of [...meetings].sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'21:00').localeCompare(b.startTime||'21:00'))){
  if(m.date<today||m.date>last||meetingStatus(m,outcomes.get(m.id),now)!=='upcoming')continue;
  if(!groups.has(m.date))groups.set(m.date,{date:m.date,weekday:new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(m.date+'T12:00:00Z')),meetings:[]});
  groups.get(m.date).meetings.push({meeting:m,teacher:contacts.get(m.teacherId)||null});
 }
 return [...groups.values()];
}
