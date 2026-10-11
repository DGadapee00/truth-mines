import { defineConfig } from 'vitest/config';

// Unit tests of the app's pure logic. Rendering is checked by the Playwright suite (../e2e).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
