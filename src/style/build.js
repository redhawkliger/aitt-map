import { layers, namedFlavor } from '@protomaps/basemaps';

export const VARIANTS = ['night', 'day', 'plan'];
export const FONTS = { regular: 'Overpass Regular', semibold: 'Overpass SemiBold', bold: 'Overpass Bold', italic: 'Overpass Italic' };
export const MAP_SLOTS = [
  'bg', 'earth', 'water', 'water-label', 'park', 'wood', 'scrub', 'sand', 'school', 'hospital', 'industrial',
  'pedestrian', 'aerodrome', 'runway', 'pier', 'building', 'building-3d', 'casing', 'tunnel', 'road-other',
  'road-minor', 'road-link', 'road-major', 'road-highway', 'rail', 'boundary', 'label-road', 'label-road-major',
  'label-place', 'label-place-major', 'label-halo', 'label-water', 'poi', 'poi-green', 'poi-blue',
  'building-3d-top', 'glow', 'sky', 'haze', 'light',
  // measure tool line
  'measure',
];

// Protomaps flavor key → our slot. First match wins. An unknown key throws, so a basemaps upgrade that adds a
// colour is noticed instead of silently keeping a non-token colour.
const RULES = [
  [/_halo$/, 'label-halo'], [/casing/, 'casing'], [/^tunnel_/, 'tunnel'],
  [/^background$/, 'bg'], [/^(earth|glacier)$/, 'earth'], [/^water$/, 'water'],
  [/^(park_a|park_b|zoo)$/, 'park'], [/^wood_/, 'wood'], [/^scrub_/, 'scrub'], [/^(sand|beach)$/, 'sand'],
  [/^school$/, 'school'], [/^hospital$/, 'hospital'], [/^(industrial|military)$/, 'industrial'],
  [/^pedestrian$/, 'pedestrian'], [/^aerodrome$/, 'aerodrome'], [/^runway$/, 'runway'], [/^pier$/, 'pier'],
  [/^buildings$/, 'building'], [/^railway$/, 'rail'], [/^boundaries$/, 'boundary'],
  [/^(bridges_)?(other|minor_service|minor_b)$/, 'road-other'], [/^(bridges_)?minor(_a)?$/, 'road-minor'],
  [/^(bridges_)?link$/, 'road-link'], [/^(bridges_)?major$/, 'road-major'], [/^(bridges_)?highway$/, 'road-highway'],
  [/^roads_label_major$/, 'label-road-major'], [/^(roads_label_minor|address_label)$/, 'label-road'],
  [/^ocean_label$/, 'label-water'], [/^city_label$/, 'label-place-major'],
  [/^(subplace_label|state_label|country_label)$/, 'label-place'],
];
const POI = { green: 'poi-green', blue: 'poi-blue', lapis: 'poi-blue', turquoise: 'poi-blue' };
const LANDCOVER = { grassland: 'park', forest: 'wood', farmland: 'scrub', scrub: 'scrub', barren: 'sand',
  glacier: 'earth', urban_area: 'earth' };

// The Protomaps "dark" flavor is used only as the list of keys to fill; none of its colours survive.
const TEMPLATE = namedFlavor('dark');

function slotFor(key) {
  for (const [re, slot] of RULES) if (re.test(key)) return slot;
  throw new Error(`No map token for Protomaps colour "${key}"`);
}

