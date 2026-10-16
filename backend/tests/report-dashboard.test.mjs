import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyReport,validateReport,reportCsv} from '../../dist/reporting.mjs';
const base={organizerName:'Organizer',status:'held',participants:30,teachingRating:4,teachingFeedback:'Helpful',comments:''};
test('report validation requires missed reasons and explicit replacement / absence details',()=>{
 assert.throws(()=>validateReport({...base,status:'missed'}),/Why was/);
 assert.throws(()=>validateReport({...base,teacherOutcome:'replacement',assignedTeacherName:'Assigned'}),/Replacement teacher name/);
 assert.throws(()=>validateReport({...base,teacherOutcome:'replacement',assignedTeacherName:'Assigned',actualTeacherName:'Cover'}),/Reason assigned/);
 assert.throws(()=>validateReport({...base,teacherOutcome:'replacement',assignedTeacherName:'Assigned',actualTeacherName:'assigned',teacherChangeReason:'Unavailable'}),/different teacher/);
 const absent=validateReport({...base,status:'missed',missedReason:'Teacher unavailable',teacherOutcome:'not_taught',assignedTeacherName:'Assigned',teacherChangeReason:'Unavailable'});assert.equal(absent.participants,0);assert.equal(absent.teachingRating,null);assert.equal(absent.teachingFeedback,'');
 assert.throws(()=>validateReport({...base,status:'missed',missedReason:'Unavailable',teacherOutcome:'assigned',assignedTeacherName:'Assigned'}),/only be recorded/);
});
test('dashboard separates confirmed missed gubaes, missing reports, unknown attendance, and teacher changes',()=>{
 const meetings=Array.from({length:7},(_,i)=>({id:String(i+1),topic:'Mahber '+(i+1),date:i===5?'2026-10-30':'2026-10-15'}));
 const reports=[{...base,meetingId:'1',teacherOutcome:'replacement',assignedTeacherName:'Assigned',actualTeacherName:'Cover',teacherChangeReason:'Travel'},
 {...base,meetingId:'2',status:'missed',participants:0,teachingRating:null,missedReason:'Teacher unavailable',teacherOutcome:'not_taught',assignedTeacherName:'Absent',teacherChangeReason:'Illness'},
 {...base,meetingId:'3',status:'cancelled',participants:0,teachingRating:null,missedReason:'Venue closed'},
 {...base,meetingId:'4',status:'postponed',participants:0,teachingRating:null},
 {...base,meetingId:'7',participants:15,teachingRating:5}];
 const r=monthlyReport(meetings,reports,{month:'2026-10'},'2026-10-16');
 assert.equal(r.summary.scheduled,7);assert.equal(r.summary.held,2);assert.equal(r.summary.missed,3);assert.equal(r.summary.missing,1);assert.equal(r.summary.upcoming,1);assert.equal(r.summary.totalParticipants,45);assert.equal(r.summary.teacherReplacements,1);assert.equal(r.summary.assignedDidNotTeach,2);assert.equal(r.summary.teacherNotRecorded,1);assert.equal(r.summary.averageTeachingRating,4.5);
 assert(r.missedReasons.some(v=>v.reason==='Reason not recorded'));assert.equal(r.teacherChanges.length,2);assert.equal(r.rows[6].actualTeacherName,'','legacy reports do not imply the assigned teacher taught');
 const csv=reportCsv(r);for(const value of ['Why not held','Assigned teacher','Who taught','Travel','Cover','Venue closed'])assert(csv.includes(value));
});
