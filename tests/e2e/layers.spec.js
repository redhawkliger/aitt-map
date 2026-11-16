import { test, expect } from '@playwright/test';

// Road details (signals, signs, crosswalks, lanes) is the data layer every app uses. Needs data/traffic.pmtiles.
async function ready(page, url = '/demo/?center=-122.0436,37.5934&zoom=17') {
  await page.goto(url);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
}
const vis = (page, id) => page.evaluate((i) => window.__map.getLayoutProperty(i, 'visibility'), id);

test('there is no Satellite layer any more (owner, 2026-11-16)', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('switch', { name: 'Satellite' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__map.getStyle().layers.some((l) => l.type === 'raster'))).toBe(false);
});

test('road details are on by default and switch off and on from the panel', async ({ page }) => {
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Road details' });
  await expect(sw).toBeChecked();
  expect(await vis(page, 'traffic-control')).toBe('visible');
  await sw.click();
  expect(await vis(page, 'traffic-control')).toBe('none');
  await sw.click();
  expect(await vis(page, 'traffic-control')).toBe('visible');
});

test('the opacity slider fades a layer', async ({ page }) => {
  await ready(page);
  await page.getByRole('slider', { name: 'Road details opacity' }).fill('0.3');
  expect(await page.evaluate(() => window.__map.getPaintProperty('traffic-control', 'icon-opacity'))).toBeCloseTo(0.3, 2);
});

test('switching to Day keeps road details on, in Day colours', async ({ page }) => {
  await ready(page);
  await page.getByRole('radio', { name: 'Day' }).click();
  await page.waitForFunction(() => window.__map.getStyle().name === 'aitt-day', null, { timeout: 10_000 });
  expect(await vis(page, 'traffic-control')).toBe('visible');
  expect(JSON.stringify(await page.evaluate(() => window.__map.getLayoutProperty('traffic-control', 'icon-image')))).toContain('-day');
});

test('every style draws the road detail icons (no missing images)', async ({ page }) => {
  const missing = [];
  page.on('console', (m) => /could not be loaded|Image .* missing/i.test(m.text()) && missing.push(m.text()));
  await ready(page);
  for (const name of ['Neon', 'Matrix', 'Ember', 'Cyber', 'Report']) {
    await page.getByRole('radio', { name }).click();
    await page.waitForFunction((n) => window.__map.getStyle().name === 'aitt-' + n.toLowerCase(), name, { timeout: 10_000 });
    await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['traffic-control'] }).length)).toBeGreaterThan(0);
  }
  expect(missing).toEqual([]);
});

test('on a phone the panel folds into a Layers button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Road details' });
  await expect(sw).toBeHidden();
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(sw).toBeVisible();
});

test('keyboard users keep their place after toggling a layer or changing style', async ({ page }) => {
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Road details' });
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeFocused();
  const day = page.getByRole('radio', { name: 'Day' });
  await day.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__map.getStyle().name === 'aitt-day', null, { timeout: 10_000 });
  await expect(page.getByRole('radio', { name: 'Day' })).toBeFocused();
});
