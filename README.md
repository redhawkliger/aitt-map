# aitt-map

The map platform for [AI Transportation Tools](https://aitransportationtools.com): a California basemap we own
(vector tiles from OpenStreetMap, cut from the Protomaps build), one Signal Flow style, a layer switcher and a
measure tool. Every tool (StreetCanvas, Crash, Demand, Traffic) will use this one map.

- Why and the whole platform: [docs/design/2026-11-15-agentic-platform-design.md](docs/design/2026-11-15-agentic-platform-design.md)
- The build plan, layer by layer: [docs/plans/2026-11-15-map-platform.md](docs/plans/2026-11-15-map-platform.md)

Map data © OpenStreetMap contributors (ODbL). Basemap build: Protomaps.

## Run

```sh
npm install
npm run basemap   # once: cuts California out of the newest Protomaps build → data/california.pmtiles (~1.5 GB, under a minute)
npm run dev       # the demo page
npm test          # unit (Vitest) + browser (Playwright) tests
```

The basemap tool is go-pmtiles 1.31.2 (downloaded into `bin/` on first run). California, bbox
-124.5,32.4,-114.0,42.1, zooms 0–15 (closer zooms reuse z15). First build: Protomaps 2026-11-14, 1.52 GB.
`data/` is never committed.

## Look

Night is the main style, accepted by the owner on 2026-11-15 after polish (freeway glow, height-shaded 3D buildings,
sky and haze; bigger, brighter street names). Then a sharpness pass the owner asked for, aiming at Google-like
clarity: roads 1.45x wider, Night contrast raised, building outlines, clearer Day water and parks. Day and Plan exist.

## Use it in a tool

```sh
npm install github:redhawkliger/aitt-map#v0.1.0
```

```js
import 'maplibre-gl/dist/maplibre-gl.css';
import '@aitt/map/src/theme/map-tokens.css';
import { createMap, buildStyle, readTokens, useBasemap, addDataLayer, mountLayerPanel, mountMeasureBar, ATTRIBUTION } from '@aitt/map';

const basemapUrl = 'https://tiles.aitransportationtools.com/basemap/v20261114.pmtiles'; // see hosting.json
const glyphs = 'https://tiles.aitransportationtools.com/fonts/{fontstack}/{range}.pbf';
const styleFor = (v) => buildStyle(readTokens(), v, { basemapUrl: 'pmtiles://' + basemapUrl, glyphs, attribution: ATTRIBUTION });
const map = await createMap({ container, basemapUrl, style: () => styleFor('night') });
useBasemap(map, styleFor, 'night');
addDataLayer(map, { id: 'crashes', name: 'Crashes', group: 'data', source: {...}, layers: [...] });
```

`demo/main.js` is the full example (layer panel, measure bar, Night/Day/Plan).

## Online

How it's hosted for $0 (Cloudflare R2 for the map files, Pages for the demo), with the owner's click-through
steps: [docs/HOSTING.md](docs/HOSTING.md). `npm run upload` sends the files, `npm run deploy` publishes the demo.
