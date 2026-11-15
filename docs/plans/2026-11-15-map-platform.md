# Map Platform (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone map project (`repos/aitt-map`) with a California basemap we own, one Signal Flow style, a
layer switcher, a measure tool and a demo page, built bottom-up, one layer at a time.

**Architecture:** One PMTiles file of California (vector tiles cut from the Protomaps OpenStreetMap build) is read
in pieces over HTTP by MapLibre GL through the `pmtiles` protocol. No tile server. A small JS kit wraps MapLibre:
`createMap` → `buildStyle` (Signal Flow tokens) → layer registry → measure tool. A demo page uses only the kit's
public API, so the tools can adopt it unchanged in phase 1b.

**Tech Stack:** Vite, vanilla JS (ES modules, JSDoc types, like `repos/trafficiq`), `maplibre-gl` 5.x, `pmtiles`
(JS), `@protomaps/basemaps`, `@turf/length`, `@turf/area`, Vitest (unit), Playwright (browser), the `pmtiles`
CLI (go-pmtiles, single Windows exe; no Java or Docker needed).

**Spec:** `repos/trafficiq/docs/superpowers/specs/2026-11-15-agentic-platform-design.md`, sections 3, 5, 6, 7
(phase 1), 8.

## Global Constraints

- $0 a month. Free and open-source only. No map API keys, no Esri, no Mapbox.
- Signal Flow theme: colors only from Signal Flow tokens (copy `repos/trafficiq/src/lib/signal-flow/tokens.css`),
  Overpass / Overpass Mono fonts, dark by default. Signal colors (green, amber, red) carry meaning only, never
  decoration.
- Every map shows the credit "© OpenStreetMap contributors" (ODbL) and "Protomaps" for the build.
- Measurements are in feet by default (metres as an option), computed on the ground (geodesic), never on pixels.
- Exit gate (spec phase 1): names at every zoom over California; layers switch; distance and area are within 1% of
  a known length; a phone shows the first view in under 2 s; the owner approves the look.
- Large data files (`*.pmtiles`) are never committed. They live in `data/` (git-ignored) and on R2.
- Roles: Hermes builds; Claude reviews each task; the owner merges. **Task 4 has an owner gate: no code past it
  until the owner picks a look.**

## Review Focus

1. **The basemap file can't be reached** (PC asleep, R2 URL wrong): the page shows "Map data is offline" in place
   of the map, not a blank or a stack trace. Test in Task 3.
2. **Measuring with 0 or 1 point, or a repeated point:** shows 0 ft, never `NaN`, and never throws. Test in Task 6.
3. **Zooming past the data's last zoom (z15 → z20, street level):** street names still render (overzoom). Test in
   Task 7.
4. **Phone touch:** in measure mode a tap adds a point and a drag still pans the map; a double-tap or "Done" ends the
   line. Test in Task 6.
5. **The same layer added twice:** `addDataLayer` throws `LayerExistsError` instead of drawing it twice. Test in
   Task 5.

---

## File Structure (`repos/aitt-map`)

```
package.json              name "@aitt/map", type module, exports "./src/index.js"
vite.config.js            demo dev server; serves data/ with HTTP range requests
scripts/get-basemap.mjs   Layer 1: cut California out of the Protomaps build → data/california.pmtiles
scripts/check-basemap.mjs Layer 1 check: bounds, zooms, layers of a .pmtiles file
scripts/upload-r2.mjs     Layer 2: upload data/*.pmtiles + fonts to the R2 bucket (Task 8)
src/index.js              public API: createMap, buildStyle, readTokens, addDataLayer, measure
src/map.js                createMap(): MapLibre + pmtiles protocol + offline message
src/style/tokens.js       readTokens(): Signal Flow CSS variables → plain object
src/style/build.js        buildStyle(tokens, variant): MapLibre style JSON
src/layers/registry.js    data layers: add, toggle, opacity, list
src/layers/panel.js       the layer switcher UI
src/measure/geo.js        pure math: distanceFt, areaSqFt
src/measure/tool.js       the measure tool UI (click/tap, live readout)
src/theme/tokens.css      copied from trafficiq signal-flow (do not edit here)
public/fonts/             Overpass glyph PBFs (Task 4)
demo/index.html, demo/main.js   the demo page
tests/unit/*.test.js      Vitest
tests/e2e/*.spec.js       Playwright
data/                     git-ignored: california.pmtiles, union-city-naip.pmtiles
```

---

### Task 1: Layer 1, the basemap file (THE FIRST STEP)

