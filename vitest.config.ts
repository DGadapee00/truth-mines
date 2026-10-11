import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/tests/**/*.test.ts', 'app/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