function flavorFrom(t) {
  const f = {};
  for (const [k, v] of Object.entries(TEMPLATE)) {
    if (k === 'pois') f.pois = Object.fromEntries(Object.keys(v).map((c) => [c, t(POI[c] ?? 'poi')]));
    else if (k === 'landcover') f.landcover = Object.fromEntries(Object.keys(v).map((c) => [c, t(LANDCOVER[c] ?? 'earth')]));
    else if (typeof v === 'string' && /^(#|rgb)/.test(v)) f[k] = t(slotFor(k));
    else f[k] = v;
  }
  return f;
}

const FONT_MAP = { 'Noto Sans Regular': FONTS.regular, 'Noto Sans Medium': FONTS.semibold, 'Noto Sans Italic': FONTS.italic };
function swapFonts(v) {
  if (typeof v === 'string') return FONT_MAP[v] ?? v;
  if (Array.isArray(v)) return v.map(swapFonts);
  return v;
}

// Street names: the Protomaps default is a fixed 12 px with a 1 px halo, which disappears into the road when zoomed
// in. Ours grow with zoom, use a heavier weight for main roads, and carry a solid outline so they lift off the line.
const ROAD_LABEL = {
  roads_labels_minor: { size: ['interpolate', ['linear'], ['zoom'], 15, 13, 17, 15, 18, 16.5, 20, 19.5], font: FONTS.semibold },
  roads_labels_major: { size: ['interpolate', ['linear'], ['zoom'], 11, 12, 15, 14, 18, 17.5, 20, 21], font: FONTS.semibold },
};
function readableLabels(l) {
  const road = ROAD_LABEL[l.id];
  if (road) {
    return { ...l,
      layout: { ...l.layout, 'text-size': road.size, 'text-font': [road.font], 'text-letter-spacing': 0.03,
        'symbol-spacing': 320 },
      paint: { ...l.paint, 'text-halo-width': 2, 'text-halo-blur': 0.4 } };
  }
  if (l.type === 'symbol' && l.layout?.['text-field'] && l.paint?.['text-halo-width'] !== undefined) {
    return { ...l, paint: { ...l.paint, 'text-halo-width': 1.6, 'text-halo-blur': 0.4 } };
  }
  return l;
}

/**
 * The MapLibre style for one variant; every colour comes from the tokens.
 * @param {Record<string,string>} tokens  from readTokens()
 * @param {'night'|'day'|'plan'} variant
 * @param {{basemapUrl: string, glyphs?: string, sprite?: string, attribution?: string}} opts
 *        basemapUrl is the full pmtiles:// URL; glyphs and sprite must be absolute URLs.
 */
export function buildStyle(tokens, variant, { basemapUrl, glyphs, sprite, attribution = '' }) {
  if (!VARIANTS.includes(variant)) throw new Error(`Unknown variant ${variant}`);
  const t = (slot) => {
    const v = tokens[`--map-${variant}-${slot}`];
    if (!v) throw new Error(`Missing map token --map-${variant}-${slot}`);
    return v;
  };
  const origin = globalThis.location?.origin ?? 'http://localhost';
  let ls = layers('basemap', flavorFrom(t), { lang: 'en' }).map((l) =>
    l.layout?.['text-font'] ? { ...l, layout: { ...l.layout, 'text-font': swapFonts(l.layout['text-font']) } } : l);
  ls = ls.map(readableLabels);
  // MapLibre places symbols from the top layer down, so moving street names above the POIs lets them win a collision.
  const streetNames = ls.filter((l) => ROAD_LABEL[l.id]);
  const poiAt = ls.findIndex((l) => l.id === 'pois');
  if (poiAt > -1) {
    ls = ls.filter((l) => !ROAD_LABEL[l.id]);
    ls.splice(ls.findIndex((l) => l.id === 'pois') + 1, 0, ...streetNames);
  }
  // POI icons arrive pre-coloured in the sprite, so tokens can't recolour them: none on the plan sheet, and only
  // from z17 elsewhere, so a city view isn't buried in shop icons.
  ls = variant === 'plan' ? ls.filter((l) => l.id !== 'pois')
    : ls.map((l) => (l.id === 'pois' ? { ...l, minzoom: Math.max(17, l.minzoom ?? 0) } : l));
  if (variant === 'night') {
    // 3D buildings from z15: flat footprints below, extruded blocks above.
    ls = ls.flatMap((l) => l.id !== 'buildings' ? [l] : [
      { ...l, maxzoom: 15 },
      { id: 'buildings_3d', type: 'fill-extrusion', source: 'basemap', 'source-layer': 'buildings', minzoom: 15,
        paint: {
          // Taller is lighter, so a skyline reads at a glance.
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'height'], 6],
            0, t('building-3d'), 120, t('building-3d-top')],
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        } },
    ]);
    // A soft glow under the freeways, like light on wet asphalt.
    const hw = ls.find((l) => l.id === 'roads_highway');
    if (hw) {
      const glow = {
        id: 'roads_highway_glow', type: 'line', source: 'basemap', 'source-layer': hw['source-layer'],
        filter: hw.filter, ...(hw.minzoom !== undefined ? { minzoom: hw.minzoom } : {}),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': t('glow'),
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 3, 12, 12, 16, 34, 20, 80],
          'line-blur': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 2, 12, 8, 16, 24, 20, 60],
          'line-opacity': 0.28,
        },
      };
      const at = ls.findIndex((l) => l.id === 'roads_highway_casing_early' || l.id === 'roads_highway');
      ls.splice(at, 0, glow);
    }
  }
  const night = variant === 'night';
  return {
    version: 8,
    name: `aitt-${variant}`,
    glyphs: glyphs ?? `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: sprite ?? `${origin}/sprites/v4/${variant === 'night' ? 'dark' : 'light'}`,
    sources: { basemap: { type: 'vector', url: basemapUrl, attribution } },
    layers: ls,
    ...(night ? {
      sky: { 'sky-color': t('sky'), 'horizon-color': t('haze'), 'fog-color': t('haze'),
        'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.6 },
      light: { anchor: 'viewport', color: t('light'), intensity: 0.35, position: [1.15, 210, 30] },
    } : {}),
  };
}
