import { test, expect } from '@playwright/test';

test('an unreachable basemap shows the offline message', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demo/?basemap=/data/missing.pmtiles');
  await expect(page.locator('.aitt-map-offline')).toHaveText('Map data is offline', { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('without WebGL the map says so instead of crashing', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) {
      return /webgl/i.test(t) ? null : orig.call(this, t, ...a);
    };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demo/');
  await expect(page.locator('.aitt-map-offline')).toHaveText(
    "This browser can't draw the map (WebGL is off)", { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('a missing extra layer does not take the whole map offline', async ({ page }) => {
  await page.goto('/demo/?photos=/data/no-such-file.pmtiles&layers=naip&center=-122.0436,37.5934&zoom=15');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.aitt-map-offline')).toHaveCount(0);
});

const idle = async (page) => { await page.waitForTimeout(600); await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 30_000 }); };

test('one failed map piece does not blank a working map', async ({ page }) => {
  await page.goto('/demo/?center=-122.0436,37.5934&zoom=15');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  let aborted = 0;
  await page.route('**/data/california.pmtiles', (r) => (aborted++ < 1 ? r.abort() : r.continue()));
  await page.evaluate(() => window.__map.jumpTo({ center: [-122.27, 37.80], zoom: 14 }));
  await idle(page);
  expect(aborted).toBeGreaterThan(0);
  await expect(page.locator('.aitt-map-offline')).toHaveCount(0);
});

test('when the map data comes back, the offline message goes away', async ({ page }) => {
  await page.goto('/demo/?center=-122.0436,37.5934&zoom=15');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  await page.route('**/data/california.pmtiles', (r) => r.abort());
  await page.evaluate(() => window.__map.jumpTo({ center: [-118.25, 34.05], zoom: 13 }));
  await expect(page.locator('.aitt-map-offline')).toHaveText('Map data is offline', { timeout: 15_000 });
  await page.unroute('**/data/california.pmtiles');
  await page.evaluate(() => window.__map.jumpTo({ center: [-121.89, 37.33], zoom: 13 }));
  await expect(page.locator('.aitt-map-offline')).toHaveCount(0, { timeout: 15_000 });
});

test('a missing icon sheet does not say the map is offline', async ({ page }) => {
  await page.route('**/sprites/**', (r) => r.fulfill({ status: 404, body: 'Not Found' }));
  await page.goto('/demo/?center=-122.0436,37.5934&zoom=15');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  await expect(page.locator('.aitt-map-offline')).toHaveCount(0);
});