**Files:**
- Create: `package.json`, `.gitignore` (`data/`, `node_modules/`, `bin/`), `README.md`,
  `scripts/get-basemap.mjs`, `scripts/check-basemap.mjs`
- Test: `tests/unit/check-basemap.test.js`

**Interfaces:**
- Produces: `data/california.pmtiles`; `checkBasemap(path: string) => Promise<{minZoom:number, maxZoom:number,
  bounds:[number,number,number,number], layers:string[]}>` exported from `scripts/check-basemap.mjs`.

- [ ] **Step 1: Write the failing test** `checkBasemap reports California bounds and the label layers`

```js
const info = await checkBasemap('data/california.pmtiles');
expect(info.maxZoom).toBeGreaterThanOrEqual(15);
const [w, s, e, n] = info.bounds;
expect(w).toBeLessThanOrEqual(-124.4); expect(e).toBeGreaterThanOrEqual(-114.1);
expect(s).toBeLessThanOrEqual(32.5);   expect(n).toBeGreaterThanOrEqual(42.0);
for (const l of ['roads', 'places', 'buildings', 'water', 'pois']) expect(info.layers).toContain(l);
```

- [ ] **Step 2: Run it:** `npx vitest run tests/unit/check-basemap.test.js` → FAIL (no file).
- [ ] **Step 3: `scripts/get-basemap.mjs`.** Download the go-pmtiles Windows release into `bin/` (pin the
  version in the script and in README). Find the newest daily build in
  `https://build-metadata.protomaps.dev/builds.json`, then run
  `pmtiles extract <build url> data/california.pmtiles --bbox=-124.5,32.4,-114.0,42.1 --maxzoom=15`.
  Print the file size and the build date. Write the build date to `data/basemap.json` (`{build, bbox, created}`),
  so a later rebuild knows what it replaces.
- [ ] **Step 4: `checkBasemap`** with the `pmtiles` JS package (`PMTiles` + a `FileSource` reading the local
  file): header zooms and bounds, plus `vector_layers` ids from the metadata.
- [ ] **Step 5: Run the test** → PASS. Record the size in README (expected: a few GB).
- [ ] **Step 6: Commit** `feat: California basemap extract and check (layer 1)`.

### Task 2: Layer 2, serve it, and see it on a bare map

**Files:**
- Create: `vite.config.js`, `src/map.js`, `src/index.js`, `demo/index.html`, `demo/main.js`
- Test: `tests/e2e/serve.spec.js`, `playwright.config.js`

**Interfaces:**
- Produces: `createMap({container: HTMLElement, basemapUrl: string, style?: object, center?: [number,number],
  zoom?: number}) => Promise<maplibregl.Map>`. The basemap URL is `pmtiles://` + `basemapUrl`. Default view:
  Union City Blvd at Dyer St (`[-122.0436, 37.5934]`, zoom 15), the corridor in `trafficiq/contract`.

- [ ] **Step 1: Failing tests:** `the dev server answers a range request with 206` (GET
  `/data/california.pmtiles` with `Range: bytes=0-126` → status 206, length 127) and `a bare map renders tiles`
  (the demo fires MapLibre `idle`, and `map.queryRenderedFeatures()` returns at least one `roads` feature).
- [ ] **Step 2: Run** `npx playwright test tests/e2e/serve.spec.js` → FAIL.
- [ ] **Step 3: Implement.** Serve `data/` from Vite (a `publicDir`-style middleware that supports `Range`).
  `createMap` registers `new pmtiles.Protocol()` once and uses the plain unstyled `@protomaps/basemaps` "dark"
  layers as a stand-in style until Task 4.
- [ ] **Step 4: Run** → PASS. **Show the owner:** California streets, no styling yet.
- [ ] **Step 5: Commit** `feat: serve the basemap and render it (layer 2)`.

### Task 3: Map offline and error states

**Files:**
- Modify: `src/map.js`
- Test: `tests/e2e/offline.spec.js`

**Interfaces:**
- Produces: `createMap` resolves even when the basemap fails; the container gets
  `<div class="aitt-map-offline" role="status">Map data is offline</div>`. With no WebGL the text is
  "This browser can't draw the map (WebGL is off)".

- [ ] **Step 1: Failing test** `an unreachable basemap shows the offline message` (`basemapUrl` pointing to a 404
  → the message is visible within 5 s; no uncaught page error).
