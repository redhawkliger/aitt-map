import { describe, it, expect } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildStyle, MAP_SLOTS, VARIANTS } from '../../src/style/build.js';
import { trafficLayer, TRAFFIC_ICONS } from '../../src/layers/traffic.js';

function fakeTokens() {
  const t = {}; let i = 1;
  for (const v of VARIANTS) for (const s of MAP_SLOTS) t[`--map-${v}-${s}`] = '#' + (i++).toString(16).padStart(6, '0');
  return t;
}
const COLOR = /^#[0-9a-f]{6}$/i;
const colorsIn = (v, out = []) => {
  if (typeof v === 'string' && COLOR.test(v)) out.push(v.toLowerCase());
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => colorsIn(x, out));
  return out;
};
const URL_ = 'pmtiles://http://localhost/data/traffic.pmtiles';

describe('traffic-control layer', () => {
  const tokens = fakeTokens();
  for (const v of VARIANTS) {
    it(`${v}: makes a valid style when added on top of the basemap`, () => {
      const base = buildStyle(tokens, v, { basemapUrl: 'pmtiles://http://localhost/data/california.pmtiles', glyphs: 'http://localhost/f/{fontstack}/{range}.pbf' });
      const t = trafficLayer(tokens, v, URL_);
      const st = { ...base, sources: { ...base.sources, [t.id]: t.source }, layers: [...base.layers, ...t.layers] };
      expect(validateStyleMin(st)).toEqual([]);
    });
  }
  it('every colour comes from the tokens', () => {
    const allowed = new Set(Object.values(tokens));
    const t = trafficLayer(tokens, 'night', URL_);
    expect(colorsIn(t.layers).filter((c) => !allowed.has(c))).toEqual([]);
    for (const icon of Object.values(TRAFFIC_ICONS)) for (const slot of icon.slots) expect(MAP_SLOTS).toContain(slot);
  });
  it('signals, stop and yield signs, crosswalks, bike lanes, bus stops and lane/speed labels are all drawn', () => {
    const t = trafficLayer(tokens, 'night', URL_);
    const ids = t.layers.map((l) => l.id);
    for (const id of ['traffic-bike', 'traffic-control', 'traffic-bus', 'traffic-lanes-label']) expect(ids).toContain(id);
    const icons = JSON.stringify(t.layers.find((l) => l.id === 'traffic-control').layout['icon-image']);
    for (const k of ['traffic_signals', 'stop', 'give_way', 'crossing']) expect(icons).toContain(k);
    expect(t.group).toBe('data');
    expect(t.name).toBe('Traffic control');
  });
  it('control icons only appear from zoom 15, lane labels from 16, so city views stay clean', () => {
    const t = trafficLayer(tokens, 'night', URL_);
    expect(t.layers.find((l) => l.id === 'traffic-control').minzoom).toBeGreaterThanOrEqual(15);
    expect(t.layers.find((l) => l.id === 'traffic-lanes-label').minzoom).toBeGreaterThanOrEqual(16);
  });
});

describe('traffic labels and credits', () => {
  const tokens = fakeTokens();
  it('a one-lane street says "1 lane", not "1 lanes"', () => {
    const f = JSON.stringify(trafficLayer(tokens, 'night', URL_).layers.find((l) => l.id === 'traffic-lanes-label').layout['text-field']);
    expect(f).toContain('" lane"');
    expect(f).toContain('" lanes"');
  });
  it('does not repeat the OpenStreetMap credit the basemap already shows', () => {
    expect(trafficLayer(tokens, 'night', URL_).source.attribution).toBeUndefined();
  });
});
