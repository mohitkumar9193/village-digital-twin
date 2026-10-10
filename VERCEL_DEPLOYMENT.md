# Deploy Smart Village frontend on Vercel

## Vercel settings

1. Import `mohitkumar9193/village-digital-twin`.
2. Select Root Directory: `smart-village-frontend`.
3. Framework: Vite. Install: `npm ci`. Build: `npm run build`. Output: `dist`.
4. Add Production environment variable `BACKEND_ORIGIN`, for example `https://your-backend.onrender.com`. Use your actual deployed backend origin, without `/api/v1`. No localhost address or secrets are permitted here.
5. Deploy. Missing/invalid BACKEND_ORIGIN produces a clear configuration error instead of a broken login page.

The project uses `vercel.mjs`, a supported programmatic Vercel configuration. API rewrites forward `/api/*` to the Express service while the browser keeps the Vercel origin. Existing JWT access headers, multipart uploads and HttpOnly refresh cookies use this same-origin API route. Keep the default hash navigation (`/#dashboard`, `/#map`, etc.). Static assets are built by Vite; the SPA fallback handles other navigation.

## Required backend services

The Vercel frontend cannot start the local launcher, MongoDB, the one-minute worker or Python service. Deploy the Express backend as a persistent service (for example Render), MongoDB Atlas with transactions/replica-set support, and Python FastAPI separately.

Backend production environment:

- `NODE_ENV=production`
- `MONGODB_URI`: private Atlas connection string
- `JWT_SECRET`: private random secret of 32+ characters
- `VILLAGE_ID`: database village created with backend bootstrap
- `CORS_ORIGIN`: exact Vercel production origin, e.g. `https://your-project.vercel.app` (no trailing slash)
- `UPLOAD_DIR`: persistent private storage path mounted on the backend
- `AI_SERVICE_URL`: hosted Python service URL
- `AI_SERVICE_KEY`: same private service key on Node and Python

Set admin/bootstrap values as documented in the backend README. Use `npm ci` and `npm start` on the backend, not `npm run local`. Seed/configure the production village service extent as Kothri Kalan; production does not use your ignored local database automatically. Use durable storage for uploads. Set backend proxy/IP handling for your hosting provider before accepting many public users. Keep secrets out of the frontend and GitHub.

CORS must allow the exact frontend origin. Preview URLs also require explicit backend origin configuration; do not broaden access with a wildcard. Verify forwarded Origin headers and HttpOnly cookie handling on the actual production hosts.

## Production verification

Check backend `/health` and `/ready`; then use the Vercel site for registration/login, refresh after reload, logout, profile, complaint submission/photo upload, map selection, Admin verification, automatic assignment, department evidence, resolution/closure, notifications and analytics. Test the sound with a user click. Verify the worker heartbeat and actual Python predictions. Imported map references do not prove field conditions or repairs.

## Current status

Frontend build and local configuration/API tests pass. This prepares the repository for Vercel; no production URL was created or tested. The local Python AI dependency permission problem is still outstanding. Hosting accounts, actual backend URL, Atlas credentials and service secrets must be configured before the complete system can work online.

Official references:
- https://vercel.com/docs/project-configuration/vercel-ts
- https://vercel.com/docs/routing/rewrites
