import {normalizeMeetingEdit} from './core.mjs';
export const LEGACY_PROGRAM='2026-10';
export const programOf=m=>m.programId||LEGACY_PROGRAM;
export const topicKey=s=>String(s).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function programDate(value,month){
 const raw=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
 const match=raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i);
 if(!match)throw Error('Include a Gregorian date, such as Oct. 15 or YYYY-MM-DD.');
 const n=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].slice(0,3).toLowerCase())+1;
 const year=match[3]?Number(match[3]):Number(month.slice(0,4))+(n<Number(month.slice(5,7))?1:0);
 return String(year).padStart(4,'0')+'-'+String(n).padStart(2,'0')+'-'+match[2].padStart(2,'0');
}
export function validateProgram(input){
 const month=String(input?.month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose the program’s starting month.');
 const label=String(input.label||month).trim();if(!label||label.length>100)throw Error('Enter a program label up to 100 characters.');
 if(!Array.isArray(input.meetings)||!input.meetings.length||input.meetings.length>100)throw Error('Load between 1 and 100 meetings per program.');
 const end=new Date(month+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+2);const limit=end.toISOString().slice(0,10),seen=new Set();
 const meetings=input.meetings.map((row,index)=>{try{
  if(!row||typeof row.topic!=='string'||!row.topic.trim()||typeof row.date!=='string')throw Error('Enter a topic and meeting date.');if(row.link!=null&&typeof row.link!=='string')throw Error('Zoom link must be text.');const m=normalizeMeetingEdit({linkPending:true},{...row,date:programDate(row.date,month),link:row.link||''});if(m.date<month+'-01'||m.date>=limit)throw Error('Dates must fall in the starting month or the following month.');
  const key=topicKey(m.topic)+'|'+m.date;if(seen.has(key))throw Error('Duplicate topic and date in this program.');seen.add(key);
  let poster='';if(row.poster){let url;try{url=new URL(String(row.poster))}catch{throw Error('Use a full HTTPS poster image URL.')}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a full HTTPS poster image URL.');poster=url.href;}
  const scheduledTeacherName=String(row.scheduledTeacherName||'').trim();if(scheduledTeacherName.length>120)throw Error('Teacher name must be up to 120 characters.');return{...m,scheduledTeacherName,poster,preview:poster,canva:'',programId:month};
 }catch(e){throw Error('Row '+(index+1)+': '+e.message)}});
 return{id:month,month,label,meetings,carryContacts:input.carryContacts===true};
}
export function parseProgramCsv(text){
 if(typeof text!=='string'||text.length>300000)throw Error('Use a CSV / text file smaller than 300 KB.');
 text=text.replace(/^\uFEFF/,'').trim();if(!text)throw Error('Choose a CSV file or paste the meeting details.');
 const first=text.split(/\r?\n/)[0],delimiter=first.includes('\t')?'\t':first.includes('|')?'|':first.includes(';')?';':',';
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted||!value.trim())quoted=!quoted;else value+=c;}else if(c===delimiter&&!quoted){row.push(value.trim());value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw Error('Close all quoted CSV fields.');row.push(value.trim());if(row.some(Boolean))rows.push(row);
 if(delimiter==='|')for(const r of rows){if(!r[0])r.shift();if(!r.at(-1))r.pop();}const cleaned=rows.filter(r=>!r.every(v=>/^:?-+:?$/.test(v)));const header=(cleaned.shift()||[]).map(s=>s.toLowerCase().replace(/[\s_\-]/g,''));
 const aliases={topic:['topic','mahber','name','ማኅበራት','ማህበራት'],date:['date','meetingdate','የጉባኤቀን'],link:['link','joinlink','zoomlink'],startTime:['starttime','time'],durationMinutes:['durationminutes','duration'],poster:['poster','posterurl','imageurl'],scheduledTeacherName:['teacher','teachername','መምህር']};
 const positions=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,header.findIndex(h=>names.includes(h))]));
 for(const key of ['topic','date'])if(positions[key]<0)throw Error('Use ማኅበራት, የጉባኤ ቀን, መምህር headers, or topic and date.');
 return cleaned.map(row=>Object.fromEntries(Object.entries(positions).filter(([,i])=>i>=0&&row[i]).map(([key,i])=>[key,row[i]])));
}
export function programTemplate(meetings=[]){const quote=s=>'"'+(/^[=+@\-\t\r]/.test(String(s))?"'":'')+String(s).replaceAll('"','""')+'"';return '\uFEFFtopic,date,teacher,startTime,durationMinutes,link,poster\r\n'+meetings.map(m=>[m.topic,'','',m.startTime||'21:00',m.durationMinutes||90,'',''].map(quote).join(',')).join('\r\n');}
