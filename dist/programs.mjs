import {normalizeMeetingEdit} from './core.mjs';
export const LEGACY_PROGRAM='2026-10';
export const programOf=m=>m.programId||LEGACY_PROGRAM;
export const topicKey=s=>String(s).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function validateProgram(input){
 const month=String(input?.month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose the program’s starting month.');
 const label=String(input.label||month).trim();if(!label||label.length>100)throw Error('Enter a program label up to 100 characters.');
 if(!Array.isArray(input.meetings)||!input.meetings.length||input.meetings.length>100)throw Error('Load between 1 and 100 meetings per program.');
 const end=new Date(month+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+2);const limit=end.toISOString().slice(0,10),seen=new Set();
 const meetings=input.meetings.map((row,index)=>{try{
  if(!row||typeof row.topic!=='string'||!row.topic.trim()||typeof row.date!=='string'||typeof row.link!=='string')throw Error('Enter a topic, date and Zoom link.');const m=normalizeMeetingEdit({},row);if(m.date<month+'-01'||m.date>=limit)throw Error('Dates must fall in the starting month or the following month.');
  const key=topicKey(m.topic)+'|'+m.date;if(seen.has(key))throw Error('Duplicate topic and date in this program.');seen.add(key);
  let poster='';if(row.poster){let url;try{url=new URL(String(row.poster))}catch{throw Error('Use a full HTTPS poster image URL.')}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a full HTTPS poster image URL.');poster=url.href;}
  return{...m,poster,preview:poster,canva:'',programId:month};
 }catch(e){throw Error('Row '+(index+1)+': '+e.message)}});
 return{id:month,month,label,meetings,carryContacts:input.carryContacts===true};
}
export function parseProgramCsv(text){
 if(typeof text!=='string'||text.length>300000)throw Error('Use a CSV / text file smaller than 300 KB.');
 text=text.replace(/^\uFEFF/,'').trim();if(!text)throw Error('Choose a CSV file or paste the meeting details.');
 const first=text.split(/\r?\n/)[0],delimiter=first.includes('\t')?'\t':first.includes(';')?';':',';
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted||!value.trim())quoted=!quoted;else value+=c;}else if(c===delimiter&&!quoted){row.push(value.trim());value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw Error('Close all quoted CSV fields.');row.push(value.trim());if(row.some(Boolean))rows.push(row);
 const header=(rows.shift()||[]).map(s=>s.toLowerCase().replace(/[\s_\-]/g,''));
 const aliases={topic:['topic','mahber','name'],date:['date','meetingdate'],link:['link','joinlink','zoomlink'],startTime:['starttime','time'],durationMinutes:['durationminutes','duration'],poster:['poster','posterurl','imageurl']};
 const positions=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,header.findIndex(h=>names.includes(h))]));
 for(const key of ['topic','date','link'])if(positions[key]<0)throw Error('CSV needs topic, date and link column headers.');
 return rows.map(row=>Object.fromEntries(Object.entries(positions).filter(([,i])=>i>=0&&row[i]).map(([key,i])=>[key,row[i]])));
}
export function programTemplate(meetings=[]){const quote=s=>'"'+(/^[=+@\-\t\r]/.test(String(s))?"'":'')+String(s).replaceAll('"','""')+'"';return '\uFEFFtopic,date,startTime,durationMinutes,link,poster\r\n'+meetings.map(m=>[m.topic,'',m.startTime||'21:00',m.durationMinutes||90,'',''].map(quote).join(',')).join('\r\n');}
