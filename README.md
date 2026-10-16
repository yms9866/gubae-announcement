# Gubae Announcements

41 gubaes, original Canva posters, prepared WhatsApp invitations, private teacher contacts, organizer reports, and monthly reporting.

## Runtime

- Frontend: buildless HTML / CSS / ES modules in `dist/`, with a bundled Firebase Authentication client.
- Backend: Node.js 22 + Express 5, deployable as one free Render web service.
- Database: Cloud Firestore using Firebase Admin SDK on the backend. Client Firestore access is denied.
- Authentication: Google sign-in through Firebase Auth; verified administrator emails must match `ADMIN_EMAILS` on the server.

No phone numbers or teacher records are embedded in the public frontend. Import the existing private contact file after signing in. Teacher names are not inserted in Zoom invitations.

## Firebase setup

1. Select a Firebase project and create a Firestore **Standard / Native mode** database. Choose its location before creating the database; the location cannot be changed later.
2. Enable Authentication → Google sign-in. Authorize `gubae-announcements.yosefmogesie.chatgpt.site` as a domain.
3. Register a Firebase Web app. Its public configuration goes into `FIREBASE_WEB_CONFIG_JSON` on Render.
4. Deploy `firestore.rules`. All browser access is denied; the protected backend uses Admin SDK permissions.
5. Provide a dedicated service account for the backend with the permissions required for Firestore read/write and Firebase Auth token verification. Put its JSON credential only in Render's secret environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit it or paste it into a frontend file.

## Deploy backend on Render

Push this repository to GitHub, then create a Node web service using `render.yaml` or these settings:

- Plan: Free
- Build: `npm ci --omit=dev`
- Start: `npm start`
- Health path: `/health`
- Node: 22
- Port: supplied by Render; server binds `0.0.0.0`

Configure the variables shown in `backend/.env.example`. `ADMIN_EMAILS` is a comma-separated allowlist of the actual administrator Google accounts. The backend fails closed if the allowlist or Firebase configuration is missing.

Once the backend is healthy, set its HTTPS origin in `dist/cloud-config.json` and publish the frontend. You can also enter the origin in Setup for the current device; the shared config avoids repeating that on every device.

Free Render services can sleep after inactivity, so the first request may take longer. There is no background WhatsApp sender in this release; actual delivery still finishes inside WhatsApp. No paid service or messaging plan is required by the code.

## Using the workspace

- **Queue / all meetings:** existing poster and invitation workflows; edit each gubae's topic, date, time, duration, or Zoom link. Changes clear outdated sent confirmations.
- **Recipients:** import the existing 41-mahber contact JSON, or enter international numbers. An invalid supplied number is retained for correction rather than guessed.
- **Teachers:** add private name, WhatsApp number, optional email and notes; assign a teacher to each gubae. Open a prepared Zoom invitation in the teacher's chat and mark sent after delivery.
- **Organizer reports:** enter a report as admin or generate a per-gubae link for its organizer. Reporting opens on that meeting's Dubai date. Links expire 45 days after the meeting; generating another link revokes the old one. Explicit revoke is also available.
- **Monthly report:** select a Gregorian month, custom period, or full program. View reported/missing gubaes, attendance totals, teaching ratings, feedback and comments. Export CSV or Print / Save PDF.

Monthly attendance totals count attendances, not unique people. Averages use submitted reports for held gubaes; cancelled, postponed, missing, and upcoming gubaes are handled separately. Updating a report replaces that gubae's record and does not duplicate totals.

## Persistence and migration

Without a configured backend, the existing local workspace continues to work; teacher contacts and reports save locally too. The visible sync indicator states the current mode. Cloud mode polls for updates while the app is visible, and refreshes when returning to the app. Conditional ETag requests avoid fetching every document when nothing changed.

When first signing in on a device, its original recipients, edits and sent confirmations are not silently uploaded. Use **Setup → Import this device's original setup**, or import the private contact JSON. Legacy import fills missing values and preserves existing cloud data.

Each cloud mutation includes a revision and uses a Firestore transaction. Conflicts return 409 instead of overwriting another device. Unconfirmed changes remain pending in memory with a visible error; retry them or discard and refresh. Keep the page open until it says Cloud synced. Cloud changes are not stored in an unauthenticated browser cache.

Original poster files are available on all devices. Custom poster replacements remain in local IndexedDB. The old backup contains local gubae details / recipients / poster replacements; **Export cloud records** downloads a JSON snapshot of shared meetings, teacher contacts and reports. Existing Google Calendar reminders are separate; editing a gubae here does not edit its calendar events.

## API

Private routes require a Firebase ID token for an allowlisted verified email:

- `GET /api/config` — public Firebase web config (no credentials or contacts)
- `GET /api/state` — shared records, conditional ETag
- `PATCH /api/meetings/:id` — details, recipient, teacher assignment
- `PUT /api/meetings/:id/status/:kind` — poster/link/teacher delivery confirmation
- `POST /api/teachers`, `PATCH /api/teachers/:id`
- `PUT /api/meetings/:id/report`
- `POST /api/meetings/:id/report-link`, `DELETE /api/meetings/:id/report-link`
- `GET /api/public/report/:id`, `PUT /api/public/report/:id` — scoped organizer token, not admin access
- `POST /api/import` — merge missing legacy records
- `GET /api/monthly-report?month=2026-10` — JSON; add `format=csv`, or use `from` / `to`

Organizer tokens are random, expire, and only their SHA-256 hashes are stored. They travel in the URL fragment, not its query, and in the Authorization header when talking to the API. Keep organizer links private to the intended organizer. CORS permits the configured frontend; it does not replace authentication.

## Development and validation

```sh
npm ci
npm test
npm run build:auth
npm start
```

For local development, load variables from a private environment file or use Node's `--env-file` flag. Runtime credentials are never required by the test suite. Tests cover access boundaries, report-day restrictions, link replacement/revocation, revision conflicts, teacher validation, imports, monthly calculations and all main frontend screens through DOM unit tests. Live Firebase / Render and browser QA must be checked after connecting and deploying those services.
