# Deploy with Vercel + Neon

The default deployment now runs React, Express APIs, and trained AI inference in ONE Vercel project. Neon PostgreSQL stores accounts, complaints, history, notifications, map assets, refresh sessions, recommendations, and private photos. No separate Render backend, MongoDB Atlas, or Python host is required.

## 1. Create Neon database

Create a project at https://console.neon.tech. In Connect, enable connection pooling and copy the PostgreSQL connection string, including `sslmode=require`. Keep it private. Prefer a region close to your Vercel function region.

## 2. Initialize your village and Admin

From the repository root, run:

```powershell
npm ci --prefix smart-village-backend
Copy-Item .env.example smart-village-backend/.env
```

Edit `smart-village-backend/.env` locally. Set the real `DATABASE_URL`, your `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (12–72 characters). Then:

```powershell
cd smart-village-backend
npm run bootstrap:neon
cd ..
```

Copy the printed `VILLAGE_ID`. The command creates Kothri Kalan, sourced map assets, four departments, and your Admin. Re-running for the same Admin leaves credentials unchanged. This creates a fresh installation; see NEON_MIGRATION.md to keep existing MongoDB complaints/photos instead. Never commit `.env`.

## 3. Import GitHub repository into Vercel

Repository: https://github.com/mohitkumar9193/village-digital-twin

- Root Directory: repository root (`.`), **not** `smart-village-frontend`.
- Framework Preset: Other (root `vercel.json` supplies the build settings).
- Node.js: 22.x or a compatible supported newer release.
- Install: `npm ci`.
- Build: `npm ci --include=dev --prefix smart-village-frontend && npm run build --prefix smart-village-frontend`.
- Output: `smart-village-frontend/dist`.

If you previously imported only the frontend, change its Root Directory to the repository root and remove `BACKEND_ORIGIN`. Do not import three standalone services. The nested frontend-only config remains available for older separately hosted backends; it is not used by this deployment.

## 4. Set Vercel environment variables

Set these for Production (and Preview only if using a separate test database):

| Variable | Value |
| --- | --- |
| DATABASE_URL | Neon **pooled** PostgreSQL URL |
| JWT_SECRET | A new random secret, at least 32 characters |
| VILLAGE_ID | ID printed by initialization, or your migrated village ID |
| CORS_ORIGIN | Exact site origin, e.g. `https://your-project.vercel.app`, no trailing slash |
| CRON_SECRET | Another random secret, at least 32 characters |
| NODE_ENV | `production` |

Generate each secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not share secrets in chat or commit them. Do not set `ADMIN_PASSWORD`, `MONGODB_URI`, `AI_SERVICE_URL`, `AI_SERVICE_KEY`, or `BACKEND_ORIGIN` in this deployment.

Deploy. If the final Vercel domain differs, update `CORS_ORIGIN` and redeploy. Frontend requests `/api/v1` on the same domain; no localhost API dependency or frontend API URL is needed.

## 5. Check the live system

1. Visit `/api/health` and `/api/ready`; expect `ok` and `connected`.
2. Sign in with the Admin created above; create a staff account for each department in team management.
3. Register a citizen; submit an in-boundary complaint and an optional photo.
4. Verify it as Admin. Automatic assignment needs exactly one active matching department with active staff; otherwise assign manually.
5. Staff start work, add remarks and upload repair evidence, then resolve. Admin reviews and closes. Citizen sees timeline, status, photo and notifications; enable the sound control to hear the resolution alarm.
6. Check GIS and analytics, then refresh AI recommendations from Admin dashboard.

## Scheduling and storage

Vercel functions run on requests. Routing/reminder checks run on authenticated writes and when the resolution status panel polls; a secured daily cron also checks when nobody is visiting. The daily schedule is 02:00 UTC; Hobby timing is approximate. This is not a continuously running 60-second worker. Repairs and closure always require staff evidence and Admin review. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Uploads are limited to 4 MB each to fit function request limits, validated/reencoded to JPEG, stored in Neon `bytea`, and downloaded only after complaint authorization. Photos consume database storage; monitor Neon quotas. For substantial production image volume, migrate image blobs to private object storage. GIS GeoJSON is stored in JSONB and intersections run with Turf after village/role filtering; this is suitable for the current village-sized dataset, not a PostGIS installation.

The AI forest is exported from the existing Scikit-learn model and executes in Node. All 480 held-out priorities and class scores match Python. Its labels/data remain synthetic and recommendations require human review. Retrain with Python and run `python export-node.py` in `smart-village-ai`, then redeploy.

## Verification completed locally

PostgreSQL tests use an isolated PGlite PostgreSQL engine (not your live database), including the full complaint/evidence/closure workflow, privacy, roles, GIS, analytics, sessions, concurrency, and Vercel route/cron entry point. Production build and browser API tests pass. No live Neon connection or deployed Vercel system has been verified yet; finish the live checklist after adding your credentials.

Connection details: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).
