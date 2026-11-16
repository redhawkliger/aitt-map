import { describe, it, expect } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildStyle, MAP_SLOTS, VARIANTS } from '../../src/style/build.js';
import { pointsLayer, linesLayer, RAMP } from '../../src/layers/overlays.js';

function fakeTokens() {
  const t = {}; let i = 1;
  for (const v of VARIANTS) for (const s of MAP_SLOTS) t[`--map-${v}-${s}`] = '#' + (i++).toString(16).padStart(6, '0');
  return t;
}
const tokens = fakeTokens();
const pt = (props, lon = -122.0436, lat = 37.5934) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
const ln = (props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: [[-122.05, 37.59], [-122.04, 37.594]] } });
const fc = (features) => ({ type: 'FeatureCollection', features });
const withBase = (v, spec) => {
  const base = buildStyle(tokens, v, { basemapUrl: 'pmtiles://http://localhost/b.pmtiles', glyphs: 'http://localhost/f/{fontstack}/{range}.pbf' });
  return { ...base, sources: { ...base.sources, ...spec.sources }, layers: [...base.layers, ...spec.layers] };
};

describe('app overlays: points (crashes, count sites, LOS dots)', () => {
  const los = fc(['A', 'C', 'F'].map((g) => pt({ los: g, name: 'Dyer St' })));
  for (const v of VARIANTS) {
    it(`${v}: makes a valid style on top of the basemap`, () => {
      const s = pointsLayer(tokens, v, { id: 'los', name: 'Level of service', data: los, color: { by: 'los', values: ['A', 'B', 'C', 'D', 'E', 'F'] }, label: 'name' });
      expect(validateStyleMin(withBase(v, s))).toEqual([]);
      expect(s.group).toBe('data');
    });
  }
  it('categories take the style\'s 6-step ramp in order: LOS A is ramp-1, F is ramp-6', () => {
    const s = pointsLayer(tokens, 'report', { id: 'los', name: 'LOS', data: los, color: { by: 'los', values: ['A', 'B', 'C', 'D', 'E', 'F'] } });
    const m = s.layers.find((l) => l.type === 'circle').paint['circle-color'];
    expect(m[0]).toBe('match');
    expect(m[3]).toBe(tokens['--map-report-ramp-1']);
    expect(m[13]).toBe(tokens['--map-report-ramp-6']);
  });
  it('numbers step through the ramp at the given breaks (e.g. KABCO or volume classes)', () => {
    const s = pointsLayer(tokens, 'night', { id: 'v', name: 'Volume', data: fc([pt({ aadt: 12000 })]), color: { by: 'aadt', breaks: [5000, 10000, 20000] } });
    const e = s.layers.find((l) => l.type === 'circle').paint['circle-color'];
    expect(e.slice(0, 2)).toEqual(['step', ['to-number', ['get', 'aadt']]]);
    expect(e).toEqual(['step', ['to-number', ['get', 'aadt']], tokens['--map-night-ramp-1'], 5000, tokens['--map-night-ramp-2'],
      10000, tokens['--map-night-ramp-3'], 20000, tokens['--map-night-ramp-4']]);
  });
  it('more than 6 categories or breaks is refused (the ramp has 6 steps)', () => {
    expect(() => pointsLayer(tokens, 'night', { id: 'x', name: 'x', data: fc([]), color: { by: 'k', values: [1, 2, 3, 4, 5, 6, 7] } })).toThrow(/6/);
    expect(() => pointsLayer(tokens, 'night', { id: 'x', name: 'x', data: fc([]), color: { by: 'k', breaks: [1, 2, 3, 4, 5, 6] } })).toThrow(/6/);
  });
  it('with no colour rule, points use the style\'s accent', () => {
    const s = pointsLayer(tokens, 'cyber', { id: 'c', name: 'Counts', data: fc([pt({})]) });
    expect(s.layers.find((l) => l.type === 'circle').paint['circle-color']).toBe(tokens['--map-cyber-measure']);
  });
  it('size can follow a value', () => {
    const s = pointsLayer(tokens, 'day', { id: 'c', name: 'Crashes', data: fc([pt({ n: 4 })]), radius: { by: 'n', range: [1, 20], px: [4, 14] } });
    expect(s.layers.find((l) => l.type === 'circle').paint['circle-radius']).toEqual(['interpolate', ['linear'], ['to-number', ['get', 'n']], 1, 4, 20, 14]);
  });
  it('every colour comes from the tokens', () => {
    const allowed = new Set(Object.values(tokens));
    const s = pointsLayer(tokens, 'ember', { id: 'los', name: 'LOS', data: los, color: { by: 'los', values: ['A', 'F'] }, label: 'name' });
    const colors = JSON.stringify(s.layers).match(/#[0-9a-f]{6}/gi) ?? [];
    expect(colors.filter((c) => !allowed.has(c.toLowerCase()))).toEqual([]);
  });
});

describe('app overlays: lines (corridors, volume bands)', () => {
  const flows = fc([ln({ vol: 800 }), ln({ vol: 2400 })]);
  for (const v of VARIANTS) {
    it(`${v}: makes a valid style on top of the basemap`, () => {
      const s = linesLayer(tokens, v, { id: 'flow', name: 'Volumes', data: flows, width: { by: 'vol', range: [0, 3000], px: [2, 18] }, color: { by: 'vol', breaks: [1000, 2000] } });
      expect(validateStyleMin(withBase(v, s))).toEqual([]);
    });
  }
  it('band width follows the volume', () => {
    const s = linesLayer(tokens, 'night', { id: 'flow', name: 'Volumes', data: flows, width: { by: 'vol', range: [0, 3000], px: [2, 18] } });
    expect(s.layers[0].paint['line-width']).toEqual(['interpolate', ['linear'], ['to-number', ['get', 'vol']], 0, 2, 3000, 18]);
    expect(s.layers[0].layout['line-cap']).toBe('round');
  });
  it('a plain corridor line uses the accent at a fixed width', () => {
    const s = linesLayer(tokens, 'plan', { id: 'cor', name: 'Corridor', data: fc([ln({})]) });
    expect(s.layers[0].paint['line-color']).toBe(tokens['--map-plan-measure']);
    expect(typeof s.layers[0].paint['line-width']).toBe('number');
  });
});

describe('the ramp', () => {
  it('has 6 colour slots, defined for every style', () => {
    expect(RAMP).toEqual(['ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5', 'ramp-6']);
    for (const s of RAMP) expect(MAP_SLOTS).toContain(s);
  });
});
