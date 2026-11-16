// Traffic playback test: made-up vehicles driving the real road network, coloured by speed.
// This is DEMO DATA. A real run would play back simulation output instead
// (Vissim vehicle records .fzp, or SUMO floating-car output), converted to lng/lat.
import './main.js';

const R = 6371008.8, RAD = Math.PI / 180;
const MPH = 2.23694;
const COLORS = { slow: '#FF3B30', mid: '#FFB000', fast: '#2BD65A' };
const speedColor = ['step', ['get', 'mph'], COLORS.slow, 25, COLORS.mid, 45, COLORS.fast];

while (!window.__map) await new Promise((r) => setTimeout(r, 50));
const map = window.__map;
await new Promise((r) => (map.loaded() ? r() : map.once('idle', r)));

let lat0 = map.getCenter().lat;
const kx = () => R * RAD * Math.cos(lat0 * RAD), ky = R * RAD;
const toXY = ([lng, lat]) => [lng * kx(), lat * ky];
const toLL = ([x, y]) => [x / kx(), y / ky];

let links = [];
let cars = [];
const COUNT = Number(new URLSearchParams(location.search).get('cars') ?? 700);

function buildLinks() {
  lat0 = map.getCenter().lat;
  const seen = new Set();
  links = [];
  for (const f of map.querySourceFeatures('basemap', { sourceLayer: 'roads' })) {
    const { kind, kind_detail: detail, oneway } = f.properties;
    if (kind !== 'highway' && kind !== 'major_road') continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const part of parts) {
      const key = part[0].join() + part[part.length - 1].join();
      if (seen.has(key) || part.length < 2) continue;
      seen.add(key);
      const pts = part.map(toXY);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const len = cum[cum.length - 1];
      if (len < 120) continue;
      const freeway = kind === 'highway' && !String(detail).endsWith('_link');
      links.push({ pts, cum, len, freeway, oneway: oneway === 'yes', v0: freeway ? 29 : kind === 'highway' ? 18 : 16, mph: [] });
    }
  }
}

function spawn(c = {}) {
  // Weight by length, and freeways x3, so traffic sits where it would.
  const total = links.reduce((a, l) => a + l.len * (l.freeway ? 3 : 1), 0);
  let r = Math.random() * total, link = links[0];
  for (const l of links) { r -= l.len * (l.freeway ? 3 : 1); if (r <= 0) { link = l; break; } }
  c.link = link;
  c.dir = link.oneway || Math.random() < 0.5 ? 1 : -1;
  c.s = Math.random() * link.len;
  c.lane = link.freeway ? Math.floor(Math.random() * 4) : Math.floor(Math.random() * 2);
  c.jitter = 0.85 + Math.random() * 0.3;
  return c;
}

function at(link, s) {
  const { pts, cum } = link;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
  const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, dx: (bx - ax) / seg, dy: (by - ay) / seg };
}

// Speed field: freeways carry stop-and-go waves that travel upstream; arterials pulse like signals.
function speed(c, p, t) {
  const l = c.link;
  if (l.freeway) {
    const wave = 0.5 + 0.5 * Math.sin(t * 0.35 + (p.x + p.y) / 900 * c.dir);
    return l.v0 * c.jitter * (0.18 + 0.82 * wave ** 2);
  }
  const signal = Math.sin(t * 0.5 + c.s / 140);
  return l.v0 * c.jitter * (signal > 0.55 ? 0.08 : 0.55 + 0.45 * (1 - Math.abs(signal)));
}

function carPolygon(x, y, dx, dy, len = 4.6, wid = 2) {
  const ux = dx * dir1(dx, dy), uy = dy * dir1(dx, dy);
  const nx = -uy, ny = ux;
  const corners = [[len / 2, wid / 2], [len / 2, -wid / 2], [-len / 2, -wid / 2], [-len / 2, wid / 2]]
    .map(([a, b]) => toLL([x + ux * a + nx * b, y + uy * a + ny * b]));
  return [[...corners, corners[0]]];
}
const dir1 = (dx, dy) => 1 / (Math.hypot(dx, dy) || 1);

