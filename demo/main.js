import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/theme/map-tokens.css';
import '../src/theme/controls.css';
import '../src/theme/panel.css';
import '../src/theme/measure.css';
import { PLACES } from './places.js';
import { dataUrl } from './urls.js';
import { createMap, buildStyle, readTokens, ATTRIBUTION, useBasemap, addDataLayer, mountLayerPanel, setLayerVisible,
  mountMeasureBar, trafficLayer, installTrafficIcons, basemapVariant } from '../src/index.js';

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
let addRoadDetails = () => {};
let detailsAdded = !map;
if (map) {
  useBasemap(map, styleFor, variant);
  const tokens = readTokens();
  // Road details for all four apps: signals, stop and yield signs, crosswalks, lane and speed labels, bike lanes and
  // bus stops (data/traffic.pmtiles, npm run traffic). ?traffic=<file> overrides it (checked like any link address).
  const trafficUrl = 'pmtiles://' + abs(dataUrl(q.get('traffic'), import.meta.env.VITE_ROAD_DETAILS_URL ?? '/data/traffic.pmtiles', env));
  // Added just after the base map first appears, so the first view stays fast on a phone (the 2 s gate); the details
  // fill in a moment later. ?layers=<id>,... turns layers on at load (handy for links and screenshots).
  addRoadDetails = () => {
    installTrafficIcons(map, tokens);
    addDataLayer(map, { ...trafficLayer(tokens, basemapVariant(map), trafficUrl),
      restyle: (v) => trafficLayer(tokens, v, trafficUrl).layers });
    for (const id of q.get('layers')?.split(',') ?? []) setLayerVisible(map, id, true);
    detailsAdded = true;
    map.triggerRepaint();
  };
  const panel = document.createElement('div');
  map.getContainer().appendChild(panel);
  mountLayerPanel(map, panel);
  const bar = document.createElement('div');
  map.getContainer().appendChild(bar);
  const measure = mountMeasureBar(map, bar, { colors: (v) => ({ color: tokens[`--map-${v}-measure`],
    halo: tokens[`--map-${v}-label-halo`] }) });
  Object.defineProperty(window, '__measure', { get: () => measure.current() });
}
if (map && pitch) map.setPitch(pitch);
// "Ready" for tests and screenshots: idle with the road details on the map.
map?.on('idle', () => { if (detailsAdded) window.__mapIdle = true; });
// First idle, in ms since navigation started: the phone timing gate reads it. Then the road details go on.
map?.once('idle', () => { window.__mapIdleAt = performance.now(); addRoadDetails(); });
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
