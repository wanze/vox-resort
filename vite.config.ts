import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // three's addons import from "three"; pointing that at the WebGPU build
      // keeps a single copy of the core classes in the graph.
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
    // voxel-gen is the art, and the parts and palette it is drawn from are
    // pure enough to be tested next to themselves.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'voxel-gen/**/*.test.ts'],
    environment: 'node',
    server: {
      deps: {
        // Node's ESM resolver rejects the extensionless specifiers these packages
        // ship; routing them through Vite's resolver fixes it.
        inline: [/@divinevoxel\//, /@amodx\//],
      },
    },
  },
});
