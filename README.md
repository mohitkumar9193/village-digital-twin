# Smart Village Digital Twin

A village services portal for Kothri Kalan, Ashta, Sehore, Madhya Pradesh.

## Features

- Citizen registration, profiles, complaints and tracking
- Admin verification, department assignment and review
- Department progress updates and private repair evidence
- Leaflet/OpenStreetMap GIS with sourced village facilities
- Notifications, analytics and resolution alarm
- Automatic routing after verification, urgent alerts and overdue reminders
- Python AI priority recommendations trained on synthetic complaint data

## Project folders

- `smart-village-frontend`: React/Vite frontend
- `smart-village-backend`: Node/Express API and MongoDB models
- `smart-village-ai`: Python model training and FastAPI service

See each folder's documentation and PORTAL_GUIDE.md for setup. Install Node dependencies with `npm ci` in both Node project folders. Build the frontend using `npm run build`. Python dependencies are listed in the AI requirements.txt. MongoDB transactions require a replica set.

Local settings, database files, uploaded photos and secrets are excluded from Git. Never commit real credentials. The local launcher creates development accounts and stores credentials only in ignored backend data/local/settings.json.

## Validation and limitations

26 backend API tests passed in an isolated test database. The frontend production build passes. The current local Python service needs its dependency permission issue fixed before live predictions are available. AI training/evaluation uses synthetic data; recommendations require human review. Facilities are sourced map references, not field-verified assets. Response deadlines and notifications do not establish real repairs or government integration.

This repository contains source code; pushing it does not deploy a public website.

## Deploy the frontend on Vercel

See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md). Import this repository, select root directory `smart-village-frontend`, and set `BACKEND_ORIGIN` to your separately hosted Express HTTPS origin. The config forwards API calls through the frontend origin. The Node backend, MongoDB replica set/Atlas, durable uploads and Python AI service are hosted separately.
