# Phase 6 — Testing (steps 45–53)

Run date: 8 October 2026. All fixtures are synthetic. Backend checks use an ephemeral MongoDB replica set and temporary private upload directory; they do not change the running village records. Live Python checks are read-only.

| Step | Coverage | Result |
| --- | --- | --- |
| 45 Authentication | Registration role restrictions, correct/wrong login, missing/forged/expired/wrong-audience tokens, logout revocation, refresh origin checks/rotation/replay | Passed |
| 46 Complaint submission | Successful persistence, ownership/defaults, invalid category/title/coordinates, blocked priority/status/owner mass assignment | Passed |
| 47 Image uploads | PNG upload and JPEG reencoding, private download, absence of EXIF, disguised files, 5 MB limit, unrelated readers, upload lifecycle restrictions | Passed |
| 48 GIS location | In-boundary acceptance/outside rejection, longitude/latitude preservation, real GeoJSON map intersection, invalid bounding boxes, complaint marker ownership | Passed |
| 49 Status workflow | Invalid transitions, version conflicts, verification/assignment/start/resolution/closure, required evidence, fresh evidence after reopening, atomic history/notifications | Passed |
| 50 Permissions | Citizen/admin/staff actions, wrong department, other village, asset writes, analytics, account provisioning, private images | Passed |
| 51 AI predictions | Actual Python low/medium/high/critical inference, repeatability, model metadata, invalid inputs, limitations, service authentication; separate mocked Node integration checks for persistence and unchanged approved priorities | Passed |
| 52 API security | Strict input validation/operator injection, malformed JSON, oversized bodies, rate limits, security headers, CORS, ID validation, ownership and role checks, service outage behavior | Passed |
| 53 Complete workflow | Citizen creates complaint and uploads photo → admin verifies/assigns → department starts and uploads repair evidence → department resolves → admin closes → citizen tracks closure; six status events and notifications asserted | Passed |

## Re-run

From `smart-village-backend`, run:

```powershell
npm.cmd test
npm.cmd run test:ai
```

Expected results: **23 backend tests** and **11 live AI checks**. The backend suite runs independently of the live AI service; its integration service is an explicit test stub. `test:ai` requires the actual Python service running at `http://127.0.0.1:8001` and reads the private local service key from backend settings, or uses `AI_SERVICE_URL`/`AI_SERVICE_KEY` environment variables. Credentials are never printed.

The oversized upload test originally expected 400; it was corrected to the API's proper 413 response. No application implementation change was required by these tests.

These are automated API/integration and real-model service checks. They do not constitute a penetration test, load test, cross-browser certification or evidence of real-world AI accuracy. The model is trained on synthetic data and remains an administrator-reviewed demonstration. Earlier portal UI smoke testing is documented in PORTAL_GUIDE.md; this phase adds reproducible automated regression coverage.
