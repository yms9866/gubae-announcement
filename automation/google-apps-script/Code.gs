// Paste this file into a standalone Google Apps Script project.
// Run installGubaeReminders once as jossimogs@gmail.com, then authorize Google.
const GUBAE = Object.freeze({
  api: 'https://gubae-announcements-api.onrender.com/api/reminders/due',
  page: 'https://gubae-announcements.vercel.app/announcements.html',
  sender: 'jossimogs@gmail.com',
  zone: 'Asia/Dubai'
});

function verifyGubaeAccount_() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== GUBAE.sender) {
    throw new Error('Run this project as ' + GUBAE.sender);
  }
}

// One API call per trigger run; both reminder lists share the response.
let gubaeDueResponse_ = null;
function fetchGubaeDue_() {
  if (gubaeDueResponse_) return gubaeDueResponse_;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = UrlFetchApp.fetch(GUBAE.api, {
        method: 'get', muteHttpExceptions: true, followRedirects: false,
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('GUBAE_API_TOKEN') }
      });
      const code = response.getResponseCode();
      // The database limit resets daily; retrying immediately only spends more reads.
      if (code === 429 || code === 503) throw Object.assign(new Error('Reminder API busy (HTTP ' + code + '); no email sent. The next scheduled run will retry.'), { noRetry: true });
      if (code !== 200) throw new Error('API HTTP ' + code);
      gubaeDueResponse_ = JSON.parse(response.getContentText());
      return gubaeDueResponse_;
    } catch (error) {
      if (error.noRetry) throw error;
      if (attempt === 1) throw new Error('Live reminder API unavailable; no email sent.');
      Utilities.sleep(15000);
    }
  }
}

function validateGubaeDue_(data, today) {
  if (!data || data.date !== today || data.timezone !== GUBAE.zone ||
      typeof data.enabled !== 'boolean' || !Array.isArray(data.recipients) ||
      !Number.isSafeInteger(data.count) || data.count < 0 ||
      !Array.isArray(data.items) || data.items.length !== data.count) {
    throw new Error('Invalid or stale reminder data; no email sent.');
  }
  const recipients = [];
  const seen = new Set();
  const email = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  for (const value of data.recipients) {
    if (typeof value !== 'string' || value.length > 254 || /\s/.test(value) ||
        !email.test(value) || value.split('@')[0].length > 64) continue;
    const key = value.toLowerCase();
    if (!seen.has(key) && recipients.length < 50) { recipients.push(value); seen.add(key); }
  }
  let posters = 0, invitations = 0, reports = 0;
  for (const item of data.items) {
    if (item.type === 'poster') posters++;
    else if (item.type === 'link') invitations++;
    else if (item.type === 'report') reports++;
    else throw new Error('Unknown announcement type; no email sent.');
  }
  const links = {};
  for (const address of recipients) {
    const link = data.recipientLinks && data.recipientLinks[address.toLowerCase()];
    if (link === null) continue; // Access is blocked: do not email an unusable link.
    if (typeof link !== 'string' || !/^https:\/\/gubae-announcements\.vercel\.app\/(?:announcements\.html#access=gsa_[A-Za-z0-9_-]{43}|login\.html\?[^<>"\s]+)$/.test(link)) {
      throw new Error('Missing or invalid individual access link; no email sent. Update the backend and reminder script together.');
    }
    links[address] = link;
  }
  return { enabled: data.enabled, recipients: recipients.filter(address => links[address]), links, posters, invitations, reports, count: data.count };
}

function wasGubaeSent_(subject, recipient) {
  const query = 'in:sent subject:"' + subject + '"';
  for (let start = 0; ; start += 50) {
    const threads = GmailApp.search(query, start, 50);
    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        const from = message.getFrom();
        const address = (from.match(/<([^>]+)>/) || [null, from])[1].toLowerCase();
        if (message.getSubject() === subject && address === GUBAE.sender && !message.isDraft() && (!recipient || message.getTo().toLowerCase().split(/[,;]+/).some(to => to.trim() === recipient.toLowerCase() || to.includes('<' + recipient.toLowerCase() + '>')))) return true;
      }
    }
    if (threads.length < 50) return false;
  }
}

