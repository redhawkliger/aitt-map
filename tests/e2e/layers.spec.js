import { test, expect } from '@playwright/test';

async function ready(page, url = '/demo/?center=-122.0436,37.5934&zoom=15') {
  await page.goto(url);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
}
const vis = (page, id) => page.evaluate((i) => window.__map.getLayoutProperty(i, 'visibility'), id);

// The statewide imagery comes from the USGS National Map. Tests never go to the internet: answer with a 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const usgs = [];
test.beforeEach(async ({ page }) => {
  usgs.length = 0;
  await page.route('https://basemap.nationalmap.gov/**', (r) => { usgs.push(r.request().url()); r.fulfill({ contentType: 'image/png', body: PNG }); });
});

test('the satellite layer turns on and off from the panel', async ({ page }) => {
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Satellite' });
  await expect(sw).not.toBeChecked();
  // Hidden layers are not added to the map (no file opened) until first switched on.
  expect(await page.evaluate(() => window.__map.getLayer('sat-usgs'))).toBeUndefined();
  await sw.click();
  await expect(sw).toBeChecked();
  expect(await vis(page, 'sat-usgs')).toBe('visible');
  await sw.click();
  expect(await vis(page, 'sat-usgs')).toBe('none');
});

test('the opacity slider fades a layer', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch', { name: 'Satellite' }).click();
  await page.getByRole('slider', { name: 'Satellite opacity' }).fill('0.3');
  expect(await page.evaluate(() => window.__map.getPaintProperty('sat-usgs', 'raster-opacity'))).toBeCloseTo(0.3, 2);
});

test('switching to Day keeps the satellite layer on', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch', { name: 'Satellite' }).click();
  await page.getByRole('radio', { name: 'Day' }).click();
  await page.waitForFunction(() => window.__map.getStyle().name === 'aitt-day', null, { timeout: 10_000 });
  expect(await vis(page, 'sat-usgs')).toBe('visible');
});

test('on a phone the panel folds into a Layers button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Satellite' });
  await expect(sw).toBeHidden();
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(sw).toBeVisible();
});

// The photo file only covers the corridor; a tile it does not have must not leave the map "loading" forever.
test('with satellite on, the map still finishes loading', async ({ page }) => {
  await ready(page, '/demo/?center=-122.0436,37.5934&zoom=16.5&layers=satellite');
  expect(await page.evaluate(() => window.__map.loaded())).toBe(true);
});

test('keyboard users keep their place after toggling a layer or changing style', async ({ page }) => {
  await ready(page);
  const sw = page.getByRole('switch', { name: 'Satellite' });
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

test('the fade slider lightens the satellite for report backgrounds', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch', { name: 'Satellite' }).click();
  await page.getByRole('slider', { name: 'Satellite fade for reports' }).fill('1');
  expect(await page.evaluate(() => window.__map.getPaintProperty('sat-usgs', 'raster-brightness-min'))).toBeGreaterThanOrEqual(0.4);
  expect(await page.evaluate(() => window.__map.getPaintProperty('sat-usgs', 'raster-saturation'))).toBeLessThanOrEqual(-0.5);
});

test('satellite covers the whole state: statewide imagery underneath, crisp local photos on top', async ({ page }) => {
  await ready(page, '/demo/?center=-118.25,34.05&zoom=14&layers=satellite'); // Los Angeles, far from the Bay photos
  expect(usgs.length).toBeGreaterThan(0);
  const ids = await page.evaluate(() => window.__map.getStyle().layers.map((l) => l.id));
  const crisp = ids.filter((id) => id.startsWith('sat-crisp-'));
  expect(crisp.length).toBeGreaterThan(0);
  for (const id of crisp) expect(ids.indexOf('sat-usgs')).toBeLessThan(ids.indexOf(id));
});
