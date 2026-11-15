import { test, expect } from '@playwright/test';

test('the dev server answers a range request with 206', async ({ request }) => {
  const res = await request.get('/data/california.pmtiles', { headers: { Range: 'bytes=0-126' } });
  expect(res.status()).toBe(206);
  expect((await res.body()).length).toBe(127);
});

test('a bare map renders tiles', async ({ page }) => {
  await page.goto('/demo/');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  const roads = await page.evaluate(() =>
    window.__map.queryRenderedFeatures().filter((f) => f.sourceLayer === 'roads').length);
  expect(roads).toBeGreaterThan(0);
});
