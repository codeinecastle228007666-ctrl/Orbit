import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    fileParallelism: false,
    pool: 'forks',
    singleFork: true,
    include: ['tests/**/*.test.js'],
    exclude: ['tests/ui.test.js', 'node_modules/**'],
  },
});
