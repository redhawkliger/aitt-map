import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';

export const DEFAULT_CENTER = [-122.0436, 37.5934]; // Union City Blvd at Dyer St (trafficiq/contract example)
export const DEFAULT_ZOOM = 15;
export const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://protomaps.com">Protomaps</a>';

// A 1x1 transparent PNG. For a raster tile the file does not have (photos cover only the corridor), pmtiles answers
// {data: null}, which leaves MapLibre waiting forever, so the map never reports "loaded". A blank tile ends the wait.
const BLANK_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

let protocolAdded = false;
function addProtocol() {
  if (protocolAdded) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', async (params, abort) => {
    let r;
    try {
      r = await protocol.tilev4(params, abort);
    } catch (err) {
      // pmtiles keeps a failed directory read in its cache, so one dropped request would break every piece in that
      // area for good. Start that file afresh and try once more.
      if (abort.signal.aborted) throw err;
      const key = /^pmtiles:\/\/(.+)\/\d+\/\d+\/\d+$/.exec(params.url)?.[1];
      if (key) protocol.tiles.delete(key);
      r = await protocol.tilev4(params, abort);
    }
    return r.data === null && params.type !== 'json' ? { data: BLANK_PNG } : r;
  });
  protocolAdded = true;
}

/** A stand-in style (plain Protomaps dark) used until a Signal Flow style is passed in. */
export function standInStyle(basemapUrl) {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    sources: { basemap: { type: 'vector', url: 'pmtiles://' + basemapUrl, attribution: ATTRIBUTION } },
    layers: layers('basemap', namedFlavor('dark'), { lang: 'en' }),
  };
}

/**
 * How the map responds to the hand. One wheel notch at the stock rate (1/450) zooms 0.15 of a level, which feels
 * sluggish; 1/100 gives about half a level. Apps can pass their own values to createMap({feel}).
 */
// Basemap pieces that must fail in a row before the map says it is offline.
const OFFLINE_AFTER = 3;

export const FEEL = { wheelZoomRate: 1 / 100, trackpadZoomRate: 1 / 70, fadeDuration: 120 };

/**
 * @param {{container: HTMLElement, basemapUrl: string, style?: object|((url:string)=>object),
 *          center?: [number,number], zoom?: number, feel?: Partial<typeof FEEL>, hash?: boolean,
 *          controls?: boolean}} opts
 *        hash: keep the view in the web address (#zoom/lat/lon) so a link opens the same place.
 *        controls: zoom buttons, a compass that resets north, and a scale bar in feet/miles (default true).
 * @returns {Promise<maplibregl.Map>}
 */
export async function createMap({ container, basemapUrl, style, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM,
  feel = {}, hash = false, controls = true }) {
  if (!hasWebGL()) {
    showMessage(container, "This browser can't draw the map (WebGL is off)");
    return null;
  }
  addProtocol();
  const absolute = new URL(basemapUrl, location.href).href;
  const s = typeof style === 'function' ? style(absolute) : style ?? standInStyle(absolute);
  const f = { ...FEEL, ...feel };
  const map = new maplibregl.Map({ container, style: s, center, zoom, hash, fadeDuration: f.fadeDuration,
    attributionControl: { compact: false } });
  map.scrollZoom.setWheelZoomRate(f.wheelZoomRate);
  map.scrollZoom.setZoomRate(f.trackpadZoomRate);
  if (controls) {
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 120 }), 'bottom-left');
  }
  // A basemap that can't be read (PC asleep, wrong URL) shows a plain message, never a blank map or a stack trace.
  // Only the basemap counts: a missing icon sheet or extra layer leaves the map up. One failed piece (a phone
  // network hiccup) is not an outage: the message waits for several failures in a row, and goes away again as
  // soon as a basemap piece loads (the PC woke up, the network came back).
  let failures = 0;
  let down = false;
  const goDown = () => { down = true; showMessage(container, 'Map data is offline'); };
  map.on('error', (e) => {
    const fromBasemap = e.sourceId ? e.sourceId === 'basemap' : (e.error?.message ?? '').includes(absolute);
    if (!fromBasemap) return;
    if (!e.tile) goDown(); // the file itself (its header) can't be read
    else if (++failures >= OFFLINE_AFTER) goDown();
  });
  map.on('sourcedata', (e) => {
    if (e.sourceId !== 'basemap' || !e.tile || e.tile.state !== 'loaded') return;
    failures = 0;
    if (down) { down = false; hideMessage(container); }
  });
  await new Promise((resolve) => {
    map.once('load', resolve);
    const early = (e) => { if (down) { map.off('error', early); resolve(); } };
    map.on('error', early);
    map.once('load', () => map.off('error', early));
  });
  return map;
}

/** True when the browser can make a WebGL context (MapLibre 5 needs WebGL2). */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function hideMessage(container) {
  container.querySelector('.aitt-map-offline')?.remove();
}

function showMessage(container, text) {
  let el = container.querySelector('.aitt-map-offline');
  if (!el) {
    el = document.createElement('div');
    el.className = 'aitt-map-offline';
    el.setAttribute('role', 'status');
    Object.assign(el.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', zIndex: 10,
      font: '500 16px Overpass, system-ui, sans-serif', color: 'var(--sf-text, #e6e8eb)',
      background: 'var(--sf-surface, #0b0d10)' });
    container.appendChild(el);
  }
  el.textContent = text;
}
