import {teacherDays} from './teacher-days.mjs';
import {prettyDate,timeRange,phoneList,phoneDigits} from './core.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=document.querySelector('#teacherDays'),status=document.querySelector('#dayStatus'),button=document.querySelector('#refreshDays');
let snapshot=null,busy=false;
function draw(){
 if(!snapshot)return;
 const groups=teacherDays(snapshot.meetings,snapshot.teachers,snapshot.reports||[]);
 root.innerHTML=groups.length?groups.map(group=>`<section class="day-group"><h2>Teachers for ${esc(group.weekday)}</h2><p class="day-date">${prettyDate(group.date)} · ${group.meetings.length} gubae(s)</p>${group.meetings.map(({meeting:m,teacher:t})=>`<article class="day-assignment"><h3 lang="am">${esc(m.topic)}</h3><p class="day-teacher" lang="am">${esc(t?.name||m.scheduledTeacherName||'Teacher not assigned')}${!t&&m.scheduledTeacherName?' · contact assignment pending':''}</p><p>${timeRange(m)} · Dubai</p>${t?.phone?phoneList(t.phone).map(p=>phoneDigits(p)?`<a class="day-phone" href="tel:+${phoneDigits(p)}">${esc(p)}</a>`:'').join(''): '<p class="muted">No saved teacher phone number.</p>'}</article>`).join('')}</section>`).join(''):'<div class="day-empty">No teachers are due to appear yet. Gubaes appear here two days before their date; completed, missed, cancelled and postponed gubaes are excluded.</div>';
}
async function refresh(){
 if(busy)return;busy=true;button.disabled=true;status.className='';status.textContent=snapshot?'Refreshing the shared schedule…':'Loading the shared schedule…';
 try{
  const configResponse=await fetch('./cloud-config.json',{cache:'no-store'});if(!configResponse.ok)throw Error('Connection settings could not load.');
  const config=await configResponse.json(),api=new URL(config.apiBase);
  if(api.protocol!=='https:')throw Error('The backend address must use HTTPS.');
  const response=await fetch(api.origin+'/api/state',{cache:'no-store',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('The shared schedule could not load. Please retry.');
  const data=await response.json();if(!Array.isArray(data.meetings)||!Array.isArray(data.teachers))throw Error('The schedule response was incomplete.');
  snapshot=data;draw();status.textContent='Shared schedule updated · Dubai time';
 }catch(e){status.className='error';status.textContent=(snapshot?'Showing the last loaded schedule. ':'')+(e.message||'Could not connect. Please retry.');}
 finally{busy=false;button.disabled=false;}
}
button.onclick=refresh;
setInterval(()=>{draw();if(!document.hidden)refresh()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){draw();refresh()}});
await refresh();
