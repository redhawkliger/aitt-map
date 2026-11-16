import length from '@turf/length';
import area from '@turf/area';

const FT_PER_M = 1 / 0.3048;
const SQFT_PER_ACRE = 43560;
const FT_PER_MI = 5280;

// Drop repeated neighbouring points (a double tap on one spot) so a line of one real point measures 0.
function clean(coords) {
  return (coords ?? []).filter((c, i, a) => i === 0 || c[0] !== a[i - 1][0] || c[1] !== a[i - 1][1]);
}

/** Geodesic length of a line in feet. Fewer than two distinct points gives 0. */
export function distanceFt(coords) {
  const c = clean(coords);
  if (c.length < 2) return 0;
  const km = length({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }, { units: 'kilometers' });
  return Number.isFinite(km) ? km * 1000 * FT_PER_M : 0;
}

/** Geodesic area of a ring (open or closed) in square feet. Fewer than three distinct points gives 0. */
export function areaSqFt(ring) {
  let c = clean(ring);
  if (c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c = c.slice(0, -1);
  if (c.length < 3) return 0;
  const sqm = area({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...c, c[0]]] } });
  return Number.isFinite(sqm) ? sqm * FT_PER_M * FT_PER_M : 0;
}

/** The measured value in the chosen units: feet or metres, square feet or square metres. */
export function measureValue(coords, mode, units = 'ft') {
  const ft = mode === 'area' ? areaSqFt(coords) : distanceFt(coords);
  if (units !== 'm') return ft;
  return mode === 'area' ? ft / (FT_PER_M * FT_PER_M) : ft / FT_PER_M;
}

const int = (v) => Math.round(v).toLocaleString('en-US');

/** The live readout text. */
export function formatMeasure(value, mode, units = 'ft') {
  if (units === 'm') {
    if (mode === 'area') return value >= 10000 ? `${(value / 10000).toFixed(2)} ha` : `${int(value)} m²`;
    return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${int(value)} m`;
  }
  if (mode === 'area') return value >= SQFT_PER_ACRE ? `${(value / SQFT_PER_ACRE).toFixed(2)} acres` : `${int(value)} sq ft`;
  if (mode === 'distance' && value >= FT_PER_MI) return `${int(value)} ft (${(value / FT_PER_MI).toFixed(2)} mi)`;
  return `${int(value)} ft`;
}
