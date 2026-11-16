import { measureValue, formatMeasure } from './geo.js';

const SRC = 'aitt-measure';
const LAYERS = ['aitt-measure-fill', 'aitt-measure-casing', 'aitt-measure-line', 'aitt-measure-points'];
const HINT = { distance: 'Tap to add points', area: 'Tap 3 or more corners', width: 'Tap the other curb' };

/**
 * Measure on the map. A click or tap adds a point; a drag pans as usual (MapLibre sends no click after a drag);
 * a double-click / double-tap or finish() ends it; Esc cancels. 'width' takes exactly two points and ends itself.
 * @param {import('maplibre-gl').Map} map
 * @param {'distance'|'area'|'width'} mode
 * @param {{units?: 'ft'|'m', color?: string, halo?: string, onChange?: (s: {value: number, text: string,
 *          points: number, done: boolean, cancelled?: boolean}) => void}} [opts]
 * @returns {{stop(): void, finish(): void, value(): number, points(): [number,number][], mode: string}}
 */
export function startMeasure(map, mode, { units = 'ft', color = '#5AA2FF', halo = '#0B0E11', onChange } = {}) {
  if (!['distance', 'area', 'width'].includes(mode)) throw new Error(`Unknown measure mode ${mode}`);
  const pts = [];
  let done = false;
  let stopped = false;
  const value = () => measureValue(pts, mode, units);
  const text = () => (value() > 0 ? formatMeasure(value(), mode, units) : HINT[mode]);
  const report = (extra = {}) => onChange?.({ value: value(), text: text(), points: pts.length, done, ...extra });

  function data() {
    const f = pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    if (pts.length > 1) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString',
      coordinates: mode === 'area' && pts.length > 2 ? [...pts, pts[0]] : pts } });
    if (mode === 'area' && pts.length > 2) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon',
      coordinates: [[...pts, pts[0]]] } });
    return { type: 'FeatureCollection', features: f };
  }
  function draw() {
    if (stopped) return;
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: data() });
      const poly = ['==', ['geometry-type'], 'Polygon'];
      const line = ['==', ['geometry-type'], 'LineString'];
      map.addLayer({ id: LAYERS[0], type: 'fill', source: SRC, filter: poly, paint: { 'fill-color': color, 'fill-opacity': 0.14 } });
      map.addLayer({ id: LAYERS[1], type: 'line', source: SRC, filter: line,
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': halo, 'line-width': 6, 'line-opacity': 0.7 } });
      map.addLayer({ id: LAYERS[2], type: 'line', source: SRC, filter: line,
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 3 } });
      map.addLayer({ id: LAYERS[3], type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-color': color, 'circle-stroke-width': 2.5 } });
    } else {
      map.getSource(SRC).setData(data());
    }
  }
  function clear() {
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SRC)) map.removeSource(SRC);
  }

  function onClick(e) {
    if (done) return;
    pts.push(e.lngLat.toArray());
    draw();
    if (mode === 'width' && pts.length === 2) finish();
    else report();
  }
  function onDblClick(e) {
    e.preventDefault();
    finish();
  }
  function onKey(e) { if (e.key === 'Escape') stop(true); }

  function unhook() {
    map.off('click', onClick);
    map.off('dblclick', onDblClick);
    window.removeEventListener('keydown', onKey);
    map.getCanvas().style.cursor = '';
    // Re-enable double-click zoom after this double-click has finished, so it doesn't also zoom.
    setTimeout(() => map.doubleClickZoom.enable(), 0);
  }
  function finish() {
    if (done || stopped) return;
    done = true;
    unhook();
    report();
  }
  function stop(cancelled = false) {
    if (stopped) return;
    if (!done) unhook();
    stopped = true;
    map.off('style.load', draw);
    clear();
    if (cancelled) report({ cancelled: true });
  }

  clear();
  map.doubleClickZoom.disable();
  map.getCanvas().style.cursor = 'crosshair';
  map.on('click', onClick);
  map.on('dblclick', onDblClick);
  map.on('style.load', draw); // a Night/Day/Plan swap drops our layers; put them back
  window.addEventListener('keydown', onKey);
  report();
  return { stop: () => stop(false), finish, value, points: () => pts.map((p) => [...p]), mode };
}

/**
 * A small measure toolbar: Distance / Area / Width, a live readout, Done and Clear.
 * @param {import('maplibre-gl').Map} map
 * @param {HTMLElement} el
 * @param {{units?: 'ft'|'m', colors?: (variant: string) => {color: string, halo: string}}} [opts]
 * @returns {{current(): ReturnType<typeof startMeasure>|null}}
 */
export function mountMeasureBar(map, el, { units = 'ft', colors } = {}) {
  el.classList.add('aitt-measure-bar');
  let tool = null;
  const btn = (label, onclick, cls = 'aitt-measure-btn') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', onclick);
    return b;
  };
  const readout = document.createElement('div');
  readout.className = 'aitt-measure-readout';
  readout.setAttribute('role', 'status');
  readout.setAttribute('aria-label', 'Measurement');
  readout.hidden = true;
  const doneBtn = btn('Done', () => tool?.finish(), 'aitt-measure-btn aitt-measure-primary');
  const clearBtn = btn('Clear', () => { tool?.stop(); tool = null; sync(null); });
  const modes = { distance: 'Distance', area: 'Area', width: 'Width' };
  const modeBtns = Object.entries(modes).map(([m, label]) => {
    const b = btn(label, () => start(m));
    b.dataset.mode = m;
    b.setAttribute('aria-pressed', 'false');
    return b;
  });
  el.replaceChildren(...modeBtns, readout, doneBtn, clearBtn);

  function sync(s) {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(!!tool && !s?.cancelled && b.dataset.mode === tool.mode));
    const active = s && !s.cancelled;
    readout.hidden = !active || (s.points === 0 && !s.done);
    if (active) readout.textContent = s.text;
    doneBtn.hidden = !active || s.done || tool?.mode === 'width';
    clearBtn.hidden = !active || !s.done;
  }
  function start(mode) {
    tool?.stop();
    const variant = map.getContainer().dataset.mapVariant ?? 'night';
    tool = startMeasure(map, mode, { units, ...(colors?.(variant) ?? {}),
      onChange: (s) => { if (s.cancelled) tool = null; sync(s); } });
  }
  sync(null);
  return { current: () => tool };
}
