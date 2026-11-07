import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {DEFAULT_TIMING,normalizeTiming,announcementDeadline} from '../../dist/announcement-timing.mjs';
import {dueAnnouncements} from '../../dist/announcements-due.mjs';
import {reportFields,bindReportFields} from '../../dist/report-form.mjs';
import {validateReport} from '../../dist/reporting.mjs';
const m={id:'x',date:'2026-10-22',startTime:'21:00',durationMinutes:90};
test('report defaults to twelve precise hours before start in Dubai',()=>{
 assert.equal(announcementDeadline(m,'report'),'2026-10-22T05:00:00.000Z');
 assert(!dueAnnouncements([m],[],new Date('2026-10-22T08:59:59+04:00')).some(t=>t.type==='report'));
 assert(dueAnnouncements([m],[],new Date('2026-10-22T09:00:00+04:00')).some(t=>t.type==='report'));
 const timing=normalizeTiming({...DEFAULT_TIMING,report:{amount:2,unit:'days'}});
 assert.equal(announcementDeadline(m,'report',timing),'2026-10-19T20:00:00.000Z');
 assert.throws(()=>normalizeTiming({report:{amount:1.5,unit:'days'}}));
 assert.throws(()=>normalizeTiming({report:{amount:1,unit:'minutes'}}));
 assert(!dueAnnouncements([m],[],new Date('2026-10-22T09:00:00+04:00'),{'x:report':'sent'}).some(t=>t.type==='report'));
});
test('simplified report has comments only and a full-width rating without teaching feedback',()=>{
 const {document}=parseHTML('<form>'+reportFields()+'</form>');const form=document.querySelector('form');bindReportFields(form);
 assert.equal(form.querySelector('[name="teachingFeedback"]'),null);
 assert.equal(form.querySelector('.editor-grid'),null);
 assert.equal(form.querySelector('[name="comments"]').parentElement.textContent,'አስተያየት');
 const result=validateReport({organizerName:'ዮሴፍ',actualTeacherName:'መምህር',teacherEntryMode:'name',participants:10,teachingRating:5,comments:'አስተያየት'});
 assert.equal(result.teachingFeedback,'');assert.equal(result.comments,'አስተያየት');
});
