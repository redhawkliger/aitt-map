import { test, expect } from '@playwright/test';

// The built site (what Cloudflare Pages serves) with the security headers from public/_headers.
const PREVIEW = process.env.PREVIEW_URL ?? 'http://localhost:5198';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('the built site sends security headers', async ({ request }) => {
  const r = await request.get(`${PREVIEW}/demo/`);
  const h = r.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
});

test('the map, its worker and the satellite all load under those headers', async ({ page }) => {
  const blocked = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text()); });
  await page.route('https://basemap.nationalmap.gov/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto(`${PREVIEW}/demo/?center=-122.0436,37.5934&zoom=15&layers=satellite`);
  await page.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30_000 });
  expect(blocked).toEqual([]);
});
