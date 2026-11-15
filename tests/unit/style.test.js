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

  it('night has 3D buildings and plan does not', () => {
    const has3d = (v) => buildStyle(tokens, v, OPTS).layers.some((l) => l.type === 'fill-extrusion');
    expect(has3d('night')).toBe(true);
    expect(has3d('plan')).toBe(false);
  });
});
