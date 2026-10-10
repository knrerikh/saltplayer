import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**'],
      // A few points under the current level: CI fails when coverage drops noticeably.
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 55,
        branches: 75,
      },
    }
  },
  resolve: {
    alias: {
      '@/main': path.resolve(__dirname, 'src/main'),
      '@/renderer': path.resolve(__dirname, 'src/renderer'),
      '@/shared': path.resolve(__dirname, 'src/shared')
    }
  }
});

