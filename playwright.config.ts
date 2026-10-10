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
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --port 5176 --strictPort',
    url: 'http://localhost:5176/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
