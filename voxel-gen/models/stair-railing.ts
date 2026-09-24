import { defineModel, LEVEL_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

const PAVING_TOP = 2;

const TREADS = LEVEL_VOXELS;

const GOING = TILE_VOXELS / TREADS;

const RAIL_HEIGHT = 4;

const FLANK = 2;

// Drawn flush, the buried footing would z-fight the stairs' own flank. It cannot be
// left out: voxelgen shifts a model onto its origin, which would drop the parapet.
const BURIED_IN = 1;

// Both flanks are in one model because a mirror is not a quarter turn: only then
// can one geometry cover all four climbs.
export default defineModel({
  id: 'stair-railing',
  label: 'Stair Balustrade',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      wall: 0xbfae87,
      cap: 0xe4d9c4,
    };

    const inward = (v: number): number =>
      Math.min(TILE_VOXELS - 1 - BURIED_IN, Math.max(BURIED_IN, v));

    for (let step = 0; step < TREADS; step++) {
      const tread = PAVING_TOP + LEVEL_VOXELS - 1 - step;
      const z0 = step * GOING;
      const z1 = z0 + GOING - 1;
      for (const x0 of [0, TILE_VOXELS - FLANK]) {
        const x1 = x0 + FLANK - 1;
        box(x0, x1, tread + 1, tread + RAIL_HEIGHT - 1, z0, z1, C.wall);
        box(x0, x1, tread + RAIL_HEIGHT, tread + RAIL_HEIGHT, z0, z1, C.cap);
        box(inward(x0), inward(x1), 0, tread, inward(z0), inward(z1), C.wall);
      }
    }
  },
});
