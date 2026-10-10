# Real Niwaru map

Open http://localhost:4000/#map and refresh once to load the updated application.

The default GIS view now displays public OpenStreetMap reference features for Niwaru and nearby streets in Jaipur. It includes two mapped schools (Wisdom Academy Sr. Secondary School and Saint Teresa's School) and 1,430 road segments. School buttons zoom to each site; markers and roads have source links. Layer checkboxes toggle visibility. Reset view returns to the area extent. Open demo Digital Twin retains the existing synthetic asset and complaint workspace.

The extract contains **zero street-light points**. This is missing map coverage, not evidence of no lights. Actual pole locations require a municipal GIS inventory or GPS survey; no coordinates are guessed.

Source: https://api.openstreetmap.org/api/0.6/map?bbox=75.695,26.960,75.733,26.990

Data downloaded 9 October 2026. Extent is west/south/east/north `[75.695,26.960,75.733,26.990]`, a viewport around Niwaru, not an official village boundary. Roads retain OSM way geometry. School site outlines use mean vertex coordinates for marker placement; this is labelled in the UI. OSM features have not been field verified. Condition and working status are unknown. Features are public reference data, separate from stored management assets and synthetic complaints.

© OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright

Processed extract: `smart-village-frontend/src/data/niwaru-osm.json`. Each record includes OSM type/ID, source URL, placement description and geometry. The user-facing counts represent this extract, not a complete municipal inventory. Road count represents segments, not distinct road names. Source names are rendered as text; road popup content is created with DOM textContent rather than injected source HTML.

Validation: frontend production build passed; browser verified the real-data page, school-location zoom and road-layer toggle. Existing backend database was not changed.
