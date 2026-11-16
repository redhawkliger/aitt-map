import { test, expect } from '@playwright/test';

// How an app (CrashIQ, DemandIQ, StreetCanvas, TrafficOpsIQ) puts its results on the shared map.
test('an app adds LOS dots, a click gives the dot\'s data, new data survives a style swap', async ({ page }) => {
  await page.goto('/demo/?center=-122.0436,37.5934&zoom=16');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  const point = await page.evaluate(async () => {
    const kit = await import('/src/index.js');
    const map = window.__map;
    const fc = (g) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { los: g, name: 'Dyer St' },
      geometry: { type: 'Point', coordinates: [-122.0436, 37.5934] } }] });
    const opts = { id: 'los', name: 'Level of service', data: fc('C'), color: { by: 'los', values: ['A', 'B', 'C', 'D', 'E', 'F'] },
      radius: 10, label: 'name' };
    kit.addDataLayer(map, kit.pointsLayer(kit.readTokens(), kit.basemapVariant(map), opts));
    window.__clicked = [];
    kit.onFeatureClick(map, 'los-points', (f) => window.__clicked.push(f.properties.los));
    window.__kit = kit;
    await new Promise((r) => map.once('idle', r));
    const p = map.project([-122.0436, 37.5934]);
    return { x: p.x, y: p.y };
  });
  const box = await page.locator('#map canvas').boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y);
  await expect.poll(() => page.evaluate(() => window.__clicked)).toEqual(['C']);

  // New results arrive (LOS got worse), then the user switches to Report for a figure: still F, in Report colours.
  await page.evaluate(() => window.__kit.setLayerData(window.__map, 'los', { type: 'FeatureCollection', features: [{ type: 'Feature',
    properties: { los: 'F', name: 'Dyer St' }, geometry: { type: 'Point', coordinates: [-122.0436, 37.5934] } }] }));
  await page.getByRole('radio', { name: 'Report' }).click();
  await page.waitForFunction(() => window.__map.getStyle().name === 'aitt-report', null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 30_000 });
  const after = await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['los-points'] }).map((f) => f.properties.los));
  expect(after).toEqual(['F']);
  const color = await page.evaluate(() => JSON.stringify(window.__map.getPaintProperty('los-points', 'circle-color')));
  expect(color.toLowerCase()).toContain('#a3122e'); // Report's ramp-6 (worst)
  await expect(page.getByRole('switch', { name: 'Level of service' })).toBeChecked();
});
