# Gram — Village Portals & GIS Digital Twin

React + React Leaflet dashboard connected to the Express/MongoDB backend. The built frontend is served at **http://localhost:4000**.

## Features

- OpenStreetMap basemap, visible attribution, zoom/scale controls, and tile-error message.
- Village boundary, fit-to-boundary control, and layer toggles.
- Roads/drainage as lines; schools, health centre, water tanks, street lights, panchayat office, and community centre as markers.
- Complaint markers coloured by status, popups, and detail panel.
- Search, asset type, complaint category/status, and asset/complaint layer filters.
- Click-to-select and draggable complaint location, coordinate readout, client/server boundary validation.
- Citizen registration/login and real complaint submission to MongoDB.
- Asset mix, condition review list, complaint register, and counts computed from loaded records.

## Run or rebuild

Dependencies and a build are already installed. To restart, open PowerShell in `../smart-village-backend`, run `npm.cmd run local`, and open **http://localhost:4000**.

To rebuild frontend changes, from this folder:

```powershell
npm.cmd install
npm.cmd run build
```

`npm run dev` runs a build watcher. Keep the backend running and reload the browser after each completed build. This uses Rollup instead of Vite's dependency pre-bundler, which attempts to enumerate an inaccessible ancestor directory in this restricted Windows workspace. `--configLoader native` avoids the same issue during config loading. The watcher does not provide hot module replacement.

## Data and permissions

The initial view contains **13 synthetic assets, six sample complaints, and a synthetic boundary**, over a real OSM basemap. These are stored MongoDB records. They do not represent an official village survey; synthetic roads may not align with actual basemap roads.

The unauthenticated, read-only `/api/v1/demo/snapshot` endpoint is mounted only by the loopback development launcher. It returns only records flagged `isDemo:true`, without citizen identity. Production startup does not mount it. The demo seed is idempotent, operates only on the launcher-created synthetic village, and preserves existing seed records.

Click **Report an issue**, select a map point, and enter category/title/description. Create a citizen account or sign in to submit. Submission calls the protected API, stores a real application record, and generates history/notifications. Citizens see their own complaints, staff see assigned department complaints, and admins see village complaints. Boundary/assets remain synthetic until verified data replaces them.

Local admin credentials are in the backend's ignored `data/local/settings.json`. They are excluded from source, browser bundles, and ZIP files. JWT access tokens stay in browser memory; an HttpOnly refresh cookie restores sessions. Registration cannot grant privileged roles.

Complaint photos and staff resolution evidence can be uploaded from the portals. Admins can provision departments and staff. Asset editing remains available through the backend API. No predictive AI results are shown. Poor/critical asset flags reflect recorded conditions.

## GIS storage and tiles

MongoDB stores GeoJSON **[longitude, latitude]** with `2dsphere` indexes. The UI converts Point coordinates to Leaflet's latitude/longitude order. Assets support Point, LineString, Polygon, and MultiPolygon; complaints are Point. Boundaries are Polygon/MultiPolygon.

Tiles load directly in the browser with attribution and normal caching. No offline prefetching or bulk tile download is implemented. Follow the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Optional `VITE_TILE_URL` and `VITE_TILE_ATTRIBUTION` select another provider; update the backend CSP to allow its image origin too. Current CSP permits default OSM tiles and stylesheet font hosts.

Authenticated loading paginates up to 5,000 records and displays a truncation notice. Demo loading is capped at 500 records of each type. Larger datasets should use viewport-scoped map APIs and clustering.

## Verification

Production build passed. All 15 backend integration tests passed, including synthetic snapshot isolation. Browser checks verified OSM tiles, asset/complaint/status filters, marker details, map selection over roads, and disabled submission outside the boundary. Both dependency audits reported zero known vulnerabilities.

## Citizen, admin, and department portals

The app now includes registration/login pages, role-specific dashboards, a dedicated complaint submission page with private photo upload, complaint tracking timelines and workflow actions, editable profile names, notifications/read controls, and analytics charts. See the sibling `PORTAL_GUIDE.md` for instructions and local demo account setup.

Browser verification completed a labelled temporary complaint through citizen submission, admin verification/assignment, staff evidence/resolution, and admin closure. It also verified registration, profile save, notification read, session restoration, and chart filters. Temporary QA data was removed.

The local settings file now includes generated citizen and staff credentials alongside admin credentials. It remains excluded from source archives and browser bundles.
