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
