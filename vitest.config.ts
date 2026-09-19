import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild cannot emit decorator metadata, which Nest dependency injection needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    root: '.',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'test/arch/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e.ts'],
          // One Postgres container for the whole run; files share it, so they run one at a time.
          globalSetup: ['test/support/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