// Runs every five minutes but performs one successful daily check after 09:00 Dubai.
// Failed requests retry at the next trigger. Google's scheduler may run late.
function runGubaeAnnouncementReminders_() {
  verifyGubaeAccount_();
  const now = new Date();
  if (Number(Utilities.formatDate(now, GUBAE.zone, 'H')) < 9) return;
  const today = Utilities.formatDate(now, GUBAE.zone, 'yyyy-MM-dd');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('completedDate') === today) return;
    const due = validateGubaeDue_(fetchGubaeDue_(), today);
    const complete = () => props.setProperty('completedDate', today);
    if (!due.enabled || !due.recipients.length || due.count === 0) { complete(); return; }
    const subject = 'Gubae announcements due · ' + today;
    // Block automatic retries after an ambiguous send failure until reviewed.
    if (props.getProperty('attemptDate') === today) {
      throw new Error('A send was attempted today. Check Gmail Sent before clearing attemptDate in Script Properties.');
    }
    if (MailApp.getRemainingDailyQuota() < due.recipients.length) throw new Error('Insufficient email quota; no email sent.');
    const summary = due.count + ' announcements pending: ' + due.posters + ' posters and ' + due.invitations + ' Zoom invitations and ' + due.reports + ' report links.';
    const steps = 'Open the page, prepare each announcement, send it in WhatsApp, and mark it sent so all helpers share the same status.';
    props.setProperty('attemptDate', today);
    for (const recipient of due.recipients) {
      if (wasGubaeSent_(subject, recipient)) continue;
      const page = due.links[recipient];
      const escapedPage = page.replace(/&/g, '&amp;');
      const options = {
        name: 'Gubae reminders',
        htmlBody: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Gubae announcements due</h2><p>' + today + '</p><p><strong>' + summary + '</strong></p><p><a style="display:inline-block;padding:14px 22px;background:#245c46;color:white;border-radius:8px;text-decoration:none" href="' + escapedPage + '">Open your announcements</a></p><p>' + steps + '</p><p>This is your private access link. Keep it private.</p></div>'
      };
      // Send separately so each recipient gets only their own link.
      GmailApp.sendEmail(recipient, subject, summary + '\n\n' + page + '\n\n' + steps, options);
    }
    complete();
    props.deleteProperty('attemptDate');
    console.log('Reminder sent: ' + today + '; announcements: ' + due.count);
  } finally { lock.releaseLock(); }
}

