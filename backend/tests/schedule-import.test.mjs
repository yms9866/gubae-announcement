import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgramCsv,validateProgram} from '../../dist/programs.mjs';
import {matchTeacher} from '../../dist/teacher-match.mjs';
import {message,applyMeetingEdits} from '../../dist/core.mjs';
test('Amharic markdown schedules and spreadsheet columns parse dates and private teacher names',()=>{
 const input='| ማኅበራት | የጉባኤ ቀን | መምህር |\n| --- | --- | --- |\n| ማኅበር ፩ | ኀሙስ ጥቅምት 5 - Oct. 15 | ቀሲስ ሙከራ |\n| ማኅበር ፪ | ዓርብ ጥቅምት 6 - Oct 16 | ዲ/ን ዶ/ር ሙከራ |';
 const p=validateProgram({month:'2026-10',meetings:parseProgramCsv(input)});assert.equal(p.meetings.length,2);assert.equal(p.meetings[0].date,'2026-10-15');assert.equal(p.meetings[1].date,'2026-10-16');assert.equal(p.meetings[0].scheduledTeacherName,'ቀሲስ ሙከራ');assert.equal(p.meetings[0].linkPending,true);
 assert.equal(applyMeetingEdits(p.meetings)[0].link,'');assert.throws(()=>message(p.meetings[0]),/Zoom link/);
 assert(!message({...p.meetings[0],link:'https://rit.zoom.us/j/98378810255'}).includes('ቀሲስ ሙከራ'));
 const tsv='ማኅበራት\tየጉባኤ ቀን\tመምህር\nማኅበር\tJan. 4\tመምህር ሙከራ';assert.equal(validateProgram({month:'2026-12',meetings:parseProgramCsv(tsv)}).meetings[0].date,'2027-01-04');
 assert.throws(()=>validateProgram({month:'2026-10',meetings:[{topic:'Mahber',date:'Oct 32'}]}),/valid meeting date/);
});
test('teacher matching expands titles but refuses ambiguous, partial or archived names',()=>{
 const teachers=[{id:'a',name:'ዲያቆን ዶክተር ሙከራ'},{id:'b',name:'ቀሲስ ሌላ'},{id:'c',name:'Archived',archived:true}];
 assert.equal(matchTeacher(' ዲ/ን   ዶ/ር ሙከራ ',teachers).teacherId,'a');assert.equal(matchTeacher('ሙከራ',teachers).teacherId,'a');assert.equal(matchTeacher('ሌላ',teachers).teacherId,'b');
 assert.equal(matchTeacher('Archived',teachers).status,'missing');assert.equal(matchTeacher('ሙከ',teachers).status,'missing');
 assert.equal(matchTeacher('ሙከራ',[...teachers,{id:'d',name:'ቀሲስ ሙከራ'}]).status,'ambiguous');assert.equal(matchTeacher('ቀሲስ ሙከራ',[...teachers,{id:'d',name:'ቀሲስ ሙከራ'}]).teacherId,'d');
});
