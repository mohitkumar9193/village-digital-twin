# Gram — citizen, admin and department portals

Open **[http://localhost:4000](http://localhost:4000)** on this computer. The app is running with local MongoDB.

## Citizen

Use **Register** to create a citizen account, or **Sign in** for an existing account. Public registration cannot create admin or staff accounts.

- **Citizen dashboard:** your complaint counts, status chart, recent complaints and updates.
- **Submit complaint:** category, title, description, optional related asset/photo, and map location. Photos are limited to 5 MB. Locations are checked against the village boundary.
- **My complaints:** search by title/tracking number and filter by status.
- **Complaint tracking:** status, assignment, timeline, private photos, resolution remarks and map location. Resolved/closed complaints support a resolution-review request.
- **My profile:** view your account role/village and update your name.
- **Notifications:** view your in-app updates, filter unread, mark one or all read, and open the linked complaint.

## Admin

The admin dashboard shows village-wide totals, a verification/assignment queue, status charts, and department/staff provisioning forms.

Open a complaint to verify/reject it, assign a supported department, set priority with a reason, review evidence, close a resolved report, or reopen it. Every successful transition records history and notifications. Stale updates are rejected; use **Refresh record** before retrying.

## Department staff

Staff see only complaints assigned to their department. Open a complaint to start work, record progress, upload resolution evidence, and resolve it with remarks. Evidence is required for the current work cycle. Staff cannot verify complaints or assign departments.

## GIS and analytics

**GIS Digital Twin** retains the village boundary, asset layers, complaint markers, search, filters, popups and map controls. Citizen/staff complaint visibility follows their account scope.

Admin and staff **Analytics** pages show category/status/area bar charts, weekly/monthly submission trends, and department performance. Date controls use Indian local-day boundaries and filter submission dates. Staff analytics are department-scoped. Charts use stored records, contain accessible count descriptions/data tables, and do not present forecasts.

## Local demo accounts

The local launcher provisions three roles: admin, citizen, and department staff. Their generated emails/passwords are kept privately in:

`smart-village-backend/data/local/settings.json`

Use the matching `adminEmail/adminPassword`, `citizenEmail/citizenPassword`, or `staffEmail/staffPassword` values to sign in. Credentials are excluded from browser bundles and downloadable source archives. You can also register your own citizen account and provision staff through the admin dashboard.

The baseline map contains **13 synthetic assets and six seeded sample complaints**. It is not an official surveyed village. The demo citizen starts without complaints; submit a report to exercise the actual workflow. Synthetic imported complaint statuses are clearly labelled and are not proof of real maintenance.

## Restart or rebuild

From `smart-village-backend`, run `npm.cmd run local`, then open http://localhost:4000.

After frontend edits, run `npm.cmd run build` from `smart-village-frontend` and reload the page. `npm.cmd run dev` watches builds; it does not provide hot module replacement. The backend serves the sibling frontend's `dist/` build.

## Verification

- Production frontend build passed.
- All **15 backend integration tests** passed, including role/record isolation, complaint lifecycle/evidence, profile permissions, staff provisioning, notifications and asset filtering.
- Browser verification completed registration/login, session restoration, citizen submission/tracking, profile save, notification read, admin verification/assignment, staff start/evidence/resolution, admin closure, and date/week/month analytics.
- The temporary labelled QA complaint, evidence, events, notifications and registration account were removed afterward. Demo fixtures and user data were preserved.

The application is local to this computer. External email/SMS/push delivery, predictive AI, and public deployment are not part of this phase.

## AI assistant (steps 36�44)
Open the Admin Dashboard and scroll to Priority recommendations. Generate recommendations to analyze current active complaints; Review complaint opens existing admin controls. Python service runs privately at port 8001. Suggestions, reasons, limitations and synthetic training analysis appear in the dashboard. Approved priorities remain unchanged until an admin changes them manually. See smart-village-ai/README.md for data, training, endpoints and evaluation. Validation: 17 backend tests passed, frontend production build passed, and live Python authentication, invalid-input and actual prediction checks passed.

## Automated testing (steps 45�53)
The expanded regression suite passes 23 backend tests and 11 checks against the actual Python model service. See TEST_REPORT.md for coverage, limitations and repeatable commands. Tests use isolated synthetic fixtures; live AI checks do not modify application records.

## Finding complaint resolution portals
Open http://localhost:4000/#resolution or choose Complaint resolution in the sidebar. The Admin and Department cards link to dedicated sign-in screens. Use administrator credentials for verification, priority, assignment and closure; use department staff credentials for assigned work, progress and evidence-based resolution. Local account emails/passwords are in smart-village-backend/data/local/settings.json (adminEmail/adminPassword and staffEmail/staffPassword). The settings file is private and excluded from the project archive. Selecting a sign-in screen does not grant that role; the authenticated account determines permissions. Admin dashboard now also includes a resolution review queue. The complete 23-test API suite passed on 9 October 2026 with MongoDB 7.0.24 and a workspace-owned test temp directory.

## Clear resolution tracking
Complaint resolution now shows each permitted complaint's current saved status, tracking number, department, progress steps, last update and timeline/photo link. Submitted/verified/assigned/reopened are not resolved; in-progress means work ongoing; resolved means department completion awaiting Admin review; closed means Admin-reviewed closure; rejected is explicitly not resolved. Status can be refreshed manually and refreshes every 30 seconds while visible. Existing role permissions remain in place. Frontend build, all eight state mappings and the live citizen complaint display were verified.

## Automatic complaint routing and reminders
The server checks active non-demo complaints every minute. After Admin verification, it assigns a report only when exactly one active village department supports the category and has an active staff account. Otherwise Admin assignment is required. It sends high/critical in-app alerts once per priority level and overdue reminders at most once per 24 hours to the citizen, Admin and assigned department staff. Targets from submission/reopening: low 168h, medium 72h, high 24h, critical 4h; Admin priority changes adjust the target. All actions create timeline events. No automatic verification, repair, resolution or closure is performed. Staff evidence and Admin closure remain mandatory. The worker operates while the backend runs; notifications are in-app, not SMS/email. The current worker examines up to 500 active reports per scan. Tests: 25/25 API checks passed, including automation routing, ambiguity, deduplication and evidence enforcement.

## Resolution alarm and automation heartbeat
Resolution alerts appear across signed-in pages for unread resolve/close notifications. Enable alarm sound explicitly to unlock the browser audio context; a test button plays a short chime without changing any complaint. Resolved alerts distinguish department completion awaiting Admin review from Admin closure, and link to repair evidence. Dismissals are local to this browser/account; notifications remain in the notification inbox. The page checks updates every 30 seconds while visible. Sound requires an open page, enabled sound and unmuted browser/device; it is not an operating-system or background push alarm. Sound must be re-enabled after a reload. Automation status is authenticated and shows its actual last successful backend scan, reporting failures/stale checks. Frontend build and all 26 API tests passed; live heartbeat and browser audio activation were verified.

## Gentle 30-second alarm
Resolution sound now uses a soft repeating major-pentatonic bell melody for 30 seconds. Test 30-second alarm previews it without changing complaint data. Stop alarm, mute or dismiss ends playback early. Playback stops automatically at 30 seconds and on component unmount. Enable alarm sound after reload to hear new resolution notifications. Verified frontend build, 36-note schedule within 30 seconds, browser playback and early Stop control.
