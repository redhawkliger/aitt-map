import { describe, it, expect } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildStyle, MAP_SLOTS, VARIANTS, FONTS } from '../../src/style/build.js';

// Every token gets a unique color, so any color in the style can be traced to a token.
function fakeTokens() {
  const t = {};
  let i = 1;
  for (const v of VARIANTS) for (const s of MAP_SLOTS) t[`--map-${v}-${s}`] = '#' + (i++).toString(16).padStart(6, '0');
  return t;
}
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(.*\)|hsla?\(.*\))$/i;
function colorsIn(v, out = []) {
  if (typeof v === 'string' && COLOR.test(v.trim())) out.push(v.trim().toLowerCase());
  else if (Array.isArray(v)) v.forEach((x) => colorsIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => colorsIn(x, out));
  return out;
}
const OPTS = { basemapUrl: 'pmtiles://http://localhost/data/california.pmtiles', glyphs: 'http://localhost/fonts/{fontstack}/{range}.pbf' };

describe('buildStyle', () => {
  const tokens = fakeTokens();

  it('every color in the style comes from the tokens', () => {
    const allowed = new Set(Object.values(tokens));
    const style = buildStyle(tokens, 'night', OPTS);
    const stray = colorsIn(style.layers).filter((c) => !allowed.has(c));
    expect(stray).toEqual([]);
  });

  it('label layers exist for places and road names from z6 to z20', () => {
    const style = buildStyle(tokens, 'night', OPTS);
    const labels = style.layers.filter((l) => l.type === 'symbol' && l.layout?.['text-field']);
    const places = labels.filter((l) => l['source-layer'] === 'places');
    const roads = labels.filter((l) => l['source-layer'] === 'roads');
    expect(places.length).toBeGreaterThan(0);
    expect(roads.length).toBeGreaterThan(0);
    const covered = (z) => labels.some((l) => (l.minzoom ?? 0) <= z && (l.maxzoom ?? 24) > z);
    for (let z = 6; z <= 20; z++) expect(covered(z), `zoom ${z}`).toBe(true);
  });

  it('only Overpass fonts are used', () => {
    const style = buildStyle(tokens, 'night', OPTS);
    const used = new Set();
    for (const l of style.layers) {
      const f = l.layout?.['text-font'];
      if (f) JSON.stringify(f).match(/"[A-Z][^"]+"/g)?.forEach((s) => /Regular|Medium|SemiBold|Bold|Italic|Sans|Overpass/.test(s) && used.add(s.slice(1, -1)));
    }
    for (const f of used) expect(Object.values(FONTS)).toContain(f);
    expect(used.size).toBeGreaterThan(0);
  });

  for (const v of ['night', 'day', 'plan']) {
    it(`the ${v} variant is a valid style`, () => {
      expect(validateStyleMin(buildStyle(tokens, v, OPTS))).toEqual([]);
    });
  }

  it('plan has no POI icons, and night and day show them only from zoom 17', () => {
    const pois = (v) => buildStyle(tokens, v, OPTS).layers.filter((l) => l.id === 'pois');
    expect(pois('plan')).toEqual([]);
    for (const v of ['night', 'day']) expect(pois(v)[0].minzoom).toBeGreaterThanOrEqual(17);
  });

  it('night draws a soft glow under the freeways, from a token', () => {
    const ls = buildStyle(tokens, 'night', OPTS).layers;
    const glow = ls.findIndex((l) => l.id === 'roads_highway_glow');
    expect(glow).toBeGreaterThan(-1);
    expect(glow).toBeLessThan(ls.findIndex((l) => l.id === 'roads_highway'));
    expect(ls[glow].paint['line-blur']).toBeTruthy();
    expect(ls[glow].paint['line-color']).toBe(tokens['--map-night-glow']);
  });

  it('night 3D buildings get lighter with height between two tokens', () => {
    const b = buildStyle(tokens, 'night', OPTS).layers.find((l) => l.id === 'buildings_3d');
    const colours = colorsIn(b.paint['fill-extrusion-color']);
    expect(colours).toContain(tokens['--map-night-building-3d']);
    expect(colours).toContain(tokens['--map-night-building-3d-top']);
  });

  it('night sets the sky and haze from tokens', () => {
    const st = buildStyle(tokens, 'night', OPTS);
    expect(st.sky['sky-color']).toBe(tokens['--map-night-sky']);
    expect(st.sky['horizon-color']).toBe(tokens['--map-night-haze']);
    expect(st.sky['fog-color']).toBe(tokens['--map-night-haze']);
  });

  it('night 3D buildings have the new style on a valid style', () => {
    expect(validateStyleMin(buildStyle(tokens, 'night', OPTS))).toEqual([]);
  });

  it('night has 3D buildings and plan does not', () => {
    const has3d = (v) => buildStyle(tokens, v, OPTS).layers.some((l) => l.type === 'fill-extrusion');
    expect(has3d('night')).toBe(true);
    expect(has3d('plan')).toBe(false);
  });
});

// Real token values from the CSS file, for contrast checks.
import { readFileSync } from 'node:fs';
function cssTokens() {
  const css = readFileSync(new URL('../../src/theme/map-tokens.css', import.meta.url), 'utf8');
  return Object.fromEntries([...css.matchAll(/(--map-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Value of a zoom-interpolated number at zoom z (linear stops only, which is what the labels use).
function at(expr, z) {
  if (typeof expr === 'number') return expr;
  const stops = expr.slice(3);
  for (let i = 0; i < stops.length - 2; i += 2) {
    const [z0, v0, z1, v1] = stops.slice(i, i + 4);
    if (z <= z0) return v0;
    if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
  }
  return stops[stops.length - 1];
}

describe('street names stand out when zoomed in', () => {
  const tokens = fakeTokens();
  for (const v of VARIANTS) {
    it(`${v}: street names grow with zoom and have a solid outline`, () => {
      const ls = buildStyle(tokens, v, OPTS).layers;
      for (const id of ['roads_labels_minor', 'roads_labels_major']) {
        const l = ls.find((x) => x.id === id);
        expect(at(l.layout['text-size'], 15), `${id} z15`).toBeGreaterThanOrEqual(13);
        expect(at(l.layout['text-size'], 18), `${id} z18`).toBeGreaterThanOrEqual(16);
        expect(at(l.layout['text-size'], 20), `${id} z20`).toBeGreaterThanOrEqual(19);
        expect(l.paint['text-halo-width'], id).toBeGreaterThanOrEqual(1.8);
      }
    });
  }
  it('night street names read clearly on the street they sit on', () => {
    const t = cssTokens();
    expect(contrast(t['--map-night-label-road'], t['--map-night-road-minor'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--map-night-label-road-major'], t['--map-night-road-major'])).toBeGreaterThanOrEqual(4.5);
  });
});

it('street names win over shop names when they collide (drawn above, so placed first)', () => {
  const ls = buildStyle(fakeTokens(), 'night', OPTS).layers;
  const idx = (id) => ls.findIndex((l) => l.id === id);
  expect(idx('roads_labels_minor')).toBeGreaterThan(idx('pois'));
  expect(idx('roads_labels_major')).toBeGreaterThan(idx('pois'));
});
