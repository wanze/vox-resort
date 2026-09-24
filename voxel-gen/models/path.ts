import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Large on purpose: paths are the most repeated object, and small pavers defeat
// the greedy mesher (2-voxel pavers cost 276 triangles a tile, 8x4 cost 96).
const PAVER = { width: 8, depth: 4 } as const;

export default defineModel({
  id: 'path',
  label: 'Path',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      grout: 0x9a8a6a,
      paverA: 0xc3b189,
      paverB: 0xb6a379,
      paverC: 0xcdbc95,
    };
    const pavers = [C.paverA, C.paverB, C.paverC];

    const N = 15;

    box(0, N, 0, 1, 0, N, C.grout);

    for (let x = 0; x <= N; x++)
      for (let z = 0; z <= N; z++) {
        const band = Math.floor(z / PAVER.depth);
        const offset = (band % 2) * (PAVER.width / 2);
        const isGrout = z % PAVER.depth === 0 || (x + offset) % PAVER.width === 0;
        if (isGrout) {
          set(x, 1, z, C.grout);
          continue;
        }
        const stone = Math.floor((x + offset) / PAVER.width) + band;
        set(x, 1, z, pavers[stone % pavers.length]!);
      }
  },
});
