import {validateReport} from './reporting.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,name,value='',type='text',required=false)=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`;
const area=(label,name,value='',required=false)=>`<label class="field">${label}<textarea name="${name}" rows="3" maxlength="6000" ${required?'required':''}>${esc(value)}</textarea></label>`;

const reportDate=iso=>{
 const date=new Date(iso+'T12:00:00Z');
 const english=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).formatToParts(date);
 const ethiopian=new Intl.DateTimeFormat('am-ET-u-ca-ethiopic',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).formatToParts(date);
 const part=(list,key)=>list.find(p=>p.type===key)?.value||'';
 return part(english,'day')+' '+part(english,'month')+'. '+part(english,'year')+' / '+part(ethiopian,'month')+' '+part(ethiopian,'day')+' '+part(ethiopian,'year');
};
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
 const fields={'Teacher who taught':'ያስተማረው መምህር','Organizer name':'የሪፖርት አቅራቢው ስም','Assigned teacher name':'የተመደበው መምህር ስም','Replacement teacher name':'የተተኪው መምህር ስም','Reason assigned teacher did not teach':'መምህሩ ያላስተማረበት ምክንያት','Teaching feedback':'ስለ ትምህርቱ አስተያየት','Comments':'አስተያየት'};
 for(const [key,label]of Object.entries(fields))if(value.startsWith(key+':')){const max=value.match(/(\d+) characters/);return label+'፦ '+(value.includes('enter text')?'እባክዎ ይሙሉ። ':'')+(max?'እስከ '+max[1]+' ፊደላት ብቻ ያስገቡ።':'ያስተካክሉ።');}
 return 'ሪፖርቱን መጫን ወይም ማስቀመጥ አልተቻለም። ግንኙነትዎን ያረጋግጡና እንደገና ይሞክሩ። ማገናኛው ጊዜው ያበቃ ከሆነ አዲስ ማገናኛ ይጠይቁ።';
}

const teacherOutcomeLabel=value=>({assigned:'የተመደበው መምህር አስተምሯል',replacement:'ተተኪ መምህር አስተምሯል',not_taught:'የተመደበው መምህር አላስተማረም፤ ተተኪም አልነበረም',unknown:'አልተመዘገበም / አይታወቅም'}[value||'unknown']||'አልተመዘገበም / አይታወቅም');
function reportFields(r={}){
 const actual=r.actualTeacherName||(r.teacherOutcome==='assigned'?r.assignedTeacherName:'')||'';
 return `<div lang="am" class="amharic-report">${field('የሪፖርት አቅራቢው ስም','organizerName',r.organizerName||'','text',true)}${field('ያስተማረው መምህር','actualTeacherName',actual,'text',true)}${field('የተሳታፊዎች ብዛት','participants',r.participants??'','number')}<label class="field">የትምህርቱ ግምገማ<select name="teachingRating"><option value="">ከ1 እስከ 5 ይምረጡ</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${r.teachingRating===n?'selected':''}>${n} · ${['መሻሻል ያስፈልገዋል','መካከለኛ','ጥሩ','በጣም ጥሩ','እጅግ በጣም ጥሩ'][n-1]}</option>`).join('')}</select></label>${area('አስተያየት','comments',r.comments||'')}</div>`;
}
function bindReportFields(form){
 const input=name=>form.querySelector(`[name="${name}"]`);
 input('participants').required=true;input('participants').min='0';input('participants').max='100000';input('participants').step='1';
 input('actualTeacherName').maxLength=120;input('actualTeacherName').required=true;
 input('teachingRating').required=true;
}
export function readReport(form,assignedName='',previous={}){
 const values=Object.fromEntries(new FormData(form));
 const sameTeacher=String(values.actualTeacherName||'').normalize('NFKC').trim()===String(previous.actualTeacherName||'').normalize('NFKC').trim();
 return {...validateReport({...values,teachingFeedback:previous.teachingFeedback||'',status:'held',teacherEntryMode:'name',assignedTeacherName:assignedName,teacherChangeReason:sameTeacher?previous.teacherChangeReason||'':''}),teacherEntryMode:'name'};
}

export function reportPageUrl(value){
 const url=new URL(value);
 url.pathname=url.pathname.replace(/[^/]*$/,'report.html');
 return url.href;
}
export {reportDate,reportStatusAm,reportErrorAm,teacherOutcomeLabel,reportFields,bindReportFields};
