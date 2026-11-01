import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'safari16',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
} as never);
