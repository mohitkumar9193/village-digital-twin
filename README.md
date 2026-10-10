# Smart Village Digital Twin

A village services portal for Kothri Kalan, Ashta, Sehore, Madhya Pradesh.

## Deploy

Use **one Vercel project + Neon PostgreSQL**. Frontend, Express API, and trained AI inference share the Vercel project. Follow [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for database initialization, required secrets, and live testing. Import the repository root, not an individual application folder.

## Features

- Citizen registration, profiles, complaints, photos and status tracking
- Admin verification, department assignment, team management and closure review
- Department work queues, progress updates and private repair evidence
- Leaflet/OpenStreetMap GIS with sourced village facilities
- Notifications, analytics and an opt-in resolution sound
- Automatic routing after verification, urgent alerts and overdue reminders
- AI priority recommendations; exported Scikit-learn forest runs inside Node

## Structure

- `api/index.js`: Vercel serverless Express entry point
- `smart-village-frontend`: React/Vite UI
- `smart-village-backend`: API, PostgreSQL adapter, authorization and private image storage
- `smart-village-ai`: Python training, original model, and Node export script
- `vercel.json`: root build, API rewrites and daily reminder cron

Neon uses parameterized SQL, JSONB records, unique indexes and serializable transactions. Existing Mongoose schemas remain as validators and ID/date casters; no MongoDB server is needed for the Neon deployment. Legacy local MongoDB mode remains available through Start-Project.ps1. To preserve its saved records, use [NEON_MIGRATION.md](NEON_MIGRATION.md).

## Verify locally

```powershell
npm ci --prefix smart-village-backend
npm run test:neon --prefix smart-village-backend
npm ci --prefix smart-village-frontend
npm run build --prefix smart-village-frontend
node --test smart-village-frontend/test/deployment.test.js
```

Tests use disposable PostgreSQL fixtures, not real citizen data. Vercel mode checks automation on API activity and a daily secured cron rather than a continuous worker. AI is trained/evaluated on synthetic labels. Map facilities are sourced references, not field-verified assets; the configured extent is not an official village boundary. Software cannot perform physical repairs or confirm them automatically.

Secrets, local database files, and private uploaded photos are excluded from Git. Pushing this repository does not create a public deployment; Neon and Vercel environment configuration must be completed first.
