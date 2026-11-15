import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';

export const DEFAULT_CENTER = [-122.0436, 37.5934]; // Union City Blvd at Dyer St (trafficiq/contract example)
export const DEFAULT_ZOOM = 15;
export const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://protomaps.com">Protomaps</a>';

let protocolAdded = false;
function addProtocol() {
  if (protocolAdded) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
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
 * @param {{container: HTMLElement, basemapUrl: string, style?: object|((url:string)=>object),
 *          center?: [number,number], zoom?: number}} opts
 * @returns {Promise<maplibregl.Map>}
 */
export async function createMap({ container, basemapUrl, style, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM }) {
  if (!hasWebGL()) {
    showMessage(container, "This browser can't draw the map (WebGL is off)");
    return null;
  }
  addProtocol();
  const absolute = new URL(basemapUrl, location.href).href;
  const s = typeof style === 'function' ? style(absolute) : style ?? standInStyle(absolute);
  const map = new maplibregl.Map({ container, style: s, center, zoom, attributionControl: { compact: false } });
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
