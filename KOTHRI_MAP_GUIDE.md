# Kothri Kalan real map

Open http://localhost:4000/#map and refresh. Kothri Kalan is the default selected area; Bor Kheda and Niwaru remain in the village selector.

Village location: latitude 23.0739629, longitude 76.8297921. Source: https://www.openstreetmap.org/node/11344866820

Public extract: https://api.openstreetmap.org/api/0.6/map?bbox=76.807,23.050,76.855,23.092

Downloaded 9 October 2026. The area includes Kothri Kalan and nearby roads/campus facilities; it is not an official village boundary. All imported features retain their source OSM IDs and links.

Available: 44 road segments, PHC Kothri (a mapped primary health centre), five college/university points including VIT Bhopal facilities, and 13 other mapped landmarks such as fuel stations, worship, parks/sports grounds, restaurants and shops. Higher-education facilities are listed separately from schools. The public extract has zero school, street-light, water-tank and panchayat-office points. Absence from OSM is not evidence of absence on the ground; exact Google Maps links, GPS coordinates or official inventories are required for additional facility markers.

The screenshot is a Google Maps view. This application uses a licensed OpenStreetMap basemap and dataset; Google-only POI labels are not copied as guessed markers. Features are community mapped and not field verified. Operating status and condition are unknown. The village marker is a settlement point, not a panchayat office. Site-outline markers are derived from mean vertex coordinates and labelled accordingly. Management assets and synthetic complaints remain in the demo workspace.

Data: `smart-village-frontend/src/data/kothri-osm.json`. © OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright

## Village-only update
VIT Bhopal and all five campus education markers have been removed. The map now uses a tighter village-focused viewport [76.819,23.066,76.842,23.081], excluding campus shops, restaurants and grounds. Road geometry is clipped to this viewport. This is a display extent, not a surveyed boundary. Current counts and facilities are shown in the map; earlier extract totals above describe the original wider area.

## Shared search links update
Added six named schools, Gram Panchayat Office and Nagar Parishad Kothri using individual place coordinates visible in the user-shared Google Maps search results. Each marker retains its Google Maps source link and a not-field-verified label; it is separate from OSM-derived geometry. The viewport extends north to 23.087 to include Sanskar Public Academy without including VIT campus. The tank search returns tanks near Sehore (approximately 23.20,77.07), unrelated warehouses, and a cement supplier; none identifies an actual Kothri village tank. These results were not imported as a village water tank. Street-light coordinates are still unavailable.

## Unified GIS and complaint location — 9 October 2026
GIS and complaint selection now both use Kothri Kalan sourced infrastructure. The local database village service extent is synchronized from the same Kothri dataset bbox at startup. This rectangle is an application extent, not an official boundary. Existing reports and demo assets retain original coordinates; old demo assets are omitted from new complaint selection. GIS shows permitted non-demo complaints within this extent. Frontend build and live MongoDB Kothri acceptance / Jaipur rejection passed. Full API suite could not start its isolated MongoDB instance (mongod fassert startup failure).
