// A meeting becomes overdue after its scheduled end in Dubai, unless its outcome is reported.
export function meetingStatus(meeting,report,now=new Date()){
 if(['held','missed','cancelled','postponed'].includes(report?.status))return report.status;
 const start=new Date(meeting.date+'T'+(meeting.startTime||'21:00')+':00+04:00').getTime();
 const end=start+(meeting.durationMinutes||90)*60000;
 return now.getTime()>=end?'overdue':'upcoming';
}
export const meetingStatusLabel=status=>({held:'Held',upcoming:'Upcoming',overdue:'Overdue',missed:'Missed / not held',cancelled:'Cancelled',postponed:'Postponed'}[status]||'Unknown');
