import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/theme/map-tokens.css';
import '../src/theme/controls.css';
import '../src/theme/panel.css';
import '../src/theme/measure.css';
import { createMap, buildStyle, readTokens, ATTRIBUTION, useBasemap, addDataLayer, mountLayerPanel, setLayerVisible,
  trafficLayer, installTrafficIcons, mountMeasureBar } from '../src/index.js';

const q = new URLSearchParams(location.search);
const BASEMAP = q.get('basemap') ?? import.meta.env.VITE_BASEMAP_URL ?? '/data/california.pmtiles';
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
  addDataLayer(map, {
    id: 'naip', name: 'Aerial photos', group: 'imagery', visible: false,
    source: { type: 'raster', url: 'pmtiles://' + abs('/data/union-city-naip.pmtiles'), tileSize: 512,
      attribution: 'Aerial photos: USDA NAIP 2022' },
    layers: [{ id: 'naip-raster', type: 'raster', source: 'naip' }],
  });
  // Traffic control (signals, signs, crosswalks, lanes, speed, bike lanes, bus stops), from scripts/get-traffic.mjs.
  const tokens = readTokens();
  const trafficUrl = 'pmtiles://' + abs(q.get('traffic') ?? '/data/traffic.pmtiles');
  installTrafficIcons(map, tokens);
  addDataLayer(map, { ...trafficLayer(tokens, variant, trafficUrl),
    restyle: (v) => trafficLayer(tokens, v, trafficUrl).layers });
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
