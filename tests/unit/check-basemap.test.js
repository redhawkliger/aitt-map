import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { checkBasemap } from '../../scripts/check-basemap.mjs';

const FILE = 'data/california.pmtiles';

describe.skipIf(!existsSync(FILE))('checkBasemap', () => {
  it('reports California bounds and the label layers', async () => {
    const info = await checkBasemap(FILE);
    expect(info.maxZoom).toBeGreaterThanOrEqual(15);
    const [w, s, e, n] = info.bounds;
    expect(w).toBeLessThanOrEqual(-124.4); expect(e).toBeGreaterThanOrEqual(-114.1);
    expect(s).toBeLessThanOrEqual(32.5); expect(n).toBeGreaterThanOrEqual(42.0);
    for (const l of ['roads', 'places', 'buildings', 'water', 'pois']) expect(info.layers).toContain(l);
  });
});
