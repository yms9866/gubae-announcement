import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {matchTeacher} from '../dist/teacher-match.mjs';
import {topicKey} from '../dist/programs.mjs';

// Input rows contain names and dates, never database IDs. Each row is applied once.
export async function assignTeachers(store,rows,{apply=false}={}){
 const seen=new Set();
 for(const row of rows){if(!row.topic||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!row.teacherName)throw Error('Invalid teacher assignment row.');const key=topicKey(row.topic)+'|'+row.date;if(seen.has(key))throw Error('Duplicate gubae/date in teacher assignments.');seen.add(key)}
 const [meetings,teachers]=await Promise.all([store.list('meetings'),store.list('teachers')]);
 const results=[];
 for(const row of rows){
  const key=createHash('sha256').update(JSON.stringify(row)).digest('hex');
  const matches=meetings.filter(m=>m.date===row.date&&topicKey(m.topic)===topicKey(row.topic));
  if(matches.length!==1){results.push({...row,status:matches.length?'ambiguous-meeting':'missing-meeting'});continue}
  const m=matches[0];if(m.assignmentImports?.includes(key)){results.push({...row,status:'already-applied'});continue}
  let match=matchTeacher(row.teacherName,teachers);
  // Parenthesized nickname is optional, but only a unique full-name contact is accepted.
  if(match.status==='missing'&&/\([^)]*\)/.test(row.teacherName))match=matchTeacher(row.teacherName.replace(/\s*\([^)]*\)/g,''),teachers);
  const status=match.teacherId?'assigned':match.status;
  if(apply)await store.write('meetings',m.id,m.revision,old=>{
   if(old.assignmentImports?.includes(key))return old;
   return{...old,scheduledTeacherName:row.teacherName,teacherId:match.teacherId||null,assignmentImports:[...(old.assignmentImports||[]),key],sent:(old.teacherId||null)===(match.teacherId||null)?old.sent:{...old.sent,teacher:null}};
  });
  results.push({...row,status,meetingId:m.id});
 }
 return{apply,counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),results};
}
export async function runTeacherAssignmentFile(store,file,{apply=false}={}){
 return assignTeachers(store,JSON.parse(await readFile(file,'utf8')),{apply});
}
