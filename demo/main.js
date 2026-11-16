import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/theme/map-tokens.css';
import '../src/theme/controls.css';
import '../src/theme/panel.css';
import '../src/theme/measure.css';
import { PLACES } from './places.js';
import { dataUrl } from './urls.js';
import { createMap, buildStyle, readTokens, ATTRIBUTION, useBasemap, addDataLayer, mountLayerPanel, setLayerVisible,
  mountMeasureBar } from '../src/index.js';

const q = new URLSearchParams(location.search);
const env = { dev: import.meta.env.DEV, origin: location.origin };
const BASEMAP = dataUrl(q.get('basemap'), import.meta.env.VITE_BASEMAP_URL ?? '/data/california.pmtiles', env);
const variant = q.get('variant') ?? 'night';
const center = q.get('center')?.split(',').map(Number);
const zoom = q.has('zoom') ? Number(q.get('zoom')) : undefined;
const pitch = q.has('pitch') ? Number(q.get('pitch')) : 0;

document.getElementById('map').dataset.mapVariant = variant;
const abs = (u) => new URL(u, location.href).href;
const styleFor = (v) => buildStyle(readTokens(), v, { basemapUrl: 'pmtiles://' + abs(BASEMAP), attribution: ATTRIBUTION });
const map = await createMap({
  container: document.getElementById('map'),
  basemapUrl: BASEMAP,
  style: (url) => styleFor(variant),
  hash: true,
  ...(center ? { center } : {}), ...(zoom !== undefined ? { zoom } : {}),
});
window.__map = map;
if (map) {
  useBasemap(map, styleFor, variant);
  // Satellite: USGS National Map imagery for all of California underneath (free, public domain, sharp to zoom 16),
  // and our own crisp 0.6 m NAIP road-corridor files on top where we have them (transparent elsewhere).
  // ?photos=a.pmtiles,b.pmtiles overrides the crisp files (each checked like any link address).
  const crisp = q.has('photos')
    ? q.get('photos').split(',').map((u) => dataUrl(u, '/data/union-city-naip.pmtiles', env))
    : (import.meta.env.VITE_PHOTOS_URLS ?? '/data/union-city-naip.pmtiles').split(',');
  addDataLayer(map, {
    id: 'satellite', name: 'Satellite', group: 'imagery', visible: false,
    sources: {
      'sat-usgs': { type: 'raster', tileSize: 256, maxzoom: 16,
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagery: USGS The National Map, USDA NAIP' },
      ...Object.fromEntries(crisp.map((u, i) => [`sat-crisp-${i}`, { type: 'raster', url: 'pmtiles://' + abs(u), tileSize: 512,
        attribution: 'Aerial photos: USDA NAIP 2022' }])),
    },
    layers: [{ id: 'sat-usgs', type: 'raster', source: 'sat-usgs' },
      ...crisp.map((_, i) => ({ id: `sat-crisp-${i}`, type: 'raster', source: `sat-crisp-${i}` }))],
  });
  const tokens = readTokens();
  const panel = document.createElement('div');
  map.getContainer().appendChild(panel);
  mountLayerPanel(map, panel);
  const bar = document.createElement('div');
  map.getContainer().appendChild(bar);
  const measure = mountMeasureBar(map, bar, { colors: (v) => ({ color: tokens[`--map-${v}-measure`],
    halo: tokens[`--map-${v}-label-halo`] }) });
  Object.defineProperty(window, '__measure', { get: () => measure.current() });
  // ?layers=naip,... turns layers on at load (handy for links and screenshots).
  for (const id of q.get('layers')?.split(',') ?? []) setLayerVisible(map, id, true);
}
if (map && pitch) map.setPitch(pitch);
map?.on('idle', () => { window.__mapIdle = true; });
// First idle, in ms since navigation started: the phone timing gate reads it.
map?.once('idle', () => { window.__mapIdleAt = performance.now(); });
// MapLibre 6 can fire its first idle while createMap is still resolving, before the lines above run; a still map
// then never fires another. One more redraw guarantees an idle after we start listening.
map?.triggerRepaint();

// "Go to": the three test places (no search yet).
if (map) {
  const label = document.createElement('label');
  label.className = 'aitt-goto';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Go to');
  select.append(new Option('Go to…', ''), ...PLACES.map((p) => new Option(p.name, p.id)));
  select.addEventListener('change', () => {
    const p = PLACES.find((x) => x.id === select.value);
    if (p) map.jumpTo({ center: p.center, zoom: p.zoom, pitch: 0, bearing: 0 });
    select.value = '';
  });
  label.append(select);
  map.getContainer().appendChild(label);
}
