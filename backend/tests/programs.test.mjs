import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProgram,parseProgramCsv,programTemplate} from '../../dist/programs.mjs';
const row={topic:'ማኅበር',date:'2026-12-20',link:'https://rit.zoom.us/j/98378810255'};
test('monthly CSV supports quoted topics, spreadsheet columns, defaults and programs crossing year boundaries',()=>{
 const rows=parseProgramCsv('topic,date,link\r\n"Mahber, one",2026-12-20,https://rit.zoom.us/j/98378810255');
 const p=validateProgram({month:'2026-12',label:'ታኅሣሥ',meetings:[rows[0],{...row,date:'2027-01-05'}]});
 assert.equal(p.meetings[0].topic,'Mahber, one');assert.equal(p.meetings[1].date,'2027-01-05');assert.equal(p.meetings[0].startTime,'21:00');assert.equal(p.meetings[0].durationMinutes,90);assert.equal(p.meetings[0].poster,'');
 assert.equal(parseProgramCsv('topic\tdate\tlink\nማኅበር\t2026-12-20\thttps://rit.zoom.us/j/98378810255').length,1);
 const template=programTemplate([row]);assert(template.includes('ማኅበር'));assert(!template.includes(row.date));assert(!template.includes(row.link),'templates do not silently reuse last month’s links');
});
test('monthly program validation rejects missing details, duplicate meetings, unsafe posters and dates in a different program',()=>{
 for(const meetings of [[{...row,topic:undefined}],[row,row],[{...row,poster:'javascript:alert(1)'}],[{...row,date:'2027-02-01'}]])assert.throws(()=>validateProgram({month:'2026-12',meetings}),/Row/);
 assert.equal(validateProgram({month:'2026-12',meetings:parseProgramCsv('topic,date\nName,2026-12-20')}).meetings[0].linkPending,true);
 assert.throws(()=>validateProgram({month:'2026-13',meetings:[row]}),/month/);
});
