import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/theme/map-tokens.css';
import '../src/theme/controls.css';
import { createMap, buildStyle, readTokens, ATTRIBUTION } from '../src/index.js';

const q = new URLSearchParams(location.search);
const BASEMAP = q.get('basemap') ?? import.meta.env.VITE_BASEMAP_URL ?? '/data/california.pmtiles';
const variant = q.get('variant') ?? 'night';
const center = q.get('center')?.split(',').map(Number);
const zoom = q.has('zoom') ? Number(q.get('zoom')) : undefined;
const pitch = q.has('pitch') ? Number(q.get('pitch')) : 0;

document.getElementById('map').dataset.mapVariant = variant;
const map = await createMap({
  container: document.getElementById('map'),
  basemapUrl: BASEMAP,
  style: (url) => buildStyle(readTokens(), variant, { basemapUrl: 'pmtiles://' + url, attribution: ATTRIBUTION }),
  hash: true,
  ...(center ? { center } : {}), ...(zoom !== undefined ? { zoom } : {}),
});
window.__map = map;
if (map && pitch) map.setPitch(pitch);
map?.on('idle', () => { window.__mapIdle = true; });
