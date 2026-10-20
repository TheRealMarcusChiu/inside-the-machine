/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Normalise a deployment base path so it always starts and ends with "/".
 * GitHub Pages project sites live under "/<repo-name>/", user/org sites under "/".
 */
export function normaliseBase(raw: string | undefined): string {
  if (!raw || raw.trim() === '' || raw.trim() === '/') return '/';
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '');
  return `/${trimmed}/`;
}

// Set VITE_BASE_PATH=/your-repo-name/ when building for a GitHub Pages project site.
export default defineConfig({
  base: normaliseBase(process.env.VITE_BASE_PATH),
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
