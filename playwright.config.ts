import { defineConfig, devices } from '@playwright/test';

// End-to-end checks of the desktop mode (e2e/). Needs data/ built first (`npm run data`).
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5176/',
    ignoreHTTPSErrors: true,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    // XR runs only after the other WebGL tests have released SwiftShader. It passes alone and
    // fails when a parallel laptop test keeps the software GPU from producing a frame in time.
    { name: 'laptop', testIgnore: /(xr|cathedral)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 } } },
    // The phone covers the map; the Inside view and the headset are desktop and XR modes.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mine\.spec\.ts/ },
    // The cathedral prototype (cathedral/, an IWSDK app): desktop mode, with a mocked Worker.
    {
      name: 'cathedral',
      testMatch: /cathedral\.spec\.ts/,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://localhost:5177/',
        viewport: { width: 1280, height: 800 },
        permissions: ['microphone'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
      },
    },
    {
      name: 'xr',
      testMatch: /xr\.spec\.ts/,
      dependencies: ['laptop', 'phone'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 5176 --strictPort',
      url: 'http://localhost:5176/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // IWSDK_DEV_OPEN=false: do not let its dev plugin launch (or try to download) its own browser.
      command: 'npx vite --port 5177 --strictPort',
      cwd: 'cathedral',
      env: { IWSDK_DEV_OPEN: 'false' },
      url: 'https://localhost:5177/',
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