- [ ] **Step 2: Run** → FAIL. **Step 3:** catch the source error event and the WebGL check
  (`maplibregl.supported()` is gone in 5.x: try creating a WebGL2 context). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: clear offline and no-WebGL messages`.

### Task 4: Layer 3, the look (OWNER GATE)

**Files:**
- Create: `src/theme/tokens.css`, `src/style/tokens.js`, `src/style/build.js`, `public/fonts/`
- Test: `tests/unit/style.test.js`

**Interfaces:**
- Produces: `readTokens(el?: Element) => Record<string,string>` (the CSS variables in `tokens.css`, read with
  `getComputedStyle`); `buildStyle(tokens, variant: 'night'|'day'|'plan') => StyleSpecification`. Glyphs URL
  `/fonts/{fontstack}/{range}.pbf`; font stacks `Overpass Regular`, `Overpass SemiBold`, `Overpass Bold`.

- [ ] **Step 1: Glyphs.** Make Overpass glyph PBFs (ranges 0-255 up to 65280-65535) with maplibre/font-maker
  from the Overpass TTFs (SIL OFL). Commit them under `public/fonts/`.
- [ ] **Step 2: Failing tests:**
  - `every color in the style comes from the tokens`: walk all paint/layout values of
    `buildStyle(fakeTokens,'night')`; each color string is one of `Object.values(fakeTokens)`.
  - `label layers exist for places and road names from z6 to z20`: there are `symbol` layers on source-layer
    `places` and `roads` with `text-field`, and together their zoom ranges cover 6–20.
  - `only Overpass fonts are used`: every `text-font` is one of the three stacks.
  - `each variant builds`: `night`, `day` and `plan` return valid styles (`validateStyleMin` from
    `@maplibre/maplibre-gl-style-spec` has no errors).
- [ ] **Step 3: Implement `buildStyle`.** Start from the `@protomaps/basemaps` layers for the geometry and
  filters, and replace every color, width and font with token-driven values. The three variants:
  `night` (asphalt dark, roads bright, minor streets faint, labels in the light text token);
  `day` (light surfaces); `plan` (near-monochrome, for print and plan sheets). 3D buildings
  (`fill-extrusion` on `buildings`, from z15) only in `night`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: OWNER GATE.** Put the three variants side by side on the demo page (a temporary `?compare` view)
  at three places: Union City Blvd (corridor), downtown San Francisco (dense labels), a freeway interchange
  (I-880/SR-92). Screenshot at desktop and phone width. The owner picks one variant to perfect and says what to
  change. Apply the changes, show again, and repeat until the owner approves. **Record the decision in
  `README.md` with the date.** Do not start Task 5 before this.
- [ ] **Step 6: Commit** `feat: Signal Flow map style (layer 3), owner-approved <date>`.

### Task 5: Layer 4, data layers and the layer switcher

**Files:**
- Create: `src/layers/registry.js`, `src/layers/panel.js`
- Test: `tests/unit/registry.test.js`, `tests/e2e/layers.spec.js`

**Interfaces:**
- Produces:
  - `addDataLayer(map, {id: string, name: string, group: 'basemap'|'data'|'imagery', source: SourceSpecification,
    layers: LayerSpecification[], visible?: boolean, opacity?: number}) => void`. Throws `LayerExistsError` when
    `id` is used.
  - `setLayerVisible(map, id, visible: boolean)`, `setLayerOpacity(map, id, opacity: number /* 0..1 */)`,
    `listLayers(map) => {id,name,group,visible,opacity}[]`.
  - `setBasemapVariant(map, variant)` swaps the basemap style and keeps data layers, their visibility and their
    opacity.
  - `mountLayerPanel(map, el: HTMLElement)`: one panel, grouped, a switch and an opacity slider per layer; it
    collapses to a button on phones.

- [ ] **Step 1: Failing unit tests:** `adding the same id twice throws LayerExistsError`; `opacity is clamped to
  0..1`; `listLayers reflects visibility changes`; `setBasemapVariant keeps data layers and their settings`.
- [ ] **Step 2: Failing e2e test** `the aerial layer turns on and off from the panel`: register the Union City
  NAIP photos as a raster layer (`data/union-city-naip.pmtiles`, copied from
  `Workspace/data/naip-store/tiles/union-city-ca.pmtiles`, group `imagery`); click its switch → the raster layer's
  `visibility` is `visible`; click again → `none`.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: data layer registry and switcher (layer 4)`.

### Task 6: Layer 5, the measure tool

**Files:**
- Create: `src/measure/geo.js`, `src/measure/tool.js`
- Test: `tests/unit/geo.test.js`, `tests/e2e/measure.spec.js`

