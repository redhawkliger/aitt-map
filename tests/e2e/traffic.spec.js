import { test, expect } from '@playwright/test';

// Needs data/traffic.pmtiles (npm run traffic). Skipped where it hasn't been built.
test.beforeEach(async ({ request }) => {
  const res = await request.get('/data/traffic.pmtiles', { headers: { Range: 'bytes=0-15' } });
  test.skip(res.status() !== 206, 'data/traffic.pmtiles not built');
});

async function ready(page, url) {
  const missing = [];
  page.on('console', (m) => /could not be loaded|Image .* missing/i.test(m.text()) && missing.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  return missing;
}
const drawn = (page, layer) => page.evaluate((l) => window.__map.queryRenderedFeatures({ layers: [l] }).length, layer);

test('signals and crosswalks show at an Alvarado-Niles Road intersection', async ({ page }) => {
  const missing = await ready(page, '/demo/?center=-122.0436,37.5934&zoom=17');
  expect(await drawn(page, 'traffic-control')).toBeGreaterThan(0);
  const kinds = await page.evaluate(() => [...new Set(window.__map.queryRenderedFeatures({ layers: ['traffic-control'] })
    .map((f) => f.properties.kind))]);
  expect(kinds).toContain('traffic_signals');
  expect(missing).toEqual([]);
});

test('lane and speed labels show along streets from zoom 16', async ({ page }) => {
  await ready(page, '/demo/?center=-122.0436,37.5934&zoom=17');
  expect(await drawn(page, 'traffic-lanes-label')).toBeGreaterThan(0);
});

test('road details switch off from the panel', async ({ page }) => {
  await ready(page, '/demo/?center=-122.0436,37.5934&zoom=17');
  await page.getByRole('switch', { name: 'Road details' }).click();
  expect(await page.evaluate(() => window.__map.getLayoutProperty('traffic-control', 'visibility'))).toBe('none');
});
