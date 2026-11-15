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