**Interfaces:**
- Produces:
  - `distanceFt(coords: [number,number][]) => number` (geodesic, via `@turf/length`, converted to feet);
    `areaSqFt(ring: [number,number][]) => number` (via `@turf/area`).
  - `startMeasure(map, mode: 'distance'|'area'|'width', {units?: 'ft'|'m'}) => {stop(): void, value(): number}`.
    A click or tap adds a point, a drag pans, a double-click or double-tap or the "Done" button ends it, Esc
    cancels. The live readout shows feet (or square feet / acres above 1 acre). `width` takes exactly two points
    (curb to curb) and ends itself.

- [ ] **Step 1: Failing unit tests** (known lengths):
  - `one degree of longitude on the equator is 364,813 ft within 1%`:
    `distanceFt([[0,0],[1,0]])` ∈ [361,165, 368,461].
  - `a 0.01° by 0.01° square at 37.6° N has the right area within 1%`: expected
    `(0.01 * 364813) * (0.01 * 364813 * Math.cos(37.6 * Math.PI/180))` sq ft.
  - `0 points, 1 point and a repeated point all give 0`, and the result is never `NaN`.
  - `units: 'm' gives metres`.
- [ ] **Step 2: Failing e2e tests:** `measuring Union City Blvd gives the same length as the code` (click 3 known
  points → the readout equals `distanceFt` of those points, rounded to the nearest foot); `on a phone a tap adds a
  point and a drag pans` (Playwright mobile emulation: tap adds a point, a swipe moves the map center and adds no
  point).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: measure distance, area and street width (layer 5)`.

### Task 7: The demo page and the exit-gate checks

**Files:**
- Modify: `demo/index.html`, `demo/main.js` (the final demo: the approved style, the layer panel, measure buttons,
  the credit line, a search-free "jump to" list of the three test places)
- Test: `tests/e2e/gate.spec.js`

- [ ] **Step 1: Failing tests:**
  - `names show at every zoom`: at the three test places, at zooms 6, 10, 13, 16 and 19,
    `queryRenderedFeatures` on the label layers returns at least one feature with a non-empty `name`.
  - `first view on a phone in under 2 s`: Playwright mobile (Pixel 7 profile), network throttled to "Fast 4G"
    (download 9 Mbps, 170 ms latency), served from `vite preview`; from navigation to the first MapLibre `idle`
    < 2000 ms, median of 5 runs.
  - `the credit line is visible`: the OSM and Protomaps credits are in the attribution control.
- [ ] **Step 2: Run** → fix whatever fails (likely: label `minzoom`s, a too-heavy first style, fonts loading late).
- [ ] **Step 3: Run** `npm test` (Vitest + Playwright) → all PASS.
- [ ] **Step 4: Commit** `feat: demo page passes the phase 1 gate checks`.

### Task 8: Put it online at $0 (owner step needed)

**Files:**
- Create: `scripts/upload-r2.mjs`, `docs/HOSTING.md`
- Modify: `README.md`

- [ ] **Step 1: Owner step.** The owner makes a free Cloudflare R2 bucket `aitt-map` on their account, turns on
  public access on a custom domain `map.aitransportationtools.com`, and adds a CORS rule (GET and HEAD from
  `*.aitransportationtools.com` and `localhost`, with the `Range` header allowed, and `ETag` exposed). The builder
  writes these exact settings in `docs/HOSTING.md` first, so the owner can click through them.
- [ ] **Step 2:** `scripts/upload-r2.mjs` uploads `data/california.pmtiles` as `basemap/v<build date>.pmtiles`
  and `public/fonts/` under `fonts/`, using `wrangler r2 object put` (it is free, and the owner signs in once).
  The style points at an exact version, so rollback is a one-line change.
- [ ] **Step 3:** Deploy the demo (Cloudflare Pages, free) at `map.aitransportationtools.com/demo/` and rerun
  `tests/e2e/gate.spec.js` against it with `BASE_URL`. → PASS.
- [ ] **Step 4:** Publish the kit as `@aitt/map` 0.1.0 (GitHub Packages, or a git dependency tag `v0.1.0`) for
  phase 1b.
- [ ] **Step 5: Commit** `chore: R2 hosting, demo deploy, kit 0.1.0`.

---

**Not in this plan (later phases):** moving the tools onto the kit (phase 1b, StreetCanvas first), statewide
aerial photos, our own Planetiler builds (only if the Protomaps layers miss something we need; that needs Java 21).
