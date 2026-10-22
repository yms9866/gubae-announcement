import {teacherDays} from './teacher-days.mjs';
import {prettyDate,timeRange,phoneList,phoneDigits,message,waUrl} from './core.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=document.querySelector('#teacherDays'),status=document.querySelector('#dayStatus'),button=document.querySelector('#refreshDays');
let snapshot=null,busy=false,saving=false,limited=false,teacherTab='unsent';
const composer=document.querySelector('#teacherComposer'),form=document.querySelector('#teacherMessageForm'),text=document.querySelector('#teacherMessage'),phone=document.querySelector('#teacherPhone'),composeError=document.querySelector('#composeError');
let composing=null;
function updateSend(){document.querySelector('#openTeacherWhatsApp').disabled=!text.value.trim()||!phoneDigits(phone.value);}
function openComposer(id,kind){
 const m=snapshot?.meetings.find(m=>m.id===id),t=snapshot?.teachers.find(t=>t.id===m?.teacherId);
 const numbers=t?.phone?phoneList(t.phone).filter(phoneDigits):[];if(!m||!t||!numbers.length)return;
 composing=m;document.querySelector('#composerTeacher').textContent=t.name;document.querySelector('#composerMeeting').textContent=m.topic+' · '+prettyDate(m.date);
 phone.innerHTML=numbers.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
 text.value=kind==='link'&&m.link?message(m):'';composeError.textContent='';document.querySelector('#insertTeacherLink').disabled=!m.link;updateSend();composer.showModal();text.focus();
}
document.querySelector('#closeTeacherComposer').onclick=()=>composer.close();
text.oninput=updateSend;phone.onchange=updateSend;
document.querySelector('#insertTeacherLink').onclick=()=>{if(!composing?.link)return;try{text.value=(text.value.trim()?text.value.trim()+'\n\n':'')+message(composing);updateSend()}catch(e){composeError.textContent=e.message}};
form.onsubmit=e=>{e.preventDefault();composeError.textContent='';try{if(!text.value.trim())throw Error('Write a message first.');const target=waUrl(phone.value,text.value.trim());window.open(target,'_blank','noopener,noreferrer');document.querySelector('#composeResult').textContent='Message prepared. Press Send inside WhatsApp.';}catch(e){composeError.textContent=e.message}};
composer.addEventListener('close',()=>{composing=null;document.querySelector('#composeResult').textContent=''});
async function toggleTeacherSent(id,control){
 const meeting=snapshot?.meetings.find(m=>m.id===id);if(!meeting||saving||busy)return;
 const sent=!meeting.sent?.teacher;saving=true;control.disabled=true;button.disabled=true;
 try{
  const response=await fetch(limited?'/api/teachers-day/'+encodeURIComponent(id)+'/sent':'/api/meetings/'+encodeURIComponent(id)+'/status/teacher',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:meeting.revision,sent}),cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Error(response.status===409?'This gubae changed on another device. Refresh before trying again.':result.error||'Could not save the teacher invitation status.');
  snapshot.meetings=snapshot.meetings.map(m=>m.id===id?{...m,...result,sent:{...m.sent,...result.sent}}:m);draw();status.className='';status.textContent=sent?'Teacher invitation marked sent · synced':'Teacher invitation marked pending · synced';
 }catch(error){status.className='error';status.textContent=error.message;control.disabled=false;}
 finally{saving=false;button.disabled=false;}
}
function draw(){
 if(!snapshot)return;
 const allGroups=teacherDays(snapshot.meetings,snapshot.teachers,snapshot.reports||[]);
 const rows=allGroups.flatMap(g=>g.meetings);for(const tab of document.querySelectorAll('[data-teacher-tab]')){const active=tab.dataset.teacherTab===teacherTab;tab.setAttribute('aria-selected',String(active));tab.className=active?'primary':'secondary';tab.textContent=(tab.dataset.teacherTab==='sent'?'Sent':'Unsent')+' · '+rows.filter(r=>!!r.meeting.sent?.teacher===(tab.dataset.teacherTab==='sent')).length;}
 const groups=allGroups.map(g=>({...g,meetings:g.meetings.filter(r=>!!r.meeting.sent?.teacher===(teacherTab==='sent'))})).filter(g=>g.meetings.length);
 root.innerHTML=groups.length?groups.map(group=>`<section class="day-group"><h2>Teachers for ${esc(group.weekday)}</h2><p class="day-date">${prettyDate(group.date)} · ${group.meetings.length} gubae(s)</p>${group.meetings.map(({meeting:m,teacher:t})=>`<article class="day-assignment"><h3 lang="am">${esc(m.topic)}</h3><p class="day-teacher" lang="am">${esc(t?.name||m.scheduledTeacherName||'Teacher not assigned')}${!t&&m.scheduledTeacherName?' · contact assignment pending':''}</p><p>${timeRange(m)} · Dubai</p>${t?.phone?phoneList(t.phone).map(p=>phoneDigits(p)?`<a class="day-phone" href="tel:+${phoneDigits(p)}">${esc(p)}</a>`:'').join(''): '<p class="muted">No saved teacher phone number.</p>'}${t&&phoneList(t.phone||'').some(phoneDigits)?`<div class="button-row teacher-send-actions"><button class="primary" data-teacher-compose="${esc(m.id)}" data-kind="link" ${!m.link?'disabled':''}>Send Zoom link ↗</button><button class="secondary" data-teacher-compose="${esc(m.id)}" data-kind="custom">Custom message</button></div>${!m.link?'<p class="muted">Add the Zoom link in All meetings to send an invitation.</p>':''}`:'<p class="muted">Assign a teacher with a valid phone number in the workspace to send messages.</p>'}${t?`<div class="button-row teacher-send-actions"><button class="secondary" data-teacher-sent="${esc(m.id)}" ${!m.link&&!m.sent?.teacher?'disabled':''}>${m.sent?.teacher?'✓ Sent · undo':'Mark sent'}</button><span class="muted">${m.sent?.teacher?'Teacher invitation sent.':'Mark sent after sending in WhatsApp.'}</span></div>`:''}</article>`).join('')}</section>`).join(''):`<div class="day-empty">${teacherTab==='sent'?'No teacher invitations have been marked sent in this window.':'No unsent teacher invitations in this window. Gubaes appear two days before their date and stay until they end.'}</div>`;
 root.querySelectorAll('[data-teacher-sent]').forEach(b=>b.onclick=()=>toggleTeacherSent(b.dataset.teacherSent,b));
 root.querySelectorAll('[data-teacher-compose]').forEach(b=>b.onclick=()=>openComposer(b.dataset.teacherCompose,b.dataset.kind));
}
async function refresh(){
 if(busy||saving)return;busy=true;button.disabled=true;status.className='';status.textContent=snapshot?'Refreshing the shared schedule…':'Loading the shared schedule…';
 try{
  const configResponse=await fetch('./cloud-config.json',{cache:'no-store'});if(!configResponse.ok)throw Error('Connection settings could not load.');
  const config=await configResponse.json(),api=new URL(config.apiBase);
  if(api.protocol!=='https:')throw Error('The backend address must use HTTPS.');
  let response=await fetch('/api/teachers-day',{cache:'no-store',signal:AbortSignal.timeout(90000)});limited=response.ok;if(!response.ok)response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(90000)});
  if(!response.ok){if([401,403].includes(response.status)){snapshot=null;root.innerHTML='';}throw Error('Open your private teacher reminder link, or sign in with an authorized account.');}
  const data=await response.json();if(!Array.isArray(data.meetings)||!Array.isArray(data.teachers))throw Error('The schedule response was incomplete.');
  snapshot=data;const workspaceLink=document.querySelector('.day-top a');if(workspaceLink)workspaceLink.hidden=limited;draw();status.textContent='Shared schedule updated · Dubai time';
 }catch(e){status.className='error';status.textContent=(snapshot?'Showing the last loaded schedule. ':'')+(e.message||'Could not connect. Please retry.');}
 finally{busy=false;button.disabled=false;}
}
document.querySelectorAll('[data-teacher-tab]').forEach(tab=>tab.onclick=()=>{if(saving)return;teacherTab=tab.dataset.teacherTab;draw()});
button.onclick=refresh;
setInterval(()=>{if(saving)return;draw();if(!document.hidden)refresh()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){draw();refresh()}});
const teacherToken=new URLSearchParams(location.hash?.slice(1)||'').get('teacherAccess');
if(teacherToken){const response=await fetch('/api/teachers-day/session',{method:'POST',headers:{Authorization:'Bearer '+teacherToken},cache:'no-store'});history.replaceState(null,'',location.pathname);if(!response.ok){status.className='error';status.textContent='This teacher reminder link is unavailable. Ask the organizer for a new link.';}else await refresh();}else await refresh();
