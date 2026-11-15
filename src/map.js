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
  addProtocol();
  const absolute = new URL(basemapUrl, location.href).href;
  const s = typeof style === 'function' ? style(absolute) : style ?? standInStyle(absolute);
  const map = new maplibregl.Map({ container, style: s, center, zoom, attributionControl: { compact: false } });
  await new Promise((resolve) => map.once('load', resolve));
  return map;
}
