import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // Each browser draws the map in software (SwiftShader); more than two at once starves the CPU and tests time out.
  workers: 2,
  use: {
    baseURL: BASE_URL,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: process.env.BASE_URL ? undefined : [
    { command: 'npx vite --port 5199 --strictPort', url: BASE_URL + '/demo/', reuseExistingServer: true },
    // The production build, for the phone timing gate (tests/e2e/gate-phone.spec.js). Always built fresh: reusing a
    // running preview once timed a stale build.
    { command: 'npx vite build && npx vite preview --port 5198 --strictPort', url: 'http://localhost:5198/demo/',
      reuseExistingServer: false, timeout: 180_000 },
  ],
});
