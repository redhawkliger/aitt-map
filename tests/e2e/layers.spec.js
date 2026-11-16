import { test, expect } from '@playwright/test';

async function ready(page, url = '/demo/?center=-122.0436,37.5934&zoom=15') {
  await page.goto(url);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
}
const vis = (page, id) => page.evaluate((i) => window.__map.getLayoutProperty(i, 'visibility'), id);

test('the aerial layer turns on and off from the panel', async ({ page }) => {
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Aerial photos' });
  await expect(sw).not.toBeChecked();
  // Hidden layers are not added to the map (no file opened) until first switched on.
  expect(await page.evaluate(() => window.__map.getLayer('naip-raster'))).toBeUndefined();
  await sw.click();
  await expect(sw).toBeChecked();
  expect(await vis(page, 'naip-raster')).toBe('visible');
  await sw.click();
  expect(await vis(page, 'naip-raster')).toBe('none');
});

test('the opacity slider fades a layer', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch', { name: 'Aerial photos' }).click();
  await page.getByRole('slider', { name: 'Aerial photos opacity' }).fill('0.3');
  expect(await page.evaluate(() => window.__map.getPaintProperty('naip-raster', 'raster-opacity'))).toBeCloseTo(0.3, 2);
});

test('switching to Day keeps the aerial layer on', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch', { name: 'Aerial photos' }).click();
  await page.getByRole('radio', { name: 'Day' }).click();
  await page.waitForFunction(() => window.__map.getStyle().name === 'aitt-day', null, { timeout: 10_000 });
  expect(await vis(page, 'naip-raster')).toBe('visible');
});

test('on a phone the panel folds into a Layers button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Aerial photos' });
  await expect(sw).toBeHidden();
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(sw).toBeVisible();
});

// The photo file only covers the corridor; a tile it does not have must not leave the map "loading" forever.
test('with aerial photos on, the map still finishes loading', async ({ page }) => {
  await ready(page, '/demo/?center=-122.0436,37.5934&zoom=16.5&layers=naip');
  expect(await page.evaluate(() => window.__map.loaded())).toBe(true);
});

test('keyboard users keep their place after toggling a layer or changing style', async ({ page }) => {
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Aerial photos' });
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).toBeChecked();
  await expect(sw).toBeFocused();
  const day = page.getByRole('radio', { name: 'Day' });
  await day.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__map.getStyle().name === 'aitt-day', null, { timeout: 10_000 });
  await expect(page.getByRole('radio', { name: 'Day' })).toBeFocused();
});
