const canonical=name=>String(name||'').normalize('NFKC').toLowerCase().replace(/ዲ\s*\/\s*ን/g,'ዲያቆን').replace(/ዶ\s*\/\s*ር/g,'ዶክተር').replace(/[፡።.,]/g,' ').trim().replace(/\s+/g,' ');
const withoutTitles=name=>canonical(name).replace(/^(?:(?:ቀሲስ|ቄስ|ዲያቆን|ዶክተር|አባ|መምህር|ደብተራ)\s+)+/,'');
export function matchTeacher(name,teachers){
 if(!String(name||'').trim())return{status:'none',teacherId:null};
 const active=teachers.filter(t=>!t.archived);let matches=active.filter(t=>canonical(t.name)===canonical(name));
 if(!matches.length)matches=active.filter(t=>withoutTitles(t.name)===withoutTitles(name));
 if(matches.length===1)return{status:'matched',teacherId:matches[0].id,name:matches[0].name};
 return{status:matches.length?'ambiguous':'missing',teacherId:null,candidates:matches.map(t=>({id:t.id,name:t.name}))};
}
