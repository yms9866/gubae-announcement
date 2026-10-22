// A meeting becomes overdue after its scheduled end in Dubai, unless its outcome is reported.
export function meetingStatus(meeting,report,now=new Date()){
 if(['held','missed','cancelled','postponed'].includes(meeting.outcome))return meeting.outcome;
 if(['held','missed','cancelled','postponed'].includes(report?.status))return report.status;
 const start=new Date(meeting.date+'T'+(meeting.startTime||'21:00')+':00+04:00').getTime();
 const end=start+(meeting.durationMinutes||90)*60000;
 return now.getTime()>=end?'overdue':'upcoming';
}
// The meetings list highlights the gubae day from 06:00 Dubai until its scheduled end.
export function meetingListStatus(meeting,report,now=new Date()){
 const outcome=meetingStatus(meeting,report,now);
 if(outcome!=='upcoming')return outcome;
 const morning=new Date(meeting.date+'T06:00:00+04:00').getTime();
 return now.getTime()>=morning?'today':'upcoming';
}
export const meetingStatusLabel=status=>({held:'Held',today:'Today',upcoming:'Upcoming',overdue:'Overdue',missed:'Missed / not held',cancelled:'Cancelled',postponed:'Postponed'}[status]||'Unknown');
