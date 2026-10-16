import {phoneList,phoneDigits} from './core.mjs';

// Excel/Sheets paste (tabs), CSV with quoted fields, and simple pipe tables.
export function parseTeacherImport(text,existing=[]){
 if(typeof text!=='string'||text.length>200000)throw Error('Use a text file smaller than 200 KB.');
 text=text.replace(/^\uFEFF/,'').trim();
 if(!text)throw Error('Paste teacher names and phone numbers, or choose a CSV file.');
 const first=text.split(/\r?\n/)[0];
 const delimiter=['\t',',',';','|'].find(d=>first.includes(d));
 if(!delimiter)throw Error('Use two columns: name and phone. Separate them with a comma or paste both columns from a spreadsheet.');
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted||!value.trim())quoted=!quoted;else value+=c;}
  else if(c===delimiter&&!quoted){row.push(value.trim());value='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';}
  else value+=c;
 }
 if(quoted)throw Error('A quoted field is missing its closing quotation mark.');
 row.push(value.trim());if(row.some(Boolean))rows.push(row);
 if(delimiter==='|')for(const r of rows){if(!r[0])r.shift();if(!r.at(-1))r.pop();}
 const header=s=>s.toLowerCase().replace(/[\s_\-()]/g,'');
 const names=['name','teacher','teachername','fullname','ስም','የመምህርስም'],phones=['phone','phonenumber','whatsapp','whatsappnumber','mobile','mobilenumber','telephone','ስልክ','ስልክቁጥር'];
 let ni=0,pi=1;
 if(rows[0]?.some(s=>names.includes(header(s)))){
  const headings=rows.shift().map(header);ni=headings.findIndex(s=>names.includes(s));pi=headings.findIndex(s=>phones.includes(s));
  if(pi<0)throw Error('Add a phone column beside the name column.');
 }
 const data=rows.filter(r=>!r.every(v=>/^:?-+:?$/.test(v)));
 if(data.length>100)throw Error('Import up to 100 teachers at a time.');
 const nameKey=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 const phoneKey=s=>phoneList(s).map(phoneDigits).sort().join('/');
 const known=new Map(existing.map(t=>[nameKey(t.name),phoneKey(t.phone)]));
 const result=data.map((r,index)=>{
  const name=(r[ni]||'').trim(),rawPhone=(r[pi]||'').trim();
  const digits=phoneList(rawPhone).map(phoneDigits);
  let status='ready',reason='Ready to import';
  if(!name||name.length>120){status='invalid';reason='Enter a name (up to 120 characters).';}
  else if(!digits.length||digits.some(d=>!d)||rawPhone.length>100){status='invalid';reason='Use an international phone number including country code.';}
  const phone=digits.length&&digits.every(Boolean)?digits.map(d=>'+'+d).join(' / '):rawPhone;
  if(status==='ready'){
   const key=nameKey(name),prior=known.get(key);
   if(prior!==undefined){status=prior===phoneKey(phone)?'duplicate':'conflict';reason=status==='duplicate'?'Already included — skipped.':'Same name has a different number. Edit the existing contact or change this row.';}
   else known.set(key,phoneKey(phone));
  }
  return{row:index+1,name,phone,status,reason};
 });
 return{rows:result,ready:result.filter(r=>r.status==='ready'),duplicates:result.filter(r=>r.status==='duplicate'),errors:result.filter(r=>['invalid','conflict'].includes(r.status))};
}
