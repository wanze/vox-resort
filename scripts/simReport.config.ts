import { defineConfig } from 'vitest/config';
import app from '../vite.config.ts';

// Its own include rather than the app's: the report runs whole days, and `pnpm test` must not.
export default defineConfig({
  ...app,
  test: {
    ...app.test,
    include: ['scripts/simReport.test.ts'],
    testTimeout: 0,
    silent: false,
    reporters: ['verbose'],
  },
});
