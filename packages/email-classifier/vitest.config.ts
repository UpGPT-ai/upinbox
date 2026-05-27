import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Anchor root to this package — prevents crawling up to repo root's postcss.config.js
  root: path.resolve(__dirname),
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
