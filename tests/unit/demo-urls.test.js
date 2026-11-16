import { describe, it, expect } from 'vitest';
import { dataUrl } from '../../demo/urls.js';

describe('demo link parameters (?basemap=, ?photos=)', () => {
  const origin = 'https://map.aitransportationtools.com';
  it('the published demo ignores a link pointing at another site', () => {
    expect(dataUrl('https://evil.example/fake.pmtiles', '/data/x.pmtiles', { dev: false, origin })).toBe('/data/x.pmtiles');
    expect(dataUrl('//evil.example/fake.pmtiles', '/data/x.pmtiles', { dev: false, origin })).toBe('/data/x.pmtiles');
  });
  it('the published demo accepts a path on its own site', () => {
    expect(dataUrl('/data/missing.pmtiles', '/data/x.pmtiles', { dev: false, origin })).toBe('/data/missing.pmtiles');
  });
  it('local development accepts anything, for testing', () => {
    expect(dataUrl('https://other.example/a.pmtiles', '/data/x.pmtiles', { dev: true, origin })).toBe('https://other.example/a.pmtiles');
  });
  it('no parameter gives the default', () => {
    expect(dataUrl(null, '/data/x.pmtiles', { dev: false, origin })).toBe('/data/x.pmtiles');
  });
});
