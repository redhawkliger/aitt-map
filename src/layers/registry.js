/**
 * Data layers on top of the basemap: crashes, counts, aerial photos, a tool's results.
 * Each has an id, a name, a group, one or more sources and MapLibre layers, and can be switched on/off and made
 * see-through. Photo layers can also be faded: lightened and softened, for report backgrounds.
 */

export class LayerExistsError extends Error {
  constructor(id) { super(`A map layer with id "${id}" already exists`); this.name = 'LayerExistsError'; }
}

const GROUPS = ['basemap', 'imagery', 'data'];
const OPACITY_PROPS = {
  raster: ['raster-opacity'], fill: ['fill-opacity'], line: ['line-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['icon-opacity', 'text-opacity'], 'fill-extrusion': ['fill-extrusion-opacity'], heatmap: ['heatmap-opacity'],
};

const state = new WeakMap(); // map -> { entries: Map<id, entry>, styleFor?: (variant) => style }
function reg(map) {
  if (!state.has(map)) state.set(map, { entries: new Map() });
  return state.get(map);
}

/** Tell the registry how to build the basemap style for a variant, so setBasemapVariant can swap it. */
export function useBasemap(map, styleFor, variant = 'night') { Object.assign(reg(map), { styleFor, variant }); }

/** The current basemap variant, or undefined when useBasemap was never called. */
export function basemapVariant(map) { return reg(map).styleFor ? reg(map).variant : undefined; }

const changed = (map) => map.fire?.('aitt:layers');

/** The id of the first basemap label layer: aerial photos go under it so names stay readable on top. */
function firstLabelId(map) {
  const data = new Set([...reg(map).entries.values()].filter((e) => e.added).flatMap((e) => e.layers.map((l) => l.id)));
  return map.getStyle().layers.find((l) => l.type === 'symbol' && !data.has(l.id))?.id;
}

const clamp = (v, dflt = 1) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : dflt));
const isPhoto = (entry) => entry.layers.some((l) => l.type === 'raster');
// Fade 0..1: lift the darks, drain the colour and flatten the contrast, so a photo reads as a quiet backdrop.
const fadePaint = (fade) => ({ 'raster-brightness-min': 0.55 * fade, 'raster-saturation': -0.75 * fade || 0, 'raster-contrast': -0.3 * fade || 0 });

