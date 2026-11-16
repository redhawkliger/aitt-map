import { describe, it, expect } from 'vitest';
import { planUpload, publicUrls } from '../../scripts/upload-r2.mjs';

describe('R2 upload plan', () => {
  const plan = planUpload({ build: '20261114', fonts: ['Overpass Regular/0-255.pbf', 'Overpass Bold/256-511.pbf'] });

  it('the basemap goes up under its exact build date, so rollback is a one-line change', () => {
    const b = plan.find((x) => x.local === 'data/california.pmtiles');
    expect(b.key).toBe('basemap/v20261114.pmtiles');
    expect(b.contentType).toBe('application/octet-stream');
  });
  it('the aerial photos go up under imagery/', () => {
    expect(plan.find((x) => x.local === 'data/union-city-naip.pmtiles').key).toBe('imagery/union-city-naip-2022.pmtiles');
  });
  it('fonts keep their folder names and are marked as protobuf', () => {
    const f = plan.filter((x) => x.key.startsWith('fonts/'));
    expect(f.map((x) => x.key)).toEqual(['fonts/Overpass Regular/0-255.pbf', 'fonts/Overpass Bold/256-511.pbf']);
    expect(f.every((x) => x.contentType === 'application/x-protobuf' && x.local.startsWith('public/fonts/'))).toBe(true);
  });
  it('builds the public URLs the demo and other apps use', () => {
    expect(publicUrls('https://tiles.aitransportationtools.com', '20261114')).toEqual({
      basemapUrl: 'https://tiles.aitransportationtools.com/basemap/v20261114.pmtiles',
      photosUrl: 'https://tiles.aitransportationtools.com/imagery/union-city-naip-2022.pmtiles',
      glyphs: 'https://tiles.aitransportationtools.com/fonts/{fontstack}/{range}.pbf',
    });
  });
});
