// Paste this file into a standalone Google Apps Script project.
// Run installGubaeReminders once as jossimogs@gmail.com, then authorize Google.
const GUBAE = Object.freeze({
  api: 'https://gubae-announcements-api.onrender.com/api/reminders/due',
  page: 'https://gubae-announcements.vercel.app/due.html',
  sender: 'jossimogs@gmail.com',
  zone: 'Asia/Dubai'
});

function verifyGubaeAccount_() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== GUBAE.sender) {
    throw new Error('Run this project as ' + GUBAE.sender);
  }
}

function fetchGubaeDue_() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = UrlFetchApp.fetch(GUBAE.api, {
        method: 'get', muteHttpExceptions: true, followRedirects: false,
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('GUBAE_API_TOKEN') }
      });
      if (response.getResponseCode() !== 200) throw new Error('API HTTP ' + response.getResponseCode());
      return JSON.parse(response.getContentText());
    } catch (error) {
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
  return { enabled: data.enabled, recipients, posters, invitations, reports, count: data.count };
}

function wasGubaeSent_(subject) {
  const query = 'in:sent subject:"' + subject + '"';
  for (let start = 0; ; start += 50) {
    const threads = GmailApp.search(query, start, 50);
    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        const from = message.getFrom();
        const address = (from.match(/<([^>]+)>/) || [null, from])[1].toLowerCase();
        if (message.getSubject() === subject && address === GUBAE.sender && !message.isDraft()) return true;
      }
    }
    if (threads.length < 50) return false;
  }
}

// Runs every five minutes but performs one successful daily check after 09:00 Dubai.
// Failed requests retry at the next trigger. Google's scheduler may run late.
function runGubaeReminders() {
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
    if (wasGubaeSent_(subject)) { complete(); return; }
    // Block automatic retries after an ambiguous send failure until reviewed.
    if (props.getProperty('attemptDate') === today) {
      throw new Error('A send was attempted today. Check Gmail Sent before clearing attemptDate in Script Properties.');
    }
    if (MailApp.getRemainingDailyQuota() < due.recipients.length) throw new Error('Insufficient email quota; no email sent.');
    const summary = due.count + ' announcements pending: ' + due.posters + ' posters and ' + due.invitations + ' Zoom invitations and ' + due.reports + ' report links.';
    const steps = 'Open the page, prepare each announcement, send it in WhatsApp, and mark it sent so all helpers share the same status.';
    const options = {
      name: 'Gubae reminders',
      htmlBody: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Gubae announcements due</h2><p>' + today + '</p><p><strong>' + summary + '</strong></p><p><a style="display:inline-block;padding:14px 22px;background:#245c46;color:white;border-radius:8px;text-decoration:none" href="' + GUBAE.page + '">Open announcements due</a></p><p>' + steps + '</p></div>'
    };
    if (due.recipients.length > 1) options.bcc = due.recipients.slice(1).join(',');
    props.setProperty('attemptDate', today);
    GmailApp.sendEmail(due.recipients[0], subject, summary + '\n\n' + GUBAE.page + '\n\n' + steps, options);
    complete();
    props.deleteProperty('attemptDate');
    console.log('Reminder sent: ' + today + '; announcements: ' + due.count);
  } finally { lock.releaseLock(); }
}

// Read-only check: no emails, triggers or completion records are changed.
function checkGubaeSetup() {
  verifyGubaeAccount_();
  const today = Utilities.formatDate(new Date(), GUBAE.zone, 'yyyy-MM-dd');
  const due = validateGubaeDue_(fetchGubaeDue_(), today);
  const sent = wasGubaeSent_('Gubae announcements due · ' + today);
  console.log(JSON.stringify({ date: today, enabled: due.enabled, validRecipients: due.recipients.length,
    posters: due.posters, invitations: due.invitations, alreadySent: sent,
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
