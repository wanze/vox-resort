import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SIZE = 32;
const LAST = SIZE - 1;

// No sand floor: the towels under it lie at the beach's own surface, which a slab would bury.
// The corner posts alone span the footprint.
const POST = 2;
const CANVAS = { x: POST, x1: LAST - POST, z: POST, z1: LAST - POST } as const;

// High at the front, which the camera looks from, so the towels under it stay in view.
const LOW = 14;
const HIGH = 18;

// How far a tensioned hem pulls in at its middle.
const SAG = 2;

const topAt = (z: number): number =>
  LOW + Math.round(((HIGH - LOW) * (z - CANVAS.z)) / (CANVAS.z1 - CANVAS.z));

const hemInset = (along: number, from: number, to: number): number =>
  Math.round(SAG * Math.sin((Math.PI * (along - from)) / (to - from)));

export default defineModel({
  id: 'shade-sail',
  label: 'Shade Sail',
  category: 'grounds',
  tiles: { x: 2, z: 2 },
  placement: { ground: 'beach' },
  shade: true,
  sound: 'sail',
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, stucco, teak, water } = PALETTE;

    for (const x of [0, LAST - 1]) {
      for (const [z, top] of [
        [0, LOW],
        [LAST - 1, HIGH],
      ] as const) {
        box(x, x + 1, 0, top, z, z + 1, teak.shade);
        box(x, x + 1, top + 1, top + 1, z, z + 1, metal.light);
      }
    }

    for (let x = CANVAS.x; x <= CANVAS.x1; x++) {
      for (let z = CANVAS.z; z <= CANVAS.z1; z++) {
        if (z - CANVAS.z < hemInset(x, CANVAS.x, CANVAS.x1)) continue;
        if (CANVAS.z1 - z < hemInset(x, CANVAS.x, CANVAS.x1)) continue;
        if (x - CANVAS.x < hemInset(z, CANVAS.z, CANVAS.z1)) continue;
        if (CANVAS.x1 - x < hemInset(z, CANVAS.z, CANVAS.z1)) continue;
        const top = topAt(z);
        // Two voxels thick, as the parasol's: a one-voxel slope is see-through along every step.
        box(x, x, top - 1, top, z, z, x > z ? stucco.light : water.light);
      }
    }
  },
});
