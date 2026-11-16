import { describe, it, expect } from 'vitest';
import { addDataLayer, setLayerVisible, setLayerOpacity, listLayers, setBasemapVariant, useBasemap, LayerExistsError }
  from '../../src/layers/registry.js';

// A stand-in for maplibregl.Map with just the style calls the registry uses (the real map needs WebGL).
function fakeMap(style) {
  let st = structuredClone(style);
  const find = (id) => st.layers.find((l) => l.id === id);
  return {
    getContainer: () => ({ dataset: {} }),
    getStyle: () => structuredClone(st),
    addSource: (id, src) => { st.sources[id] = src; },
    getSource: (id) => st.sources[id],
    addLayer: (l, before) => {
      const at = before ? st.layers.findIndex((x) => x.id === before) : -1;
      at < 0 ? st.layers.push(structuredClone(l)) : st.layers.splice(at, 0, structuredClone(l));
    },
    getLayer: (id) => find(id),
    setLayoutProperty: (id, k, v) => { const l = find(id); l.layout = { ...l.layout, [k]: v }; },
    setPaintProperty: (id, k, v) => { const l = find(id); l.paint = { ...l.paint, [k]: v }; },
    getLayoutProperty: (id, k) => find(id).layout?.[k],
    getPaintProperty: (id, k) => find(id).paint?.[k],
    setStyle: (next, { transformStyle } = {}) => { st = structuredClone(transformStyle ? transformStyle(st, next) : next); },
  };
}
const base = (name) => ({ version: 8, name, sources: { basemap: { type: 'vector', url: 'x' } },
  layers: [{ id: 'earth', type: 'background' }, { id: 'labels', type: 'symbol', source: 'basemap', 'source-layer': 'places' }] });
const crashes = { id: 'crashes', name: 'Crashes', group: 'data', source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  layers: [{ id: 'crashes-dots', type: 'circle', source: 'crashes', paint: { 'circle-radius': 4 } }] };
const photos = { id: 'naip', name: 'Aerial photos', group: 'imagery', source: { type: 'raster', url: 'pmtiles://x', tileSize: 256 },
  layers: [{ id: 'naip-raster', type: 'raster', source: 'naip' }], visible: false };

