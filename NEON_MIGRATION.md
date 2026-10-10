# Preserve existing MongoDB data when moving to Neon

The default Vercel deployment uses PostgreSQL. Fresh `bootstrap:neon` creates an empty complaint workspace. If you want your existing accounts, complaints, tracking numbers, timelines, notifications, sessions, departments, GIS assets, AI records and private photos, migrate instead.

1. Back up your original MongoDB database and upload directory. Stop API writes during migration so records and evidence remain consistent.
2. Create an empty Neon database. Do not bootstrap it first; the migration refuses a nonempty target.
3. Install backend dependencies (`npm ci --prefix smart-village-backend`). In an ignored backend `.env`, set both `MONGODB_URI` (source) and `DATABASE_URL` (Neon destination), plus `UPLOAD_DIR` pointing to the source private photos.
4. From `smart-village-backend`, run `node scripts/migrate-neon.js`.
5. The importer copies all records and photo bytes inside one PostgreSQL transaction; a missing image or invalid record rolls back the target. It preserves existing IDs and password hashes. It never changes or deletes the MongoDB source.
6. Use your existing village ID for Vercel `VILLAGE_ID`. Keep the JWT issuer/audience defaults, sign in again, and follow the deployment live checklist.

Do not paste connection strings or local settings.json into chat/GitHub. Existing demo flags and boundaries are preserved; an old Niwaru synthetic village is not automatically relabelled as Kothri. Check the configured village/boundary as Admin before reopening citizen submissions. The separately sourced Kothri GIS view still uses its existing map dataset.

Live MongoDB-to-Neon transfer has not been run against your private records: no Neon credentials were supplied. The migration script is available for that setup step.
