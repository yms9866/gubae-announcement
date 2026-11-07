import {message,prettyDate,phoneList,waUrl} from './core.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[],kind='all',selected=null,posterUrl=null,posterBlob=null,activeKey='',generation=0,loading=null,lastLoad=0,pausedUntil=0;
const REFRESH_MS=240000,RESUME_AFTER_MS=60000,BUSY_PAUSE_MS=300000;
const labels={poster:'Poster',link:'Zoom link',report:'Report link'};
async function api(path,method='GET',body){const r=await fetch('/api'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!r.ok){let data;try{data=await r.json()}catch{}throw Object.assign(Error(data?.error||'Could not load announcements.'),{status:r.status,retryAfter:Number(r.headers?.get?.('Retry-After'))||0})}return r.status===204?null:r.json()}
function render(){
 $('#announcementTabs').hidden=false;$('#announcementTabs').innerHTML=['all','link','poster','report'].map(k=>`<button class="secondary" data-kind="${k}" aria-pressed="${kind===k}">${k==='all'?'All':labels[k]} · ${items.filter(i=>k==='all'||i.type===k).length}</button>`).join('');
 $('#announcementTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;render()});
 const visible=items.filter(i=>kind==='all'||i.type===kind);
 $('#announcementList').innerHTML=visible.map((i,index)=>`<article class="announcement-card"><div><div class="eyebrow">${labels[i.type]}</div><h2 lang="am">${esc(i.meeting.topic)}</h2><p>${prettyDate(i.meeting.date)} · Dubai</p><p>WhatsApp: ${esc(phoneList(i.meeting.recipient||'').join(' / ')||'No recipient number saved.')}</p></div><button class="primary" data-open="${index}">Prepare ${labels[i.type].toLowerCase()} ↗</button></article>`).join('')||'<div class="setup"><h2>All caught up.</h2><p>No announcements are due in this tab.</p></div>';
 $('#announcementList').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openAnnouncement(visible[Number(b.dataset.open)]));
}
function load(){if(loading)return loading;loading=(async()=>{try{const data=await api('/announcements');items=data.items;lastLoad=Date.now();pausedUntil=0;$('#accessStatus').textContent=items.length+' announcements due · '+data.email;$('#fullWorkspace').hidden=data.scope!=='full';$('#leave').hidden=false;$('#accessActions').innerHTML='';render()}catch(e){if([429,503].includes(e.status))pausedUntil=Date.now()+Math.max(BUSY_PAUSE_MS,e.retryAfter*1000);throw e}finally{loading=null}})();return loading}
function autoRefresh(minAge){if(document.hidden||$('#announcementDialog').open||Date.now()<pausedUntil||Date.now()-lastLoad<minAge)return;load().catch(e=>{$('#accessStatus').textContent=e.message;if(![429,503].includes(e.status)){$('#announcementList').innerHTML='';$('#announcementTabs').hidden=true}})}
function clearPoster(){if(posterUrl)URL.revokeObjectURL(posterUrl);posterUrl=null;posterBlob=null;}
async function openAnnouncement(item){
 const ticket=++generation;selected=item;activeKey=item.key;clearPoster();const m=item.meeting,dialog=$('#announcementDialog');$('#announcementHeading').textContent=labels[item.type];$('#announcementBody').textContent='Preparing…';dialog.showModal();
 try{
  let text='';
  if(item.type==='link')text=message(m);
  if(item.type==='report'){const report=await api('/announcements/'+m.id+'/report-link','POST',{});text=m.topic+'\n'+prettyDate(m.date)+'\n\nየጉባኤ ሪፖርት ለማስገባት፦\n'+report.url;}
  if(item.type==='poster'&&m.hasPoster){const r=await fetch('/api/announcements/'+m.id+'/poster',{cache:'no-store'});if(!r.ok)throw Error('Could not download this poster.');const blob=await r.blob();if(ticket!==generation)return;posterBlob=blob;posterUrl=URL.createObjectURL(blob)}
  if(ticket!==generation)return;
  const numbers=phoneList(m.recipient||'');
  $('#announcementBody').innerHTML=`<h2 lang="am">${esc(m.topic)}</h2>${item.type==='poster'?`<div class="field"><span>WhatsApp recipients</span>${numbers.length?numbers.map(n=>`<div class="button-row"><span dir="ltr">${esc(n)}</span><button type="button" class="secondary" data-copy-phone="${esc(n)}">Copy number</button></div>`).join(''):'<p>No recipient number saved. Ask the organizer to add it.</p>'}<p>Choose this contact in WhatsApp when sharing the poster.</p></div>`:''}${posterUrl?`<img src="${posterUrl}" alt="Original gubae poster"><div class="button-row"><button id="shareAnnouncementPoster" class="primary">Share poster</button><a class="secondary" download="gubae-${esc(m.id)}-poster.png" href="${posterUrl}">Download poster</a></div>`:item.type==='poster'?'<p>No poster is attached. Ask the organizer to add it.</p>':`<label class="field">Message<textarea id="announcementMessage">${esc(text)}</textarea></label><label class="field">WhatsApp recipient<select id="announcementPhone"><option value="">Choose a recipient</option>${numbers.map(n=>`<option value="${esc(n)}" ${numbers.length===1?'selected':''}>${esc(n)}</option>`).join('')}</select></label><div class="button-row"><button id="copyAnnouncement" class="secondary">Copy message</button><button id="sendAnnouncement" class="primary">Open WhatsApp ↗</button></div>`}<p id="announcementResult" role="status"></p><div class="button-row"><button id="confirmAnnouncement" class="primary" ${item.type==='poster'&&!posterUrl?'disabled':''}>Mark sent</button><button id="cancelAnnouncement" class="secondary">Close</button></div>`;
  const result=()=>$('#announcementResult');
  $('#announcementBody').querySelectorAll('[data-copy-phone]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copyPhone);result().textContent='Phone number copied.'}catch{result().textContent='Select and copy the phone number above.'}}));
  $('#copyAnnouncement')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#announcementMessage').value);result().textContent='Message copied.'}catch{result().textContent='Select and copy the message above.'}});
  $('#sendAnnouncement')?.addEventListener('click',()=>{try{window.open(waUrl($('#announcementPhone').value,$('#announcementMessage').value),'_blank','noopener,noreferrer')}catch(e){result().textContent=e.message}});
  $('#shareAnnouncementPoster')?.addEventListener('click',async()=>{const file=new File([posterBlob],'gubae-'+m.id+'-poster.png',{type:posterBlob.type});try{if(!navigator.canShare?.({files:[file]}))throw Error('Download the poster and attach it in WhatsApp.');await navigator.share({files:[file]})}catch(e){if(e.name!=='AbortError')result().textContent=e.message}});
  $('#confirmAnnouncement').onclick=async e=>{e.target.disabled=true;try{await api('/announcements/'+m.id+'/status/'+item.type,'PUT',{revision:m.revision,sent:true});dialog.close();clearPoster();await load()}catch(error){result().textContent=error.message+' Refresh the list before retrying.';e.target.disabled=false;}};
  $('#cancelAnnouncement').onclick=()=>{dialog.close();generation++;clearPoster()};
 }catch(error){if(ticket===generation)$('#announcementBody').textContent=error.message;}
}
$('#closeAnnouncement').onclick=()=>{$('#announcementDialog').close();generation++;clearPoster()};
$('#leave').onclick=async()=>{await api('/access/session','DELETE');await api('/browser-session','DELETE');location.replace('announcements.html')};
try{
 const token=new URLSearchParams(location.hash.slice(1)).get('access');
 if(token){const r=await fetch('/api/access/session',{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store'});history.replaceState(null,'',location.pathname);if(!r.ok)throw Error('This private link is unavailable or has been revoked. Ask the organizer for a new one.');const session=await r.json();if(session.scope==='full'){location.replace('./');}else await load();}
 else await load();
}catch(error){$('#accessStatus').textContent=error.message;$('#accessActions').innerHTML='<p>Open the private link sent to you. If your access uses a Google account, use the button below.</p><a class="secondary" href="login.html?next=%2Fannouncements.html">Google sign-in</a>';}
setInterval(()=>autoRefresh(REFRESH_MS-5000),REFRESH_MS);
document.addEventListener('visibilitychange',()=>autoRefresh(RESUME_AFTER_MS));
