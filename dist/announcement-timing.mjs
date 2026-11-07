export const DEFAULT_TIMING={poster:{amount:3,unit:'days'},link:{amount:1,unit:'days'},report:{amount:12,unit:'hours'}};
export const ANNOUNCEMENT_KINDS=['poster','link','report'];
export function normalizeTiming(input={}){
 const result={};
 for(const kind of ANNOUNCEMENT_KINDS){
  const value=input[kind]||DEFAULT_TIMING[kind],amount=Number(value.amount);
  if(!['days','hours'].includes(value.unit)||!Number.isInteger(amount)||amount<0||amount>(value.unit==='days'?365:8760))throw Error('Choose whole days (0–365) or hours (0–8760) for each announcement.');
  result[kind]={amount,unit:value.unit};
 }
 return result;
}
export function announcementDeadline(meeting,kind,timing=DEFAULT_TIMING){
 const rule=timing[kind]||DEFAULT_TIMING[kind];
 const start=new Date(meeting.date+'T'+(meeting.startTime||'21:00')+':00+04:00');
 if(rule.unit==='hours')return new Date(start.getTime()-rule.amount*3600000).toISOString();
 const calendar=new Date(meeting.date+'T00:00:00+04:00');
 calendar.setUTCDate(calendar.getUTCDate()-rule.amount);
 return calendar.toISOString();
}
