import test from 'node:test';
import assert from 'node:assert/strict';
import {meetingStatus,meetingListStatus,meetingStatusLabel} from '../../dist/meeting-status.mjs';
const meeting={date:'2026-10-16',startTime:'21:00',durationMinutes:90};
test('meeting filters use confirmed outcomes and the scheduled end in Dubai',()=>{
 assert.equal(meetingStatus(meeting,null,new Date('2026-10-16T20:59:00+04:00')),'upcoming');
 assert.equal(meetingStatus(meeting,null,new Date('2026-10-16T22:00:00+04:00')),'upcoming');
 assert.equal(meetingStatus(meeting,null,new Date('2026-10-16T22:30:00+04:00')),'overdue');
 assert.equal(meetingStatus(meeting,{status:'held'},new Date('2026-10-17T10:00:00+04:00')),'held');
 for(const status of ['cancelled','missed','postponed'])assert.equal(meetingStatus(meeting,{status},new Date('2026-10-17T10:00:00+04:00')),status);
 const overnight={...meeting,startTime:'23:30',durationMinutes:60};
 assert.equal(meetingStatus(overnight,null,new Date('2026-10-17T00:15:00+04:00')),'upcoming');
 assert.equal(meetingStatus(overnight,null,new Date('2026-10-17T00:30:00+04:00')),'overdue');
});

test('explicit meeting-list outcome takes precedence over an older report',()=>{for(const outcome of ['held','missed','cancelled','postponed'])assert.equal(meetingStatus({...meeting,outcome},{status:'held'}),outcome);assert.equal(meetingStatus({...meeting,outcome:null},{status:'held'}),'held');});

test('Today starts exactly at 6 AM Dubai on the meeting day and ends at scheduled end',()=>{
 const at=time=>meetingListStatus(meeting,null,new Date(time));
 assert.equal(at('2026-10-15T23:59:59+04:00'),'upcoming');
 assert.equal(at('2026-10-16T05:59:59+04:00'),'upcoming');
 assert.equal(at('2026-10-16T06:00:00+04:00'),'today');
 assert.equal(at('2026-10-16T02:00:00Z'),'today');
 assert.equal(at('2026-10-16T20:59:59+04:00'),'today');
 assert.equal(at('2026-10-16T21:00:00+04:00'),'today');
 assert.equal(at('2026-10-16T22:29:59+04:00'),'today');
 assert.equal(at('2026-10-16T22:30:00+04:00'),'overdue');
 assert.equal(meetingStatusLabel('today'),'Today');
});
test('confirmed outcomes override Today and tomorrow stays Upcoming',()=>{
 const now=new Date('2026-10-16T10:00:00+04:00');
 for(const outcome of ['held','missed','cancelled','postponed']){
  assert.equal(meetingListStatus({...meeting,outcome},null,now),outcome);
  assert.equal(meetingListStatus(meeting,{status:outcome},now),outcome);
 }
 assert.equal(meetingListStatus({...meeting,date:'2026-10-17'},null,now),'upcoming');
 // The due-announcements and teacher-day workflows still use the original active status.
 assert.equal(meetingStatus(meeting,null,now),'upcoming');
});
