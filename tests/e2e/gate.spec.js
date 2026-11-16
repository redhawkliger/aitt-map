import { test, expect } from '@playwright/test';
import { PLACES } from '../../demo/places.js';

// Phase 1 exit gate (plan, task 7).
for (const place of PLACES) {
  test(`names show at every zoom: ${place.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    for (const zoom of [6, 10, 13, 16, 19]) {
      await page.goto(`/demo/?center=${place.center.join(',')}&zoom=${zoom}`);
      await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
      const names = await page.evaluate(() => {
        const ids = window.__map.getStyle().layers
          .filter((l) => l.type === 'symbol' && l.layout?.['text-field'] && l.source === 'basemap').map((l) => l.id);
        return window.__map.queryRenderedFeatures({ layers: ids }).map((f) => f.properties.name).filter(Boolean);
      });
      expect(names.length, `${place.id} z${zoom}`).toBeGreaterThan(0);
    }
  });
}

test('the credit line is visible', async ({ page }) => {
  await page.goto('/demo/');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  const credit = page.locator('.maplibregl-ctrl-attrib');
  await expect(credit).toBeVisible();
  await expect(credit).toContainText('OpenStreetMap');
  await expect(credit).toContainText('Protomaps');
});

test('the jump-to list moves the map to each test place', async ({ page }) => {
  await page.goto('/demo/');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  for (const place of PLACES) {
    await page.getByRole('combobox', { name: 'Go to' }).selectOption(place.id);
    await page.waitForFunction(([x, y]) => {
      const c = window.__map.getCenter();
      return Math.abs(c.lng - x) < 1e-3 && Math.abs(c.lat - y) < 1e-3;
    }, place.center, { timeout: 10_000 });
  }
});