const empty = { type: 'FeatureCollection', features: [] };
function addLayers() {
  if (map.getSource('sim-cars')) return;
  map.addSource('sim-cars', { type: 'geojson', data: empty });
  map.addSource('sim-links', { type: 'geojson', data: empty });
  map.addLayer({ id: 'sim-links', type: 'line', source: 'sim-links', layout: { 'line-cap': 'round', visibility: linksOn ? 'visible' : 'none' },
    paint: { 'line-color': speedColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 14], 'line-opacity': 0.45, 'line-blur': 2 } });
  map.addLayer({ id: 'sim-dots', type: 'circle', source: 'sim-cars', maxzoom: 16,
    paint: { 'circle-color': speedColor, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.6, 16, 4.5],
      'circle-stroke-color': '#000', 'circle-stroke-width': 0.6, 'circle-pitch-alignment': 'map' } });
  map.addLayer({ id: 'sim-cars-3d', type: 'fill-extrusion', source: 'sim-cars', minzoom: 16,
    paint: { 'fill-extrusion-color': speedColor, 'fill-extrusion-height': 1.5, 'fill-extrusion-base': 0.3, 'fill-extrusion-opacity': 0.95 } });
}

let running = true, linksOn = true, last = performance.now(), t = 0, frame = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && links.length) {
    t += dt;
    const feats = [];
    for (const l of links) l.mph.length = 0;
    for (const c of cars) {
      let p = at(c.link, c.s);
      const v = speed(c, p, t);
      c.s += v * dt * c.dir;
      if (c.s < 0 || c.s > c.link.len) { spawn(c); p = at(c.link, c.s); }
      p = at(c.link, c.s);
      const sdx = p.dx * c.dir, sdy = p.dy * c.dir;
      // Keep right: lanes sit to the right of the direction of travel.
      const off = (c.link.oneway ? 1.8 + c.lane * 3.6 - (c.link.freeway ? 5.4 : 0) : 2 + c.lane * 3.4);
      const x = p.x + sdy * off, y = p.y - sdx * off;
      const mph = Math.round(v * MPH);
      c.link.mph.push(mph);
      feats.push({ type: 'Feature', properties: { mph }, geometry: { type: 'Polygon', coordinates: carPolygon(x, y, sdx, sdy) } });
    }
    map.getSource('sim-cars')?.setData({ type: 'FeatureCollection', features: feats });
    if (linksOn && frame++ % 15 === 0) {
      map.getSource('sim-links')?.setData({ type: 'FeatureCollection', features: links.filter((l) => l.mph.length).map((l) => ({
        type: 'Feature', properties: { mph: l.mph.reduce((a, b) => a + b, 0) / l.mph.length },
        geometry: { type: 'LineString', coordinates: l.pts.map(toLL) } })) });
    }
  }
  requestAnimationFrame(tick);
}

function reset() {
  buildLinks();
  cars = links.length ? Array.from({ length: COUNT }, () => spawn()) : [];
  hud.querySelector('[data-count]').textContent = `${cars.length} vehicles on ${links.length} road links`;
}

// The playback card, in the panel's colours for whichever style is on.
const hud = document.createElement('div');
hud.className = 'aitt-layer-panel aitt-sim';
hud.innerHTML = `<div class="aitt-layer-body">
  <div class="aitt-layer-group-name">Traffic playback · demo data</div>
  <div class="aitt-sim-row"><button type="button" class="aitt-seg-btn" data-play aria-pressed="true">Pause</button>
    <label class="aitt-layer-line">Link speeds <input type="checkbox" role="switch" class="aitt-switch" data-links checked></label></div>
  <div class="aitt-sim-legend"><span style="--c:${COLORS.fast}">45+ mph</span><span style="--c:${COLORS.mid}">25–45</span><span style="--c:${COLORS.slow}">under 25</span></div>
  <div class="aitt-sim-count" data-count></div></div>`;
map.getContainer().appendChild(hud);
hud.querySelector('[data-play]').addEventListener('click', (e) => {
  running = !running;
  e.target.textContent = running ? 'Pause' : 'Play';
  e.target.setAttribute('aria-pressed', String(running));
});
hud.querySelector('[data-links]').addEventListener('change', (e) => {
  linksOn = e.target.checked;
  if (map.getLayer('sim-links')) map.setLayoutProperty('sim-links', 'visibility', linksOn ? 'visible' : 'none');
});

addLayers();
map.on('style.load', addLayers); // a style switch drops our layers; put them back
let pending;
map.on('moveend', () => { clearTimeout(pending); pending = setTimeout(() => map.once('idle', reset), 300); });
reset();
requestAnimationFrame(tick);
window.__sim = { cars: () => cars.length, links: () => links.length };
