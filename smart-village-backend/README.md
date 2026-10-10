# Smart Village — Phase 3 Backend

Node.js/Express REST API with MongoDB, JWT authentication, citizen/admin/department-staff roles, complaint lifecycle, public assets, private evidence images, in-app notifications, GIS queries, and database-derived analytics.

**Validation status:** All 15 database-backed integration tests passed, including demo snapshot isolation. The frontend production build and browser map checks also passed. Dependencies are installed, a package lockfile is included, and npm audit reports zero known vulnerabilities. No Atlas database has been connected. The local launcher runs a real MongoDB replica set with a synthetic village; it does not use production village data.

## Quick local run (no Atlas account required)

```powershell
npm.cmd install
npm.cmd run local
```

Open **http://localhost:4000** for the Digital Twin dashboard when the sibling frontend's `dist/` build is present. Without it, the backend welcome page is displayed. **/health** and **/ready** provide health/readiness. Protected APIs require login. See the frontend README for map controls and citizen reporting.

The local launcher downloads MongoDB on first use, runs it on local port 27018, and keeps its database in `data/local/mongodb`. It provisions a clearly labelled synthetic village, local admin, and idempotent GIS demo fixtures. Local credentials are generated into ignored `data/local/settings.json`; read it privately for admin login. A read-only snapshot returns only synthetic map records without citizen identity; it is not mounted in production. Local frontend refresh requests use Origin `http://localhost:4000`. Restart with the same command to retain data. This launcher is for development, not production.

## Requirements

- Node.js 22 or newer (source syntax was checked with Node 24).
- MongoDB Atlas or a local MongoDB replica set. A standalone MongoDB server is deliberately rejected because workflow updates require transactions.
- Network access for npm installation; the first test run also downloads a MongoDB test binary.
- Writable persistent disk for private image storage. Back up images along with MongoDB.

## Start on Windows

Open PowerShell inside this folder:

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Edit `.env` locally. Do not post credentials in chat or commit this file.

1. Set `MONGODB_URI` to your Atlas connection string or replica-set URI. Use a least-privilege database user and configure Atlas network access.
2. Generate a JWT secret: `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Save it as `JWT_SECRET`.
3. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12–72 UTF-8 bytes), and `VILLAGE_NAME`. Leave `VILLAGE_ID` blank for the bootstrap step.
4. Run `npm.cmd run bootstrap`. This atomically creates the village and initial admin; it never prints the password.
5. Copy the printed village ID into `VILLAGE_ID`. Remove `ADMIN_PASSWORD` from `.env` afterward.
6. Run `npm.cmd test`.
7. Run `npm.cmd run dev`, or `npm.cmd start` for a normal process.

Default API address: `http://localhost:4000`. Open `/health` for a simple JSON health response and `/ready` for database connection status. This backend does not have a visual dashboard yet; use an API client or the included HTTP examples.

The bootstrap refuses an existing admin email; it does not reset accounts or erase data. It creates a new village, so run it once for initial setup. Startup fails if environment configuration, database access, or replica-set configuration is invalid.

## Authentication

- Register with `name`, `email`, and `password`. Registration always creates a citizen in the configured village. Extra role/village fields are rejected.
- Log in with `email` and `password`.
- Send the returned access token as `Authorization: Bearer <token>` on protected routes.
- Access tokens expire after 15 minutes; refresh sessions after seven days.
- Refresh cookies are HttpOnly and SameSite=Strict; Secure in production. The API checks the current user and session on every authenticated request.
- `POST /auth/refresh` requires the exact configured `Origin` header and the refresh cookie. The browser client must use credentials-enabled requests. Refresh tokens rotate; replay revokes the session.
- Logout revokes the session immediately, including its access tokens. Password changes revoke all sessions.
- Citizen/admin/staff permissions are checked server-side and scoped to a village. Staff must have an active department.
- `staff` is the API role representing Department users. Staff within the assigned department can work the complaint; `assignedStaffId` is a routing reference, not an exclusive permission grant.
- Initial admins are created through bootstrap; admins provision staff through `/users`. Public admin registration and arbitrary role/department changes are unavailable.

Production should serve frontend and API under the same site through HTTPS so Strict cookies work. Configure `CORS_ORIGIN` to the exact frontend origin. If using a reverse proxy, explicitly configure Express trust-proxy for that trusted topology before deployment; do not indiscriminately trust all proxies.

## Endpoints

All endpoints below use `/api/v1`, except `/health` and `/ready`. A bearer token is required except registration, login, and cookie-based refresh.

### Auth

| Method | Path | Body / purpose |
|---|---|---|
| POST | `/auth/register` | `{name,email,password}`; citizen only |
| POST | `/auth/login` | `{email,password}` |
| POST | `/auth/refresh` | Refresh cookie + trusted Origin |
| GET | `/auth/me` | Current safe profile |
| PATCH | `/auth/me` | `{name}` |
| POST | `/auth/logout` | Revoke current session |
| POST | `/auth/logout-all` | Revoke every session |
| POST | `/auth/change-password` | `{currentPassword,newPassword}`; requires login again afterward |

