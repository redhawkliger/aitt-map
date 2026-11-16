import { test, expect, devices } from '@playwright/test';

// A phone: touch, small screen. defaultBrowserType is dropped so it runs in the configured Chromium.
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7'];
test.use(pixel7);

async function ready(page) {
  await page.goto('/demo/?center=-122.0436,37.5934&zoom=17');
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
}

test('a tap adds a point and a drag pans', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Distance' }).tap();
  const vp = page.viewportSize();
  const cx = vp.width / 2, cy = vp.height / 2;
  await page.touchscreen.tap(cx - 60, cy); await page.waitForTimeout(400);
  await page.touchscreen.tap(cx + 60, cy + 40); await page.waitForTimeout(400);
  const points = () => page.evaluate(() => window.__measure?.points().length ?? 0);
  expect(await points()).toBe(2);
  const before = await page.evaluate(() => window.__map.getCenter().toArray());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy + 100 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - i * 15, y: cy + 100 - i * 8 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.__map.getCenter().toArray());
  expect(Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1])).toBeGreaterThan(1e-5);
  expect(await points()).toBe(2);
});

test('after switching measure mode, a double-tap ends the line and does not zoom', async ({ page }) => {
  await ready(page);
  const vp = page.viewportSize();
  const cx = vp.width / 2, cy = vp.height / 2;
  await page.getByRole('button', { name: 'Distance' }).tap();
  await page.touchscreen.tap(cx - 80, cy); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Area' }).tap();
  await page.waitForTimeout(300);
  for (const [x, y] of [[cx - 80, cy - 60], [cx + 80, cy - 60], [cx + 80, cy + 60]]) { await page.touchscreen.tap(x, y); await page.waitForTimeout(400); }
  const z0 = await page.evaluate(() => window.__map.getZoom());
  await page.touchscreen.tap(cx - 80, cy + 60); await page.waitForTimeout(60); await page.touchscreen.tap(cx - 80, cy + 60);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__map.getZoom())).toBeCloseTo(z0, 2);
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
});

test('measuring leaves double-tap zoom as it found it', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Distance' }).tap();
  await page.getByRole('button', { name: 'Area' }).tap();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__map.doubleClickZoom.isEnabled())).toBe(true);
  await page.evaluate(() => window.__map.doubleClickZoom.disable());
  await page.getByRole('button', { name: 'Distance' }).tap();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__map.doubleClickZoom.isEnabled())).toBe(false);
});
