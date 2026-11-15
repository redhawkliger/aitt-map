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
