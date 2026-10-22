import {reportFields,bindReportFields,reportDate,reportErrorAm} from './report-form.mjs';
import {validateReport} from './reporting.mjs';
const root=document.querySelector('#reportPage');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
const id=params.get('report'),token=fragment.get('token');
async function start(){
 try{
  if(!/^[A-Za-z0-9_-]+$/.test(id||'')||!/^gbr_[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('የሪፖርቱ ማገናኛ ያልተሟላ ነው። እባክዎ ከአስተባባሪው የተላከውን ሙሉ ማገናኛ ይክፈቱ።');
  const backend=new URL(fragment.get('api'));
  if(backend.protocol!=='https:'&&backend.hostname!=='localhost')throw Error('የሪፖርቱ ማገናኛ ትክክል አይደለም።');
  async function call(method,body){
   const response=await fetch(backend.origin+'/api/public/report/'+encodeURIComponent(id),{method,cache:'no-store',signal:AbortSignal.timeout(90000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   const data=await response.json();
   if(!response.ok){
    if(response.status===409)throw Error('ሪፖርቱ በሌላ አስተባባሪ ተዘምኗል። ገጹን እንደገና ይክፈቱና ለውጥዎን ያስገቡ።');
    if(response.status===401||response.status===404)throw Error('የሪፖርቱ ማገናኛ ትክክል አይደለም ወይም ጊዜው አብቅቷል። እባክዎ አዲስ ማገናኛ ይጠይቁ።');
    throw Error(reportErrorAm(data.error));
   }
   return data;
  }
  const data=await call('GET');
  root.innerHTML=`<div class="report-header"><h1>የጉባኤ ሪፖርት</h1><h2>${esc(data.meeting.topic)}</h2><p>${reportDate(data.meeting.date)} · ዱባይ</p></div>${!data.canSubmit?'<p class="notice">ሪፖርት ማስገባት ጉባኤው በሚካሄድበት ቀን ይጀምራል። እባክዎ በዚያ ቀን ይመለሱ።</p>':`<form id="publicReport" class="form-stack" lang="am" novalidate>${reportFields(data.report||{},data.meeting.assignedTeacherName||'')}<button class="primary" type="submit">${data.report?'ሪፖርቱን ያዘምኑ':'ሪፖርቱን ይላኩ'}</button><p id="reportResult" role="status" aria-live="polite"></p></form>`}`;
  const form=root.querySelector('#publicReport');if(!form)return;
  bindReportFields(form);let saving=false;
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;saving=true;
   const button=form.querySelector('button[type="submit"]'),result=root.querySelector('#reportResult');
   button.disabled=true;result.className='';result.textContent='ሪፖርቱ እየተቀመጠ ነው…';
   try{
    const input=validateReport({...Object.fromEntries(new FormData(form)),status:'held'});
    data.report=await call('PUT',{...input,revision:data.report?.revision||0});
    button.textContent='ሪፖርቱን ያዘምኑ';result.className='success';result.textContent='እናመሰግናለን። ሪፖርትዎ ተቀምጧል።';
   }catch(error){result.className='error';result.textContent=reportErrorAm(error);}
   finally{saving=false;button.disabled=false;}
  });
 }catch(error){root.innerHTML='<h1>የጉባኤ ሪፖርት</h1><p role="alert">'+esc(reportErrorAm(error))+'</p>';}
}
await start();
