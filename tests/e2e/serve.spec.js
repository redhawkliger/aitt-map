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

test('bad data requests get an error answer and the server stays up', async ({ request }) => {
  expect((await request.get('/data/')).status()).toBe(404);
  expect((await request.get('/data/%E0%A4%A')).status()).toBe(400);
  expect((await request.get('/data/..%2Fpackage.json')).status()).toBe(404);
  const ok = await request.get('/data/california.pmtiles', { headers: { Range: 'bytes=0-15' } });
  expect(ok.status()).toBe(206);
});
