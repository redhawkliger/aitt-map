import 'maplibre-gl/dist/maplibre-gl.css';
import { createMap } from '../src/index.js';

const BASEMAP = new URLSearchParams(location.search).get('basemap')
  ?? import.meta.env.VITE_BASEMAP_URL ?? '/data/california.pmtiles';

const map = await createMap({ container: document.getElementById('map'), basemapUrl: BASEMAP });
window.__map = map;
map?.on('idle', () => { window.__mapIdle = true; });
