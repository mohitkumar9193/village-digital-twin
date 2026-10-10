# Borkeda / Bor Kheda village map

The default real map is now Bor Kheda in Ashta Tahsil, Sehore, Madhya Pradesh. Open http://localhost:4000/#map and refresh. A village selector retains the Niwaru reference view.

Location source: https://www.openstreetmap.org/node/11347056742

OSM village point: latitude 23.109609, longitude 76.8171264. Nominatim matched the village name and Ashta Tahsil/Sehore administrative context. The marker is the mapped settlement point; it is not a panchayat office or official boundary.

Public data source: https://api.openstreetmap.org/api/0.6/map?bbox=76.802,23.094,76.832,23.125

Extract retrieved 9 October 2026. It contains seven mapped road segments and no mapped school, hospital/clinic, panchayat/town hall, water tower/water tank, or street-light points. Missing records do not mean the facilities do not exist. All six requested layer categories appear in the map controls, with counts and explicit missing-location notices. Condition and operating status are unknown.

To add actual missing infrastructure, provide facility names and Google Maps links/GPS latitude and longitude, or a municipal/panchayat GIS inventory. Photos alone cannot reliably identify a location. No positions are inferred from the Mahodiya screenshot.

Road shapes preserve OpenStreetMap geometry. Facility extraction checks amenity/healthcare/man_made tags and panchayat names; this is not a complete municipal asset registry. The viewport is a rectangular area around the village, not a legal or surveyed boundary. Imported features remain a public reference overlay; authenticated management records and synthetic complaints are retained separately in the demo workspace.

Processed dataset: smart-village-frontend/src/data/borkheda-osm.json. © OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright
