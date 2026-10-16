import test from 'node:test';
import assert from 'node:assert/strict';
import {meetingStatus} from '../../dist/meeting-status.mjs';
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
