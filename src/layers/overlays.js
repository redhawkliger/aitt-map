import { FONTS } from '../style/build.js';

/**
 * Drop-in overlays for the apps: points (crashes, count sites, LOS dots) and lines (corridors, volume bands), drawn
 * in the active style's colours. Each returns a spec for addDataLayer, with restyle built in, so a Night/Day/... swap
 * redraws it in the new style. Data is GeoJSON; replace it later with setLayerData.
 *
 * Colour rules (both use the style's 6-step ramp, ramp-1 = best/lowest ... ramp-6 = worst/highest):
 *   { by: 'los', values: ['A','B','C','D','E','F'] }   categories, in order (up to 6)
 *   { by: 'aadt', breaks: [5000, 10000, 20000] }        numbers, stepped at the breaks (up to 5 breaks)
 * With no rule, the style's accent colour (the measure line colour) is used.
 */
export const RAMP = ['ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5', 'ramp-6'];

const num = (by) => ['to-number', ['get', by]];

function colorExpr(t, color) {
  if (!color) return t('measure');
  if (color.values) {
    if (color.values.length > RAMP.length) throw new Error(`A colour rule takes at most ${RAMP.length} categories`);
    return ['match', ['get', color.by], ...color.values.flatMap((v, i) => [v, t(RAMP[i])]), t('poi')];
  }
  if (color.breaks) {
    if (color.breaks.length > RAMP.length - 1) throw new Error(`A colour rule takes at most ${RAMP.length - 1} breaks (6 steps)`);
    return ['step', num(color.by), t(RAMP[0]), ...color.breaks.flatMap((b, i) => [b, t(RAMP[i + 1])])];
  }
  throw new Error('A colour rule needs "values" or "breaks"');
}

/** A fixed number, or { by, range: [lo, hi], px: [small, large] } to scale with a value. */
function sizeExpr(size, dflt) {
  if (size == null) return dflt;
  if (typeof size === 'number') return size;
  return ['interpolate', ['linear'], num(size.by), size.range[0], size.px[0], size.range[1], size.px[1]];
}

const tokenFn = (tokens, variant) => (slot) => tokens[`--map-${variant}-${slot}`];

/**
 * @param {Record<string,string>} tokens  from readTokens()
 * @param {string} variant
 * @param {{id: string, name: string, data: object, color?: object, radius?: number|object, label?: string, visible?: boolean}} o
 *   label: a property to print next to each point (shown from zoom 14).
 */
export function pointsLayer(tokens, variant, o) {
  const t = tokenFn(tokens, variant);
  const layers = [{
    id: `${o.id}-points`, type: 'circle', source: o.id,
    paint: { 'circle-color': colorExpr(t, o.color), 'circle-radius': sizeExpr(o.radius, 6),
      'circle-stroke-color': t('label-halo'), 'circle-stroke-width': 1.5 },
  }];
  if (o.label) layers.push({
    id: `${o.id}-labels`, type: 'symbol', source: o.id, minzoom: 14,
    layout: { 'text-field': ['to-string', ['get', o.label]], 'text-font': [FONTS.semibold], 'text-size': 12,
      'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-optional': true },
    paint: { 'text-color': t('label-road-major'), 'text-halo-color': t('label-halo'), 'text-halo-width': 1.6 },
  });
  return spec(o, layers, (v) => pointsLayer(tokens, v, o).layers);
}

/**
 * @param {{id: string, name: string, data: object, color?: object, width?: number|object, visible?: boolean}} o
 */
export function linesLayer(tokens, variant, o) {
  const t = tokenFn(tokens, variant);
  const layers = [{
    id: `${o.id}-lines`, type: 'line', source: o.id,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colorExpr(t, o.color), 'line-width': sizeExpr(o.width, 4), 'line-opacity': 0.9 },
  }];
  return spec(o, layers, (v) => linesLayer(tokens, v, o).layers);
}

function spec(o, layers, restyle) {
  return { id: o.id, name: o.name, group: 'data', visible: o.visible ?? true,
    sources: { [o.id]: { type: 'geojson', data: o.data } }, layers, restyle };
}

/**
 * Call handler(feature, lngLat) when a feature of one of these map layers is clicked, and show a pointer over them.
 * Returns a function that removes the listeners.
 */
export function onFeatureClick(map, layerIds, handler) {
  const ids = [].concat(layerIds);
  const click = (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ids.filter((id) => map.getLayer(id)) })[0];
    if (f) handler(f, e.lngLat);
  };
  const move = (e) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ids.filter((id) => map.getLayer(id)) }).length > 0;
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
  };
  map.on('click', click);
  map.on('mousemove', move);
  return () => { map.off('click', click); map.off('mousemove', move); map.getCanvas().style.cursor = ''; };
}