// Both reminder lists share the existing trigger and private API key.
function runGubaeReminders() {
  gubaeDueResponse_ = null;
  const failures = [];
  try { runGubaeAnnouncementReminders_(); } catch (error) { failures.push('Announcement reminders: ' + error.message); }
  try { runGubaeTeacherReminders_(); } catch (error) { failures.push('Teacher reminders: ' + error.message); }
  if (failures.length) throw new Error(failures.join(' / '));
}
function validateTeacherDue_(data, today) {
  const teacher = data && data.teacherReminders;
  if (!teacher) return {enabled:false,recipients:[],count:0,items:[],recipientLinks:{}};
  if (data.date !== today || data.timezone !== GUBAE.zone || typeof teacher.enabled !== 'boolean' || !Array.isArray(teacher.recipients) || teacher.recipients.length > 50 || !Number.isSafeInteger(teacher.count) || teacher.count < 0 || !Array.isArray(teacher.items) || teacher.items.length !== teacher.count) throw new Error('Invalid teacher reminder response.');
  for (const email of teacher.recipients) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^https:\/\/gubae-announcements\.vercel\.app\/teachers-day\.html#teacherAccess=gtd_[A-Za-z0-9_-]{43}$/.test(teacher.recipientLinks && teacher.recipientLinks[email] || '')) throw new Error('Invalid teacher recipient or private link.');
  }
  for (const item of teacher.items) if (typeof item.topic !== 'string' || typeof item.teacherName !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.meetingDate)) throw new Error('Invalid teacher reminder item.');
  return teacher;
}
function runGubaeTeacherReminders_() {
  verifyGubaeAccount_();
  const now = new Date();
  if (Number(Utilities.formatDate(now, GUBAE.zone, 'H')) < 9) return;
  const today = Utilities.formatDate(now, GUBAE.zone, 'yyyy-MM-dd');
  const lock = LockService.getScriptLock();if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('teacherCompletedDate') === today) return;
    const due = validateTeacherDue_(fetchGubaeDue_(), today);
    const complete = () => props.setProperty('teacherCompletedDate', today);
    if (!due.enabled || !due.recipients.length || !due.count) {complete();return;}
    if (props.getProperty('teacherAttemptDate') === today) throw new Error('A teacher reminder send was attempted today. Check Gmail Sent before clearing teacherAttemptDate.');
    if (MailApp.getRemainingDailyQuota() < due.recipients.length) throw new Error('Insufficient email quota; no teacher reminders sent.');
    const subject = 'Gubae teacher invitations due · ' + today;
    const summary = due.count + ' teacher invitations are pending.';
    const details = due.items.map(item => item.teacherName + ' · ' + item.topic + ' · ' + item.meetingDate).join('\n');
    const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    props.setProperty('teacherAttemptDate', today);
    for (const recipient of due.recipients) {
      if (wasGubaeSent_(subject, recipient)) continue;
      const page = due.recipientLinks[recipient];
      GmailApp.sendEmail(recipient, subject, summary + '\n\n' + details + '\n\n' + page + '\n\nSend the teacher invitations, then mark them sent on the page.', {name:'Gubae reminders',htmlBody:'<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Teachers of the day</h2><p>'+escape(summary)+'</p><ul>'+due.items.map(item=>'<li>'+escape(item.teacherName)+' · '+escape(item.topic)+' · '+escape(item.meetingDate)+'</li>').join('')+'</ul><p><a href="'+escape(page)+'">Open Teachers of the day</a></p><p>Send the invitations, then mark them sent. Keep this private link to yourself.</p></div>'});
    }
    complete();props.deleteProperty('teacherAttemptDate');console.log('Teacher reminder sent: '+today+'; pending invitations: '+due.count);
  } finally {lock.releaseLock();}
}

// Read-only check: no emails, triggers or completion records are changed.
function checkGubaeSetup() {
  verifyGubaeAccount_();
  const today = Utilities.formatDate(new Date(), GUBAE.zone, 'yyyy-MM-dd');
  const data = fetchGubaeDue_();
  const due = validateGubaeDue_(data, today);
  const teacher = validateTeacherDue_(data, today);
  const sent = wasGubaeSent_('Gubae announcements due · ' + today);
  console.log(JSON.stringify({ date: today, enabled: due.enabled, validRecipients: due.recipients.length,
    posters: due.posters, invitations: due.invitations, alreadySent: sent, teacherRemindersEnabled:teacher.enabled, teacherRecipientCount:teacher.recipients.length, pendingTeacherInvitations:teacher.count,
    remainingQuota: MailApp.getRemainingDailyQuota() }));
}

function installGubaeReminders() {
  checkGubaeSetup();
  const oldTriggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runGubaeReminders');
  ScriptApp.newTrigger('runGubaeReminders').timeBased().everyMinutes(5).create();
  oldTriggers.forEach(t => ScriptApp.deleteTrigger(t));
  console.log('Installed. First daily check shortly after 09:00 Dubai. Run runGubaeReminders to verify today.');
}

function stopGubaeReminders() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runGubaeReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
