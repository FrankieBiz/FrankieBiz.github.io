import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative base so dist/ works at a root domain or a GitHub Pages project sub-path.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
