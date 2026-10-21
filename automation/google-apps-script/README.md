# Independent Gmail reminders

This Google Apps Script runs in the owner's Google account, with no ChatGPT dependency. It uses the existing Render API, shared recipient settings and Vercel due page. No API keys or passwords are needed.

## Activate

1. Sign in as jossimogs@gmail.com and open https://script.google.com/home/start . Create a new project named Gubae reminders.
2. Copy all of Code.gs from this folder into the project's Code.gs and save.
3. Select installGubaeReminders in the function dropdown and click Run. Review and authorize the Google permissions for your own script. Gmail access is used to check Sent and send reminders; external requests read the fixed Render API; triggers run the schedule.
4. Confirm the execution log says Installed. Run runGubaeReminders once. If today's reminder is already in Sent, it skips it. Check Executions for success and Triggers for runGubaeReminders.
5. After verifying installation, ask ChatGPT to disable the old Gubae email reminders task. Until cutover, both schedulers could race; do not leave both active for future days.

Google triggers run approximately, not at an exact second. A five-minute trigger performs a single successful daily check at or after 09:00 Asia/Dubai. It returns immediately outside that window or after the day is complete. API errors retry once after 15 seconds, then fail visibly and can retry on the next trigger. Google trigger failure notifications and Executions provide error reporting. No helper email is sent when reminders are disabled, recipients are empty, or nothing is due.

The script validates live data and dates, filters invalid addresses, deduplicates case-insensitively, caps recipients at 50, puts additional recipients in BCC, and searches Sent for the exact dated subject. It does not include topics, teacher details, phone numbers or API-provided links in emails. It never sends WhatsApp messages or changes announcement statuses.

A script lock and daily completion property prevent concurrent/repeated sends. If a send has an ambiguous failure, attemptDate blocks automatic retry to avoid duplicates. Check Sent before clearing attemptDate in Project Settings > Script Properties. Do not clear completedDate to resend on the same date.

Run checkGubaeSetup for a read-only live check. Run stopGubaeReminders to remove this project's reminder triggers. Google email quotas apply. Keep the old reminder active until this setup has been verified; the repository files alone do not activate a Google trigger.

## Validation

Local mocked checks passed for address filtering, duplicate addresses, 50-recipient limit, item counts, stale dates, BCC routing, once-per-day completion, Gmail Sent duplicate detection, empty days and API failures. Actual Google authorization, trigger creation and live execution must be verified in the owner's account.
