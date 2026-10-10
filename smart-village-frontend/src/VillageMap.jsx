import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, ZoomControl, useMap, useMapEvents, ScaleControl } from 'react-leaflet';
import { assetTypes, statusColors, label } from './constants.js';
function pin(kind, color, symbol) {
  return L.divIcon({ className: 'custom-marker', html: `<div class="map-pin ${kind}" style="--pin-color:${color}">${symbol}</div>`, iconSize: [34, 38], iconAnchor: [17, 35], popupAnchor: [0, -30] });
}
function Viewport({ boundary, selected, home }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (boundary) map.fitBounds(L.geoJSON(boundary).getBounds(), { padding: [35, 35], maxZoom: 16 });
  }, [boundary, home, map]);
  useEffect(() => {
    if (!selected) return;
    const geometry = selected.kind === 'asset' ? selected.record.geometry : selected.record.location;
    if (geometry.type === 'Point') map.flyTo([geometry.coordinates[1], geometry.coordinates[0]], 17, { duration: 0.6 });
    else map.fitBounds(L.geoJSON(geometry).getBounds(), { padding: [60, 60], maxZoom: 17 });
  }, [selected, map]);
  return null;
}
function Picker({ enabled, onPick }) {
  const map = useMapEvents({ click(event) { if (enabled) onPick([event.latlng.lng, event.latlng.lat]); } });
  useEffect(() => { map.getContainer().style.cursor = enabled ? 'crosshair' : ''; if (enabled) map.closePopup(); }, [enabled, map]);
  return null;
}
export default function VillageMap({ village, assets, complaints, selected, onSelect, picking, picked, onPick, home, showBoundary }) {
  const [tileFailed, setTileFailed] = useState(false);
  const pickedIcon = useMemo(() => pin('selection', '#173e32', '＋'), []);
  return <>
    <MapContainer center={village?.boundary ? [village.boundary.coordinates[0][0][1], village.boundary.coordinates[0][0][0]] : [23.0739629, 76.8297921]} zoom={15} zoomControl={false} className="village-map" aria-label="Interactive village infrastructure and complaints map">
      <TileLayer url={import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution={import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} maxZoom={19} eventHandlers={{ tileerror: () => setTileFailed(true), tileload: () => setTileFailed(false) }} />
      <ZoomControl position="bottomright" /><ScaleControl position="bottomleft" imperial={false} />
      <Viewport boundary={village?.boundary} selected={selected} home={home} />
      <Picker enabled={picking} onPick={onPick} />
      {showBoundary && village?.boundary && <GeoJSON key={JSON.stringify(village.boundary)} data={village.boundary} interactive={false} style={{ color: '#32775d', weight: 2, dashArray: '7 6', fillColor: '#83b78f', fillOpacity: 0.06 }} />}
      {assets.map(asset => {
        const type = assetTypes[asset.assetType] || assetTypes.other;
        const events = { click: () => !picking && onSelect({ kind: 'asset', record: asset }) };
        if (asset.geometry.type !== 'Point') return <GeoJSON key={`${asset._id}-${picking}`} data={asset.geometry} interactive={!picking} style={{ color: type.color, weight: selected?.record._id === asset._id ? 8 : 5, opacity: 0.9 }} eventHandlers={events}><Popup><strong>{asset.name}</strong><p>{label(asset.condition)} condition{asset.isDemo ? ' · Demo asset' : ''}</p></Popup></GeoJSON>;
        return <Marker key={asset._id} position={[asset.geometry.coordinates[1], asset.geometry.coordinates[0]]} icon={pin('asset', type.color, type.symbol)} eventHandlers={events}><Popup><strong>{asset.name}</strong><p>{label(asset.condition)} condition{asset.isDemo ? ' · Demo asset' : ''}</p></Popup></Marker>;
      })}
      {complaints.map(complaint => <Marker key={complaint._id} position={[complaint.location.coordinates[1], complaint.location.coordinates[0]]} icon={pin('complaint', statusColors[complaint.status] || '#748780', '!')} eventHandlers={{ click: () => !picking && onSelect({ kind: 'complaint', record: complaint }) }}><Popup><strong>{complaint.title}</strong><p>{label(complaint.status)} · {label(complaint.priority)} priority</p>{complaint.isDemo && <small>Synthetic demonstration report</small>}</Popup></Marker>)}
      {picked && <Marker position={[picked[1], picked[0]]} icon={pickedIcon} draggable eventHandlers={{ dragend: event => { const ll = event.target.getLatLng(); onPick([ll.lng, ll.lat]); } }}><Popup>Selected complaint location. Drag to adjust.</Popup></Marker>}
    </MapContainer>
    {tileFailed && <div className="tile-warning">Basemap tiles could not load. Your infrastructure layers remain available. Check your internet connection.</div>}
  </>;
}