function applyOpacity(map, entry) {
  for (const l of entry.layers) {
    for (const p of OPACITY_PROPS[l.type] ?? []) {
      const base = typeof l.paint?.[p] === 'number' ? l.paint[p] : 1;
      map.setPaintProperty(l.id, p, base * entry.opacity);
    }
  }
}
function applyFade(map, entry) {
  for (const l of entry.layers) {
    if (l.type !== 'raster') continue;
    for (const [p, v] of Object.entries(fadePaint(entry.fade))) map.setPaintProperty(l.id, p, v);
  }
}
function applyVisible(map, entry) {
  for (const l of entry.layers) map.setLayoutProperty(l.id, 'visibility', entry.visible ? 'visible' : 'none');
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {{id: string, name: string, group: 'basemap'|'data'|'imagery', source?: object,
 *          sources?: Record<string, object>, layers: object[], visible?: boolean, opacity?: number, fade?: number,
 *          restyle?: (variant: string) => object[]}} spec
 *        source: one source, added under the layer's id. sources: several, by their own ids, for one switch that
 *        draws from more than one place (e.g. statewide imagery with crisp local photos on top).
 *        restyle: rebuild the layers for another style variant (its colours), used by setBasemapVariant.
 */
export function addDataLayer(map, { id, name, group, source, sources, layers, visible = true, opacity = 1, fade = 0, restyle }) {
  const r = reg(map);
  const srcs = sources ?? { [id]: source };
  if (r.entries.has(id)) throw new LayerExistsError(id);
  if (!GROUPS.includes(group)) throw new Error(`Unknown layer group "${group}"`);
  // Check every source and map layer id against the live map and against registered layers not yet on it (hidden).
  const takenSrc = new Set([...r.entries.values()].flatMap((e) => Object.keys(e.sources)));
  for (const sid of Object.keys(srcs)) if (map.getSource(sid) || takenSrc.has(sid)) throw new LayerExistsError(sid);
  const taken = new Set([...r.entries.values()].flatMap((e) => e.layers.map((l) => l.id)));
  for (const l of layers) if (map.getLayer(l.id) || taken.has(l.id)) throw new LayerExistsError(l.id);
  const entry = { id, name, group, sources: srcs, layers, restyle, visible: !!visible, opacity: clamp(opacity),
    fade: clamp(fade, 0), added: false };
  // A hidden layer costs nothing (no file opened, nothing to wait for) until it is first switched on.
  if (entry.visible) mount(map, entry); // throws on a bad spec, before anything is registered
  r.entries.set(id, entry);
  changed(map);
}

function mount(map, entry) {
  const before = entry.group === 'imagery' ? firstLabelId(map) : undefined;
  try {
    for (const [sid, src] of Object.entries(entry.sources)) map.addSource(sid, src);
    for (const l of entry.layers) map.addLayer(l, before);
  } catch (err) {
    for (const l of entry.layers) if (map.getLayer(l.id)) map.removeLayer(l.id);
    for (const sid of Object.keys(entry.sources)) if (map.getSource(sid)) map.removeSource(sid);
    throw err;
  }
  entry.added = true;
  applyVisible(map, entry);
  applyOpacity(map, entry);
  if (isPhoto(entry)) applyFade(map, entry);
}

function entryOf(map, id) {
  const e = reg(map).entries.get(id);
  if (!e) throw new Error(`No map layer with id "${id}"`);
  return e;
}

/**
 * Replace the GeoJSON data of an overlay (e.g. new crash results). The new data also survives a style swap.
 */
export function setLayerData(map, id, data) {
  const e = entryOf(map, id);
  const sid = Object.keys(e.sources)[0];
  if (e.sources[sid].type !== 'geojson') throw new Error(`Layer "${id}" is not GeoJSON`);
  e.sources[sid] = { ...e.sources[sid], data };
  map.getSource(sid)?.setData(data);
}

export function setLayerVisible(map, id, visible) {
  const e = entryOf(map, id);
  e.visible = !!visible;
  if (!e.added) { if (e.visible) mount(map, e); } else applyVisible(map, e);
  changed(map);
}

export function setLayerOpacity(map, id, opacity) {
  const e = entryOf(map, id);
  e.opacity = clamp(opacity);
  if (e.added) applyOpacity(map, e);
  changed(map);
}

/** Fade a photo layer 0..1 (0 = as shot, 1 = a light, quiet backdrop for reports). */
export function setLayerFade(map, id, fade) {
  const e = entryOf(map, id);
  e.fade = clamp(fade, 0);
  if (e.added) applyFade(map, e);
  changed(map);
}

/** @returns {{id: string, name: string, group: string, visible: boolean, opacity: number, fade?: number}[]}
 *  in the order added; fade only on photo layers. */
export function listLayers(map) {
  return [...reg(map).entries.values()].map((e) => ({ id: e.id, name: e.name, group: e.group, visible: e.visible,
    opacity: e.opacity, ...(isPhoto(e) ? { fade: e.fade } : {}) }));
}

// A layer spec with the entry's visibility and opacity written in, for putting into a whole new style.
function withSettings(entry, l) {
  const out = { ...l, layout: { ...l.layout, visibility: entry.visible ? 'visible' : 'none' }, paint: { ...l.paint } };
  for (const p of OPACITY_PROPS[l.type] ?? []) out.paint[p] = (typeof l.paint?.[p] === 'number' ? l.paint[p] : 1) * entry.opacity;
  if (l.type === 'raster') Object.assign(out.paint, fadePaint(entry.fade));
  return out;
}

/** Swap night/day/plan. Data layers, their order, visibility and opacity all carry over. */
export function setBasemapVariant(map, variant) {
  const r = reg(map);
  if (!r.styleFor) throw new Error('Call useBasemap(map, styleFor) before setBasemapVariant');
  for (const e of r.entries.values()) if (!e.added && e.restyle) e.layers = e.restyle(variant);
  const entries = [...r.entries.values()].filter((e) => e.added);
  const fresh = new Map(); // layer id -> rebuilt layer, for entries that restyle per variant
  for (const e of entries) {
    if (!e.restyle) continue;
    e.layers = e.restyle(variant);
    for (const l of e.layers) fresh.set(l.id, withSettings(e, l));
  }
  const dataIds = new Set(entries.flatMap((e) => e.layers.map((l) => l.id)));
  map.setStyle(r.styleFor(variant), {
    transformStyle: (prev, next) => {
      const carried = prev.layers.filter((l) => dataIds.has(l.id)).map((l) => fresh.get(l.id) ?? l);
      const sources = { ...next.sources };
      for (const e of entries) for (const [sid, src] of Object.entries(e.sources)) sources[sid] = prev.sources[sid] ?? src;
      const imagery = carried.filter((l) => entries.find((e) => e.group === 'imagery' && e.layers.some((x) => x.id === l.id)));
      const rest = carried.filter((l) => !imagery.includes(l));
      const layers = [...next.layers];
      const at = layers.findIndex((l) => l.type === 'symbol');
      layers.splice(at < 0 ? layers.length : at, 0, ...imagery);
      return { ...next, sources, layers: [...layers, ...rest] };
    },
  });
  r.variant = variant;
  const c = map.getContainer();
  if (c?.dataset) c.dataset.mapVariant = variant;
  changed(map);
}
