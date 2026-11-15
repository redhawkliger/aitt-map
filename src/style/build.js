import { layers, namedFlavor } from '@protomaps/basemaps';

export const VARIANTS = ['night', 'day', 'plan'];
export const FONTS = { regular: 'Overpass Regular', semibold: 'Overpass SemiBold', bold: 'Overpass Bold', italic: 'Overpass Italic' };
export const MAP_SLOTS = [
  'bg', 'earth', 'water', 'water-label', 'park', 'wood', 'scrub', 'sand', 'school', 'hospital', 'industrial',
  'pedestrian', 'aerodrome', 'runway', 'pier', 'building', 'building-3d', 'casing', 'tunnel', 'road-other',
  'road-minor', 'road-link', 'road-major', 'road-highway', 'rail', 'boundary', 'label-road', 'label-road-major',
  'label-place', 'label-place-major', 'label-halo', 'label-water', 'poi', 'poi-green', 'poi-blue',
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
          'fill-extrusion-color': t('building-3d'),
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.9,
        } },
    ]);
  }
  return {
    version: 8,
    name: `aitt-${variant}`,
    glyphs: glyphs ?? `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: sprite ?? `${origin}/sprites/v4/${variant === 'night' ? 'dark' : 'light'}`,
    sources: { basemap: { type: 'vector', url: basemapUrl, attribution } },
    layers: ls,
  };
}
