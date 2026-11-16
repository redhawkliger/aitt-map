import { describe, it, expect } from 'vitest';
import { planUpload, publicUrls } from '../../scripts/upload-r2.mjs';

describe('R2 upload plan', () => {
  const photos = ['alameda-county-ca.pmtiles', 'san-francisco-ca.pmtiles'];
  const plan = planUpload({ build: '20261114', fonts: ['Overpass Regular/0-255.pbf', 'Overpass Bold/256-511.pbf'], photos });

  it('the basemap goes up under its exact build date, so rollback is a one-line change', () => {
    const b = plan.find((x) => x.local === 'data/california.pmtiles');
    expect(b.key).toBe('basemap/v20261114.pmtiles');
    expect(b.contentType).toBe('application/octet-stream');
  });
  it('each county photo file goes up under imagery/naip-2024/ with its own name', () => {
    const p = plan.filter((x) => x.key.startsWith('imagery/'));
    expect(p.map((x) => [x.local, x.key])).toEqual([
      ['data/naip/alameda-county-ca.pmtiles', 'imagery/naip-2024/alameda-county-ca.pmtiles'],
      ['data/naip/san-francisco-ca.pmtiles', 'imagery/naip-2024/san-francisco-ca.pmtiles'],
    ]);
  });
  it('fonts keep their folder names and are marked as protobuf', () => {
    const f = plan.filter((x) => x.key.startsWith('fonts/'));
    expect(f.map((x) => x.key)).toEqual(['fonts/Overpass Regular/0-255.pbf', 'fonts/Overpass Bold/256-511.pbf']);
    expect(f.every((x) => x.contentType === 'application/x-protobuf' && x.local.startsWith('public/fonts/'))).toBe(true);
  });
  it('builds the public URLs the demo and other apps use', () => {
    expect(publicUrls('https://tiles.aitransportationtools.com/', '20261114', photos)).toEqual({
      basemapUrl: 'https://tiles.aitransportationtools.com/basemap/v20261114.pmtiles',
      photosUrls: [
        'https://tiles.aitransportationtools.com/imagery/naip-2024/alameda-county-ca.pmtiles',
        'https://tiles.aitransportationtools.com/imagery/naip-2024/san-francisco-ca.pmtiles',
      ],
      glyphs: 'https://tiles.aitransportationtools.com/fonts/{fontstack}/{range}.pbf',
    });
  });
});