### Complaints

| Method | Path | Role / body |
|---|---|---|
| POST | `/complaints` | Citizen; `{title,description,category,location,assetId?,areaId?}` |
| GET | `/complaints` | Own, department, or village scope; filters below |
| GET | `/complaints/:id` | Scoped detail |
| GET | `/complaints/:id/events` | Scoped paginated history |
| POST | `/complaints/:id/verify` | Admin; `{version,remarks?}` |
| POST | `/complaints/:id/reject` | Admin; `{version,remarks}` |
| POST | `/complaints/:id/assign` | Admin; `{version,departmentId,assignedStaffId?,remarks?}` |
| POST | `/complaints/:id/start` | Assigned department; `{version,remarks?}` |
| POST | `/complaints/:id/progress` | Assigned department; `{version,remarks}` |
| POST | `/complaints/:id/resolve` | Assigned department; `{version,remarks}` + previously uploaded evidence |
| POST | `/complaints/:id/close` | Admin; `{version,remarks?}` |
| POST | `/complaints/:id/reopen` | Admin; `{version,remarks}` |
| POST | `/complaints/:id/reopen-requests` | Owning citizen; `{version,remarks}`; creates request event, does not change status |
| PATCH | `/complaints/:id/priority` | Admin; `{version,priority,remarks}` |

Lifecycle: `submitted → verified → assigned → in_progress → resolved → closed`. Submitted/verified complaints may be rejected. Admins may reopen resolved/closed complaints and reassign verified/assigned/in-progress/reopened complaints. Staff must start work before resolving it.

All mutations require the current integer `version`; stale requests get HTTP 409. A complaint update, history event, and notifications commit in one MongoDB transaction. Assignment validates the department's supported categories and optional staff membership. Resolution requires an image from the current work cycle; reopening requires fresh evidence.

Categories: `roads`, `water`, `electricity`, `sanitation`, `drainage`, `street_lights`, `other`.

Priorities: `low`, `medium`, `high`, `critical`. The default `medium` is an administrative default, not an AI prediction.

List filters: `status`, `category`, `departmentId`, `areaId`, `page`, `limit`. Role scope cannot be overridden by filters. History and list endpoints use `{data,pagination:{page,limit,total}}`; default limit 20, maximum 100.

### Private images

| Method | Path | Purpose |
|---|---|---|
| POST | `/complaints/:id/attachments` | Multipart form with exactly one field named `image` |
| GET | `/complaints/:id/attachments` | Safe attachment metadata |
| GET | `/attachments/:id/download` | Scoped private JPEG download |

Citizens upload only while submitted; staff upload only while in progress. Maximum 5 MB input, 20 megapixels, and 20 images per complaint. Valid static JPEG/PNG/WebP files are decoded and re-encoded to JPEG with metadata removed and a maximum 2048-pixel side. File extensions alone are never trusted. No public upload directory is exposed.

Uploads increase complaint version; reload the complaint before the next status action. Disk writes are cleaned up if the database transaction fails. A process crash between file writing and record creation can leave an orphan file; production needs a periodic reconciliation job or object-storage adapter. Keep the upload directory on persistent storage.

### Users and departments

| Method | Path | Role / body |
|---|---|---|
| GET | `/users` | Admin; paginated village users |
| POST | `/users` | Admin; create staff `{name,email,password,departmentId}` |
| PATCH | `/users/:id` | Admin; update non-admin `{name?,isActive?}` |
| GET | `/departments` | Village department list |
| POST | `/departments` | Admin; `{name,categories}` |
| PATCH | `/departments/:id` | Admin; `{name?,categories?}` |
| GET | `/categories` | Fixed supported categories |
| GET | `/audit-logs` | Admin; paginated user/asset administration audit |

User password hashes are never returned. Admins cannot deactivate other admins through this API. Department reassignment of staff is intentionally absent until migration of active work is specified.

### Public assets

| Method | Path | Purpose |
|---|---|---|
| GET | `/assets` | Paginated village assets; `assetType`, `condition`, `isActive` filters |
| GET | `/assets/:id` | Village asset detail |
| POST | `/assets` | Admin create |
| PATCH | `/assets/:id` | Admin partial update/deactivate with `isActive:false` |

Creation fields: `assetCode`, `name`, `assetType`, `geometry`, `dataSource`; optional `condition`, `departmentId`, `lastInspectedAt` (ISO datetime), `isDemo`.

Asset types: `road`, `school`, `hospital`, `panchayat_office`, `water_tank`, `street_light`, `drainage`, `government_building`, `community_center`, `other`.

Conditions: `unknown`, `good`, `fair`, `poor`, `critical`. Asset codes are unique within a village. Assets are deactivated rather than hard-deleted to preserve references. Asset creation/updates write audit records in the same transaction.

### GIS

