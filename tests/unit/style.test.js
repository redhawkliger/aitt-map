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

// Clarity: roads must stand out from the ground, streets must be wide enough to read, buildings need edges.
import { layers as pmLayers, namedFlavor } from '@protomaps/basemaps';
function zoomValue(expr, z) {
  if (typeof expr === 'number') return expr;
  if (!Array.isArray(expr) || expr[0] !== 'interpolate') return NaN;
  const stops = expr.slice(3); const base = expr[1][0] === 'exponential' ? expr[1][1] : 1;
  if (z <= stops[0]) return stops[1];
  for (let i = 0; i < stops.length - 2; i += 2) {
    const [z0, v0, z1, v1] = stops.slice(i, i + 4);
    if (z <= z1) {
      const t = base === 1 ? (z - z0) / (z1 - z0) : (base ** (z - z0) - 1) / (base ** (z1 - z0) - 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return stops[stops.length - 1];
}
describe('the map reads clearly', () => {
  const tokens = fakeTokens();
  const stock = Object.fromEntries(pmLayers('basemap', namedFlavor('dark'), { lang: 'en' }).map((l) => [l.id, l]));
  for (const id of ['roads_minor', 'roads_major', 'roads_highway']) {
    it(`${id} is at least 1.4x the stock width at zoom 16`, () => {
      const l = buildStyle(tokens, 'night', OPTS).layers.find((x) => x.id === id);
      expect(zoomValue(l.paint['line-width'], 16)).toBeGreaterThanOrEqual(1.4 * zoomValue(stock[id].paint['line-width'], 16) - 1e-9);
    });
  }
  for (const v of VARIANTS) {
    it(`${v}: buildings have a crisp outline from a token`, () => {
      const l = buildStyle(tokens, v, OPTS).layers.find((x) => x.id === 'buildings_outline');
      expect(l?.type).toBe('line');
      expect(l.paint['line-color']).toBe(tokens[`--map-${v}-building-line`]);
    });
  }
  it('night streets stand out from the ground (contrast 2:1 minor, 3:1 major)', () => {
    const t = cssTokens();
    expect(contrast(t['--map-night-road-minor'], t['--map-night-earth'])).toBeGreaterThanOrEqual(2);
    expect(contrast(t['--map-night-road-major'], t['--map-night-earth'])).toBeGreaterThanOrEqual(3);
    expect(contrast(t['--map-night-building'], t['--map-night-earth'])).toBeGreaterThanOrEqual(1.25);
  });
  it('day streets have a visible edge against the ground', () => {
    const t = cssTokens();
    expect(contrast(t['--map-day-casing'], t['--map-day-earth'])).toBeGreaterThanOrEqual(1.5);
  });
});

describe('Neon theme (matches the website: black, glowing green)', () => {
  const tokens = fakeTokens();
  it('is one of the style choices and makes a valid style', () => {
    expect(VARIANTS).toContain('neon');
    expect(validateStyleMin(buildStyle(tokens, 'neon', OPTS))).toEqual([]);
  });
  it('glows under freeways and main roads, from its own tokens', () => {
    const ls = buildStyle(tokens, 'neon', OPTS).layers;
    for (const [glow, road] of [['roads_highway_glow', 'roads_highway'], ['roads_major_glow', 'roads_major']]) {
      const i = ls.findIndex((l) => l.id === glow);
      expect(i, glow).toBeGreaterThan(-1);
      expect(i).toBeLessThan(ls.findIndex((l) => l.id === road));
      expect(ls[i].paint['line-color']).toBe(tokens['--map-neon-glow']);
    }
  });
  it('has 3D buildings and a sky, and uses the dark icon sheet', () => {
    const st = buildStyle(tokens, 'neon', OPTS);
    expect(st.layers.some((l) => l.type === 'fill-extrusion')).toBe(true);
    expect(st.sky['sky-color']).toBe(tokens['--map-neon-sky']);
    expect(st.sprite).toMatch(/dark$/);
  });
  it('only night and neon draw main-road glow; night keeps its freeway-only glow', () => {
    expect(buildStyle(tokens, 'night', OPTS).layers.some((l) => l.id === 'roads_major_glow')).toBe(false);
    expect(buildStyle(tokens, 'day', OPTS).layers.some((l) => l.id.endsWith('_glow'))).toBe(false);
  });
});

describe('Matrix, Ember and Cyber themes', () => {
  const tokens = fakeTokens();
  const GLOWS = {
    matrix: ['roads_highway_glow', 'roads_major_glow'],
    ember: ['roads_highway_glow', 'roads_major_glow'],
    cyber: ['roads_highway_glow', 'roads_major_glow', 'roads_minor_glow'],
  };
  for (const [v, glows] of Object.entries(GLOWS)) {
    it(`${v}: is a style choice, valid, dark, 3D, with its own glow`, () => {
      expect(VARIANTS).toContain(v);
      const st = buildStyle(tokens, v, OPTS);
      expect(validateStyleMin(st)).toEqual([]);
      expect(st.sprite).toMatch(/dark$/);
      expect(st.layers.some((l) => l.type === 'fill-extrusion')).toBe(true);
      for (const g of glows) {
        const l = st.layers.find((x) => x.id === g);
        expect(l, g).toBeTruthy();
        // Cyber's roads glow in their own traffic-light colour; the others share one glow colour.
        const slot = v === 'cyber' ? g.replace(/^roads_(\w+)_glow$/, 'road-$1') : 'glow';
        expect(l.paint['line-color'], g).toBe(tokens[`--map-${v}-${slot}`]);
      }
    });
    it(`${v}: roads and names read clearly against the ground`, () => {
      const t = cssTokens();
      const k = (s) => t[`--map-${v}-${s}`];
      expect(contrast(k('road-major'), k('earth'))).toBeGreaterThanOrEqual(3);
      expect(contrast(k('road-minor'), k('earth'))).toBeGreaterThanOrEqual(2);
      expect(contrast(k('label-road-major'), k('label-halo'))).toBeGreaterThanOrEqual(7);
      expect(contrast(k('label-road'), k('label-halo'))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('cyber colours roads like a traffic light: green freeways, amber main roads, red streets', () => {
    const t = cssTokens();
    const hue = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    expect(hue(t['--map-cyber-road-highway'])).toBeGreaterThan(100); expect(hue(t['--map-cyber-road-highway'])).toBeLessThan(160);
    expect(hue(t['--map-cyber-road-major'])).toBeGreaterThan(30); expect(hue(t['--map-cyber-road-major'])).toBeLessThan(55);
    const red = hue(t['--map-cyber-road-minor']);
    expect(red > 320 || red < 10).toBe(true);
  });
});

describe('Report style (a quiet base for study figures)', () => {
  const tokens = fakeTokens();
  const st = buildStyle(tokens, 'report', OPTS);
  it('is a valid light style choice', () => {
    expect(VARIANTS).toContain('report');
    expect(validateStyleMin(st)).toEqual([]);
    expect(st.sprite).toMatch(/light$/);
  });
  it('stays flat and calm: no 3D, no glow, no shop icons', () => {
    expect(st.layers.some((l) => l.type === 'fill-extrusion')).toBe(false);
    expect(st.layers.some((l) => l.id.endsWith('_glow'))).toBe(false);
    expect(st.layers.some((l) => l.id === 'pois')).toBe(false);
  });
  it('keeps freeways quiet so study colours stand out (low saturation)', () => {
    const t = cssTokens();
    const sat = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(...c), min = Math.min(...c);
      return max === 0 ? 0 : (max - min) / max;
    };
    for (const s of ['road-highway', 'road-major', 'road-minor', 'earth', 'building']) expect(sat(t[`--map-report-${s}`]), s).toBeLessThan(0.15);
    expect(contrast(t['--map-report-label-road-major'], t['--map-report-label-halo'])).toBeGreaterThanOrEqual(7);
  });
});

describe('Blocks style (a blocky, voxel look)', () => {
  const tokens = fakeTokens();
  const st = buildStyle(tokens, 'blocks', OPTS);
  it('is a valid style choice with a daytime sky', () => {
    expect(VARIANTS).toContain('blocks');
    expect(validateStyleMin(st)).toEqual([]);
    expect(st.sprite).toMatch(/light$/);
    expect(st.sky['sky-color']).toBe(tokens['--map-blocks-sky']);
  });
  it('draws roads with square ends and sharp corners', () => {
    const roads = st.layers.filter((l) => l.type === 'line' && l['source-layer'] === 'roads');
    expect(roads.length).toBeGreaterThan(5);
    for (const l of roads) {
      expect(l.layout?.['line-cap'], l.id).toBe('butt');
      expect(l.layout?.['line-join'], l.id).toBe('miter');
    }
  });
  it('stacks buildings in whole blocks (heights rounded up to 4 m steps)', () => {
    const b = st.layers.find((l) => l.id === 'buildings_3d');
    expect(JSON.stringify(b.paint['fill-extrusion-height'])).toContain('"ceil"');
    expect(b.paint['fill-extrusion-opacity']).toBe(1);
  });
});
