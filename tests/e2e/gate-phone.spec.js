import { test, expect, devices } from '@playwright/test';

// First view on a phone in under 2 s: Pixel 7, "Fast 4G" (9 Mbps down, 170 ms), the production build
// (vite preview on PREVIEW_URL), cold cache each run, median of 5. Note: the map is drawn in software here
// (SwiftShader), which is slower than a phone's GPU, so passing here is a conservative check.
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7'];
test.use(pixel7);
const PREVIEW = process.env.PREVIEW_URL ?? 'http://localhost:5198';

test('first view on a phone in under 2 s', async ({ browser }) => {
  test.setTimeout(180_000);
  const times = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext(pixel7);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
    await page.goto(`${PREVIEW}/demo/`);
    await page.waitForFunction(() => window.__mapIdleAt !== undefined, null, { timeout: 60_000 });
    times.push(await page.evaluate(() => window.__mapIdleAt));
    await ctx.close();
  }
  times.sort((a, b) => a - b);
  console.log('first idle (ms):', times.map(Math.round).join(', '));
  expect(times[2]).toBeLessThan(2000);
});