| Method | Path | Purpose |
|---|---|---|
| GET | `/villages/:id` | Own village metadata |
| GET | `/villages/:id/boundary` | Boundary or null with configured flag |
| PATCH | `/villages/:id/boundary` | Admin; `{boundary}` Polygon/MultiPolygon |
| GET | `/areas` | Village areas, capped at 500 |
| POST | `/areas` | Admin; `{name,dataSource,boundary?,isDemo?}` |
| PATCH | `/areas/:id` | Admin partial update |
| GET | `/map/assets?bbox=west,south,east,north` | GeoJSON FeatureCollection |
| GET | `/map/complaints?bbox=west,south,east,north` | Role-scoped GeoJSON FeatureCollection |

GeoJSON coordinates are **[longitude, latitude]**. Supported asset geometry: Point, LineString, Polygon, MultiPolygon. Complaint geometry: Point. Polygon rings must be closed. MongoDB geospatial indexes enforce additional geometry validity. Map results are capped at 500 features with `meta.truncated`; zoom in when truncated. Bounding boxes crossing the antimeridian are unsupported in this MVP.

When a village boundary is configured, new complaint locations must intersect it. When an area has a boundary, explicitly selected complaint area/location must agree. Without a configured boundary, coordinates are validated but village containment cannot be verified. Do not invent a real village boundary: import verified data. Existing complaints are not silently relocated when boundaries change. Assets are not automatically clipped or rejected at boundaries, since infrastructure may cross them.

### Notifications

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | Own paginated notifications; optional `unread=true/false` |
| PATCH | `/notifications/:id/read` | Mark own notification read |
| POST | `/notifications/read-all` | Mark all own notifications read |

Notifications are persisted in-app records, not SMS, email, push, or WebSockets. Complaint events notify the citizen, village admins, and currently assigned department staff. The frontend may poll this API.

### Analytics

Admin sees village scope; staff sees their department; citizens cannot access management analytics.

| GET endpoint | Output |
|---|---|
| `/analytics/summary` | Total, pending, in-progress, resolved, closed, rejected, complete status breakdown |
| `/analytics/categories` | Complaint counts per category |
| `/analytics/areas` | Complaint counts per selected area; unspecified bucket |
| `/analytics/trends?interval=week\|month` | Submission periods in Asia/Kolkata; absent periods are zero |
| `/analytics/departments` | Current department workload, resolved-or-closed fraction, average submission-to-resolution hours |
| `/analytics/density?cellSize=0.01` | Complaint counts in degree-based geographic grid cells |

Optional `from`/`to` are ISO timestamps and filter **submission date**, inclusively. Explicit ranges are limited to 366 days; with no date filters the summaries cover all records. Pending includes submitted/verified/assigned/reopened. Resolved and closed are distinct; rejected is excluded from pending. Department attribution uses current assignment, not historical effort. Density indicates reports, not population-adjusted risk or predicted danger.

## Tests

```powershell
npm.cmd test
```

The suite creates an ephemeral MongoDB replica set with synthetic fixtures, exercises real database transactions and HTTP handlers, and removes its database/private images afterward. It does not connect to your configured Atlas database. Cases cover privileged registration rejection, JWT/session revocation, refresh replay, citizen/department/village isolation, full complaint lifecycle and fresh evidence, simultaneous updates, asset geometry/partial updates, private uploads, notification ownership, analytics totals, and village containment.

The MongoDB binary download is cached under the thread's `work/mongodb-binaries` directory. It is already installed in this workspace. If downloads are blocked on another computer, tests fail during setup; that is not a passing result.

## Security and operational scope

Included: Helmet headers, request IDs, body/upload limits, validation, bcrypt, session revocation, rate limits, role/record authorization, private image retrieval, transactional complaint history and notifications, sanitized errors, and administrative audits for user/asset mutations.

Not included in Phase 3: React screens, Python AI integration, trained models, external notification providers, password recovery, IoT, deployment infrastructure, object storage, automatic orphan-file reconciliation, or automated backups. No fake AI results or demo production records are seeded.

JWT secrets, MongoDB credentials, and bootstrap passwords remain in local environment configuration. The source and ZIP exclude local credentials. Before production, configure HTTPS/persistent storage/backups and validate backup recovery. Use the included package lockfile with `npm ci` for reproducible installation.

## Source layout

```text
src/
  config.js        Validated environment configuration
  db.js            MongoDB connection and replica-set check
  models.js        Collections and indexes
  common.js        Validation, permissions, errors, pagination
  auth.js          JWT, refresh sessions, registration/login
  complaints.js    Transactional complaint lifecycle
  attachments.js   Private validated image storage
  resources.js     Assets, staff, departments, audit reads
  gis.js           Boundaries, areas, GeoJSON queries
  reporting.js     Notifications and analytics
  app.js           Express middleware/routes/error handling
  server.js        Startup and graceful shutdown
scripts/bootstrap.js
scripts/run-local.js
test/api.test.js
docs/requests.http
```

## Portal frontend

The sibling frontend now supplies citizen/admin/department dashboards, submission/photos, timelines/workflow controls, profile editing, notifications, and database-backed charts. See `../PORTAL_GUIDE.md`. Local settings contain generated login credentials for all three demo roles. Only the loopback launcher provisions these accounts; production registration remains citizen-only.
