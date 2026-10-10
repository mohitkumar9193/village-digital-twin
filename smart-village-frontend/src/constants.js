export const assetTypes = {
  road: { label: 'Roads', symbol: '↔', color: '#738699' },
  school: { label: 'Schools', symbol: '▤', color: '#6958c2' },
  hospital: { label: 'Health centres', symbol: '+', color: '#d56c72' },
  water_tank: { label: 'Water tanks', symbol: '◉', color: '#3993c4' },
  street_light: { label: 'Street lights', symbol: '☀', color: '#c49435' },
  drainage: { label: 'Drainage', symbol: '≈', color: '#4b9f94' },
  panchayat_office: { label: 'Panchayat offices', symbol: '▥', color: '#57845b' },
  community_center: { label: 'Community centres', symbol: '⌂', color: '#a77453' },
  government_building: { label: 'Government buildings', symbol: '▥', color: '#57845b' },
  education: { label: 'Colleges & universities', symbol: '▤', color: '#596cb9' },
  other: { label: 'Other landmarks', symbol: '◆', color: '#7a8790' },
};
export const statusColors = { submitted: '#cf8d33', verified: '#8b79bb', assigned: '#5795bc', in_progress: '#dc7653', resolved: '#4a9976', closed: '#748780', rejected: '#ba6870', reopened: '#cf8d33' };
export const categories = ['roads', 'water', 'electricity', 'sanitation', 'drainage', 'street_lights', 'other'];
export const label = value => (value || '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const isOpen = complaint => !['resolved', 'closed', 'rejected'].includes(complaint.status);
export function insideBoundary(coordinates, boundary) {
  if (!boundary) return true;
  function insideRing(ring) {
    let inside = false; const [x, y] = coordinates;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const polygons = boundary.type === 'MultiPolygon' ? boundary.coordinates : [boundary.coordinates];
  return polygons.some(rings => insideRing(rings[0]) && !rings.slice(1).some(insideRing));
}
