import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // three's addons import from "three"; aliasing it to the WebGPU build keeps one copy of the core classes.
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
    // @divinevoxel/vlox and @amodx/* ship extensionless ESM specifiers.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  optimizeDeps: {
    // Keep DVE's deep, extensionless imports on Vite's resolver instead of esbuild's.
    exclude: ['@divinevoxel/vlox', '@amodx/math', '@amodx/binary', '@amodx/threads'],
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'voxel-gen/**/*.test.ts'],
    environment: 'node',
    // The generator and sim tests run whole plots and days; 2-3 s here is 5 s+ on a CI runner.
    testTimeout: 30_000,
    server: {
      deps: {
        // Node's ESM resolver rejects the extensionless specifiers these packages ship.
        inline: [/@divinevoxel\//, /@amodx\//],
      },
    },
  },
});
