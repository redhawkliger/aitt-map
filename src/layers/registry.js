/**
 * Data layers on top of the basemap: crashes, counts, aerial photos, the traffic-control layer, a tool's results.
 * Each has an id, a name, a group, one source and one or more MapLibre layers, and can be switched on/off and faded.
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
  const data = new Set([...reg(map).entries.values()].flatMap((e) => e.layers.map((l) => l.id)));
  return map.getStyle().layers.find((l) => l.type === 'symbol' && !data.has(l.id))?.id;
}

const clamp = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));

function applyOpacity(map, entry) {
  for (const l of entry.layers) {
    for (const p of OPACITY_PROPS[l.type] ?? []) {
      const base = typeof l.paint?.[p] === 'number' ? l.paint[p] : 1;
      map.setPaintProperty(l.id, p, base * entry.opacity);
    }
  }
}
function applyVisible(map, entry) {
  for (const l of entry.layers) map.setLayoutProperty(l.id, 'visibility', entry.visible ? 'visible' : 'none');
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {{id: string, name: string, group: 'basemap'|'data'|'imagery', source: object, layers: object[],
 *          visible?: boolean, opacity?: number, restyle?: (variant: string) => object[]}} spec
 *        restyle: rebuild the layers for another style variant (its colours), used by setBasemapVariant.
 */
export function addDataLayer(map, { id, name, group, source, layers, visible = true, opacity = 1, restyle }) {
  const r = reg(map);
  if (r.entries.has(id) || map.getSource(id)) throw new LayerExistsError(id);
  if (!GROUPS.includes(group)) throw new Error(`Unknown layer group "${group}"`);
  const before = group === 'imagery' ? firstLabelId(map) : undefined;
  map.addSource(id, source);
  for (const l of layers) {
    if (map.getLayer(l.id)) throw new LayerExistsError(l.id);
    map.addLayer(l, before);
  }
  const entry = { id, name, group, source, layers, restyle, visible: !!visible, opacity: clamp(opacity) };
  r.entries.set(id, entry);
  applyVisible(map, entry);
  applyOpacity(map, entry);
  changed(map);
}

function entryOf(map, id) {
  const e = reg(map).entries.get(id);
  if (!e) throw new Error(`No map layer with id "${id}"`);
  return e;
}

export function setLayerVisible(map, id, visible) {
  const e = entryOf(map, id);
  e.visible = !!visible;
  applyVisible(map, e);
  changed(map);
}

export function setLayerOpacity(map, id, opacity) {
  const e = entryOf(map, id);
  e.opacity = clamp(opacity);
  applyOpacity(map, e);
  changed(map);
}

/** @returns {{id: string, name: string, group: string, visible: boolean, opacity: number}[]} in the order added */
export function listLayers(map) {
  return [...reg(map).entries.values()].map(({ id, name, group, visible, opacity }) => ({ id, name, group, visible, opacity }));
}

// A layer spec with the entry's visibility and opacity written in, for putting into a whole new style.
function withSettings(entry, l) {
  const out = { ...l, layout: { ...l.layout, visibility: entry.visible ? 'visible' : 'none' }, paint: { ...l.paint } };
  for (const p of OPACITY_PROPS[l.type] ?? []) out.paint[p] = (typeof l.paint?.[p] === 'number' ? l.paint[p] : 1) * entry.opacity;
  return out;
}

/** Swap night/day/plan. Data layers, their order, visibility and opacity all carry over. */
export function setBasemapVariant(map, variant) {
  const r = reg(map);
  if (!r.styleFor) throw new Error('Call useBasemap(map, styleFor) before setBasemapVariant');
  const entries = [...r.entries.values()];
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
      for (const e of entries) sources[e.id] = prev.sources[e.id] ?? e.source;
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
