import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {reportDate,reportFields} from '../../dist/report-form.mjs';
import {validateReport} from '../../dist/reporting.mjs';
test('report dates show English Gregorian and Ethiopian dates together',()=>{
 assert.equal(reportDate('2026-10-22'),'22 Oct. 2026 / ጥቅምት 12 2019');
});
test('organizer form has one teacher-name field and no instructions or attendance dropdown',()=>{
 const {document}=parseHTML(reportFields({actualTeacherName:'ቀሲስ አብነት',participants:20}));
 assert.equal(document.querySelectorAll('[name="actualTeacherName"]').length,1);
 assert.equal(document.querySelector('[name="actualTeacherName"]').value,'ቀሲስ አብነት');
 for(const name of ['teacherOutcome','assignedTeacherName','teacherChangeReason'])assert.equal(document.querySelector('[name="'+name+'"]'),null);
 assert.equal(document.querySelectorAll('.notice,.muted').length,0);
 assert.match(document.textContent||document.toString(),/ያስተማረው መምህር/);
});
test('teacher name is retained even when no original assignment is known',()=>{
 const r=validateReport({organizerName:'ዮሴፍ',participants:10,teachingRating:4,teachingFeedback:'ጥሩ',teacherEntryMode:'name',actualTeacherName:'ቀሲስ አብነት'});
 assert.equal(r.actualTeacherName,'ቀሲስ አብነት');assert.equal(r.teacherOutcome,'unknown');
});
