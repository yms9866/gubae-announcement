const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,name,value='',type='text',required=false)=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`;
const area=(label,name,value='',required=false)=>`<label class="field">${label}<textarea name="${name}" rows="3" maxlength="6000" ${required?'required':''}>${esc(value)}</textarea></label>`;

const reportDate=iso=>new Intl.DateTimeFormat('am-ET-u-ca-gregory',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}).format(new Date(iso+'T12:00:00Z'));
const reportStatusAm=value=>({held:'ተካሂዷል',missed:'አልተካሄደም',cancelled:'ተሰርዟል',postponed:'ተራዝሟል'}[value]||'አልተመዘገበም');
function reportErrorAm(error){
 const value=String(error?.message||error||'');
 if(/[\u1200-\u137f]/.test(value))return value;
 const exact={
 'Enter a participant count from 0 to 100000.':'ከ0 እስከ 100000 ያለ ሙሉ ቁጥር ለተሳታፊዎች ብዛት ያስገቡ።',
 'Choose who taught the gubae.':'ጉባኤውን ማን እንዳስተማረ ይምረጡ።',
 'The replacement must be a different teacher.':'ተተኪው መምህር ከተመደበው መምህር የተለየ መሆን አለበት።',
 'Rate the teaching from 1 to 5.':'ለትምህርቱ ከ1 እስከ 5 ያለ ደረጃ ይስጡ።'
 };
 if(exact[value])return exact[value];
 const fields={'Organizer name':'የሪፖርት አቅራቢው ስም','Assigned teacher name':'የተመደበው መምህር ስም','Replacement teacher name':'የተተኪው መምህር ስም','Reason assigned teacher did not teach':'መምህሩ ያላስተማረበት ምክንያት','Teaching feedback':'ስለ ትምህርቱ አስተያየት','Comments':'አስተያየት'};
 for(const [key,label]of Object.entries(fields))if(value.startsWith(key+':')){const max=value.match(/(\d+) characters/);return label+'፦ '+(value.includes('enter text')?'እባክዎ ይሙሉ። ':'')+(max?'እስከ '+max[1]+' ፊደላት ብቻ ያስገቡ።':'ያስተካክሉ።');}
 return 'ሪፖርቱን መጫን ወይም ማስቀመጥ አልተቻለም። ግንኙነትዎን ያረጋግጡና እንደገና ይሞክሩ። ማገናኛው ጊዜው ያበቃ ከሆነ አዲስ ማገናኛ ይጠይቁ።';
}

const teacherOutcomeLabel=value=>({assigned:'የተመደበው መምህር አስተምሯል',replacement:'ተተኪ መምህር አስተምሯል',not_taught:'የተመደበው መምህር አላስተማረም፤ ተተኪም አልነበረም',unknown:'አልተመዘገበም / አይታወቅም'}[value||'unknown']||'አልተመዘገበም / አይታወቅም');
function reportFields(r={},assignedName=''){return `<div lang="am" class="amharic-report">${field('የሪፖርት አቅራቢው ስም','organizerName',r.organizerName||'','text',true)}<p class="notice">ይህን ሪፖርት ሲያስገቡ ጉባኤው እንደተካሄደ ይመዘገባል።</p><h3>ማን አስተማረ?</h3><label class="field">የመምህሩ ተሳትፎ<select name="teacherOutcome">${['unknown','assigned','replacement','not_taught'].map(value=>`<option value="${value}" ${(r.teacherOutcome||'unknown')===value?'selected':''}>${teacherOutcomeLabel(value)}</option>`).join('')}</select></label>${field('የተመደበው መምህር ስም','assignedTeacherName',r.assignedTeacherName||assignedName)}<div data-replacement-fields>${field('የተተኪው መምህር ስም','actualTeacherName',r.actualTeacherName||'')}</div><div data-teacher-reason>${area('የተመደበው መምህር ለምን አላስተማረም?','teacherChangeReason',r.teacherChangeReason||'')}</div><p class="muted">የመምህራን ስም በሪፖርቱ ብቻ ይካተታል፤ በማስታወቂያ መልእክቶች አይካተትም። የመምህሩ ተሳትፎ ካልተረጋገጠ «አይታወቅም» ይምረጡ።</p><div data-held-fields><div class="editor-grid">${field('የተሳታፊዎች ብዛት','participants',r.participants??'','number')}<label class="field">የትምህርቱ ግምገማ<select name="teachingRating"><option value="">ከ1 እስከ 5 ይምረጡ</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${r.teachingRating===n?'selected':''}>${n} · ${['መሻሻል ያስፈልገዋል','መካከለኛ','ጥሩ','በጣም ጥሩ','እጅግ በጣም ጥሩ'][n-1]}</option>`).join('')}</select></label></div>${area('ትምህርቱ እንዴት ነበር?','teachingFeedback',r.teachingFeedback||'')}</div>${area('አስተያየት / ክትትል የሚያስፈልገው ጉዳይ','comments',r.comments||'')}<p class="muted">የተሳታፊዎችን ብዛት እና ስለ ትምህርቱ አስተያየት ያስገቡ። ያልተካሄዱ፣ የተሰረዙ ወይም የተራዘሙ ጉባኤዎችን ሁኔታ በ«All meetings» ገጽ ላይ ይመዝግቡ።</p></div>`}
function bindReportFields(form){
 const named=name=>form.querySelector(`[name="${name}"]`);const update=()=>{const held=true;const outcome=named('teacherOutcome');for(const value of ['assigned','replacement'])outcome.querySelector(`option[value="${value}"]`).disabled=!held;if(!held&&['assigned','replacement'].includes(outcome.value))outcome.value='unknown';const replacement=outcome.value==='replacement',absent=replacement||outcome.value==='not_taught';
  for(const [selector,visible] of [['[data-held-fields]',held],['[data-replacement-fields]',replacement],['[data-teacher-reason]',absent]]){const group=form.querySelector(selector);group.hidden=!visible;for(const input of group.querySelectorAll('input,textarea,select'))input.disabled=!visible;}
  named('participants').required=held;named('participants').min='0';named('participants').max='100000';named('participants').step='1';named('assignedTeacherName').required=outcome.value!=='unknown';named('actualTeacherName').required=replacement;named('teacherChangeReason').required=absent;named('teachingRating').required=held&&outcome.value!=='not_taught';named('teachingFeedback').required=held&&outcome.value!=='not_taught';named('teachingRating').disabled=!held||outcome.value==='not_taught';
 };named('teacherOutcome').addEventListener('change',update);update();
}

export function reportPageUrl(value){
 const url=new URL(value);
 url.pathname=url.pathname.replace(/[^/]*$/,'report.html');
 return url.href;
}
export {reportDate,reportStatusAm,reportErrorAm,teacherOutcomeLabel,reportFields,bindReportFields};
