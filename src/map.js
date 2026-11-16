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
    const r = await protocol.tilev4(params, abort);
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
  map.on('error', (e) => {
    if (e.sourceId === 'basemap' || /pmtiles|basemap|404|Failed to fetch/i.test(e.error?.message ?? '')) {
      showMessage(container, 'Map data is offline');
    }
  });
  await new Promise((resolve) => { map.once('load', resolve); map.once('error', resolve); });
  return map;
}

/** True when the browser can make a WebGL context (MapLibre 5 needs WebGL2). */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
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
