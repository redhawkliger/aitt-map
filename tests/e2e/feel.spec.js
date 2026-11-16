import { test, expect } from '@playwright/test';

async function ready(page, url = '/demo/') {
  await page.goto(url);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
}

// One mouse-wheel notch (deltaY 100) must zoom in by at least half a level: the stock rate gives about a quarter.
test('one mouse-wheel notch zooms in at least half a level', async ({ page }) => {
  await ready(page);
  const before = await page.evaluate(() => window.__map.getZoom());
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.__map.getZoom());
  expect(after - before).toBeGreaterThanOrEqual(0.5);
});

test('the scale bar shows feet', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.maplibregl-ctrl-scale')).toContainText(/ft|mi/);
});

test('a compass that resets north is on the map', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__map.setBearing(40));
  await page.locator('.maplibregl-ctrl-compass').click();
  await page.waitForFunction(() => Math.abs(window.__map.getBearing()) < 0.5, null, { timeout: 5_000 });
});

test('the web address keeps the view, so a link opens the same place', async ({ page }) => {
  await ready(page, '/demo/#16.5/37.789/-122.4005');
  const v = await page.evaluate(() => ({ z: window.__map.getZoom(), c: window.__map.getCenter() }));
  expect(v.z).toBeCloseTo(16.5, 1);
  expect(v.c.lat).toBeCloseTo(37.789, 3);
  await page.evaluate(() => window.__map.jumpTo({ zoom: 14, center: [-122.0436, 37.5934] }));
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/#14\/37\.59\d*\/-122\.04/);
});
