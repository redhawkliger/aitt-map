import { test, expect } from '@playwright/test';

const URL_ = '/demo/?center=-122.0436,37.5934&zoom=17';
async function ready(page) {
  await page.goto(URL_);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
}
// The same distance computed by the kit's own code for these screen points.
const codeDistance = (page, pts, mode = 'distance') => page.evaluate(async ({ pts, mode }) => {
  const { measureValue, formatMeasure } = await import('/src/measure/geo.js');
  const ll = pts.map(([x, y]) => window.__map.unproject([x, y]).toArray());
  return formatMeasure(measureValue(ll, mode, 'ft'), mode, 'ft');
}, { pts, mode });

test('measuring Alvarado-Niles Road gives the same length as the code', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Distance' }).click();
  const pts = [[300, 350], [640, 420], [980, 520]];
  for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(350); }
  await expect(page.getByRole('status', { name: 'Measurement' })).toHaveText(await codeDistance(page, pts));
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('status', { name: 'Measurement' })).toHaveText(await codeDistance(page, pts));
});

test('width takes two points, curb to curb, and ends itself', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Width' }).click();
  const pts = [[640, 380], [660, 460]];
  for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(350); }
  await expect(page.getByRole('status', { name: 'Measurement' })).toHaveText(await codeDistance(page, pts, 'width'));
  await expect(page.getByRole('button', { name: 'Done' })).toBeHidden();
  await page.mouse.click(800, 600);
  await page.waitForTimeout(350);
  await expect(page.getByRole('status', { name: 'Measurement' })).toHaveText(await codeDistance(page, pts, 'width'));
});

test('area of three points shows square feet', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Area' }).click();
  const pts = [[500, 300], [800, 300], [800, 500]];
  for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(350); }
  await expect(page.getByRole('status', { name: 'Measurement' })).toHaveText(await codeDistance(page, pts, 'area'));
});

test('Esc cancels a measurement', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Distance' }).click();
  await page.mouse.click(400, 400); await page.waitForTimeout(350);
  await page.mouse.click(600, 400); await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status', { name: 'Measurement' })).toBeHidden();
  expect(await page.evaluate(() => window.__map.getSource('aitt-measure')?._data?.features?.length ?? 0)).toBe(0);
});