describe('layer registry', () => {
  it('adding the same id twice throws LayerExistsError', () => {
    const m = fakeMap(base('night'));
    addDataLayer(m, crashes);
    expect(() => addDataLayer(m, crashes)).toThrow(LayerExistsError);
  });

  it('opacity is clamped to 0..1', () => {
    const m = fakeMap(base('night'));
    addDataLayer(m, crashes);
    setLayerOpacity(m, 'crashes', 3);
    expect(listLayers(m)[0].opacity).toBe(1);
    expect(m.getPaintProperty('crashes-dots', 'circle-opacity')).toBe(1);
    setLayerOpacity(m, 'crashes', -2);
    expect(listLayers(m)[0].opacity).toBe(0);
    expect(m.getPaintProperty('crashes-dots', 'circle-opacity')).toBe(0);
  });

  it('listLayers reflects visibility changes', () => {
    const m = fakeMap(base('night'));
    addDataLayer(m, crashes);
    expect(listLayers(m)).toEqual([{ id: 'crashes', name: 'Crashes', group: 'data', visible: true, opacity: 1 }]);
    setLayerVisible(m, 'crashes', false);
    expect(listLayers(m)[0].visible).toBe(false);
    expect(m.getLayoutProperty('crashes-dots', 'visibility')).toBe('none');
  });

  it('aerial photos go under the labels, data goes on top', () => {
    const m = fakeMap(base('night'));
    addDataLayer(m, { ...photos, visible: true });
    addDataLayer(m, crashes);
    expect(m.getStyle().layers.map((l) => l.id)).toEqual(['earth', 'naip-raster', 'labels', 'crashes-dots']);
  });

  it('setBasemapVariant keeps data layers and their settings', () => {
    const m = fakeMap(base('night'));
    useBasemap(m, (v) => base(v));
    addDataLayer(m, photos);
    addDataLayer(m, crashes);
    setLayerOpacity(m, 'crashes', 0.4);
    setLayerVisible(m, 'naip', true);
    setBasemapVariant(m, 'day');
    const st = m.getStyle();
    expect(st.name).toBe('day');
    expect(st.layers.map((l) => l.id)).toEqual(['earth', 'naip-raster', 'labels', 'crashes-dots']);
    expect(m.getPaintProperty('crashes-dots', 'circle-opacity')).toBe(0.4);
    expect(m.getLayoutProperty('naip-raster', 'visibility')).toBe('visible');
    expect(listLayers(m).map((l) => [l.id, l.visible, l.opacity])).toEqual([['naip', true, 1], ['crashes', true, 0.4]]);
  });

  it('a layer with restyle gets its colours for the new variant, and keeps its settings', () => {
    const m = fakeMap(base('night'));
    useBasemap(m, (v) => base(v));
    const dots = (v) => [{ id: 'tc-dots', type: 'circle', source: 'tc', paint: { 'circle-color': v === 'night' ? '#111111' : '#eeeeee' } }];
    addDataLayer(m, { id: 'tc', name: 'Traffic', group: 'data', source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      layers: dots('night'), restyle: dots });
    setLayerOpacity(m, 'tc', 0.5);
    setBasemapVariant(m, 'day');
    expect(m.getPaintProperty('tc-dots', 'circle-color')).toBe('#eeeeee');
    expect(m.getPaintProperty('tc-dots', 'circle-opacity')).toBe(0.5);
  });

  it('a hidden layer costs nothing until it is switched on (its source is added then)', () => {
    const m = fakeMap(base('night'));
    addDataLayer(m, photos);
    expect(m.getSource('naip')).toBeUndefined();
    expect(listLayers(m)).toEqual([{ id: 'naip', name: 'Aerial photos', group: 'imagery', visible: false, opacity: 1 }]);
    setLayerOpacity(m, 'naip', 0.5);
    setLayerVisible(m, 'naip', true);
    expect(m.getSource('naip')).toBeDefined();
    expect(m.getStyle().layers.map((l) => l.id)).toEqual(['earth', 'naip-raster', 'labels']);
    expect(m.getPaintProperty('naip-raster', 'raster-opacity')).toBe(0.5);
    expect(() => addDataLayer(m, photos)).toThrow(LayerExistsError);
  });

  it('a style swap keeps a never-shown layer pending, and it still appears when switched on', () => {
    const m = fakeMap(base('night'));
    useBasemap(m, (v) => base(v));
    addDataLayer(m, photos);
    setBasemapVariant(m, 'day');
    expect(m.getSource('naip')).toBeUndefined();
    setLayerVisible(m, 'naip', true);
    expect(m.getStyle().layers.map((l) => l.id)).toEqual(['earth', 'naip-raster', 'labels']);
  });

  it('a map layer id already used by a hidden layer is refused up front', () => {
    const m = fakeMap(base('night'));
    addDataLayer(m, photos); // hidden, so naip-raster is not on the map yet
    const clash = { id: 'b', name: 'B', group: 'data', source: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      layers: [{ id: 'naip-raster', type: 'circle', source: 'b' }] };
    expect(() => addDataLayer(m, clash)).toThrow(LayerExistsError);
    expect(listLayers(m).map((l) => l.id)).toEqual(['naip']);
  });

  it('a layer whose source fails to add is not left half-registered', () => {
    const m = fakeMap(base('night'));
    m.addSource = () => { throw new Error('bad source'); };
    expect(() => addDataLayer(m, crashes)).toThrow('bad source');
    expect(listLayers(m)).toEqual([]);
  });

  it('setBasemapVariant without a registered basemap says so', () => {
    expect(() => setBasemapVariant(fakeMap(base('night')), 'day')).toThrow(/useBasemap/);
  });
});
