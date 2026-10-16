import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTeacherImport} from '../../dist/teacher-import.mjs';

test('teacher import supports Unicode spreadsheet paste and CSV quoting without losing digits',()=>{
 const sheet=parseTeacherImport('\uFEFFName\tPhone number\r\nመምህር ፩\t+971 50 123 4567\r\nመምህር ፪\t+251 91 234 5678');
 assert.equal(sheet.ready.length,2);assert.equal(sheet.ready[0].name,'መምህር ፩');assert.equal(sheet.ready[0].phone,'+971501234567');
 const csv=parseTeacherImport('"Teacher, one",+971501234567\n"Teacher ""two""",+251912345678');
 assert.equal(csv.ready[0].name,'Teacher, one');assert.equal(csv.ready[1].name,'Teacher "two"');
 assert.equal(parseTeacherImport('phone,name\n+971501234567,Teacher').ready[0].name,'Teacher');
});
test('teacher import skips existing and repeated rows and flags conflicting contacts',()=>{
 const result=parseTeacherImport('name,phone\nFirst,+971 50 123 4567\nSecond,+251912345678\nSecond,+251912345678\nFirst,+971509876543',[{name:'first',phone:'+971501234567'}]);
 assert.equal(result.ready.length,1);assert.equal(result.duplicates.length,2);assert.equal(result.errors[0].status,'conflict');
});
test('teacher import rejects malformed numbers, missing fields, oversized batches and broken CSV',()=>{
 const result=parseTeacherImport('name,phone\nMissing,\n,+971501234567\nShort,+97150719057\nLocal,0501234567');
 assert.equal(result.ready.length,0);assert.equal(result.errors.length,4);
 assert.throws(()=>parseTeacherImport('name,phone\n"Unclosed,+971501234567'),/quotation/);
 assert.throws(()=>parseTeacherImport('name,email\nFirst,example'),/phone column/);
 assert.throws(()=>parseTeacherImport(Array.from({length:101},(_,i)=>'Teacher '+i+',+971501234567').join('\n')),/100/);
});
