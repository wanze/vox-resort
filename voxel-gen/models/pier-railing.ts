import { PALETTE } from '../palette.ts';
import { LANTERN, lanternLight, spanLantern, type LanternSpot } from '../parts/span.ts';
import { defineModel, PAVING_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

const RAIL_HEIGHT = 4;

// Flush, the feet would share a face plane with the jetty's outer face and z-fight it.
const BURIED_IN = 1;

const N = TILE_VOXELS - 1;
const TOP = PAVING_VOXELS + RAIL_HEIGHT;

// On the middle post, so it stays put however the rail is turned.
const MIDDLE = Math.floor(TILE_VOXELS / 2) - 1;
const LAMP: LanternSpot = { x: MIDDLE, rail: TOP };

export default defineModel({
  id: 'pier-railing',
  label: 'Pier Railing',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: a pier's rail is what the water beside it puts there.
  groundDecides: true,
  emissive: [LANTERN],
  lights: [lanternLight(LAMP)],
  build: (b: VoxelBuilder) => {
    const { teak } = PALETTE;
    const inward = (v: number): number => Math.min(N - BURIED_IN, Math.max(BURIED_IN, v));

    for (const x of [0, MIDDLE, TILE_VOXELS - 2]) {
      b.box(x, x + 1, PAVING_VOXELS, TOP - 1, 0, 1, teak.shade);
      b.box(inward(x), inward(x + 1), 0, PAVING_VOXELS - 1, inward(0), inward(1), teak.shade);
    }
    b.box(0, N, TOP - 1, TOP, 0, 1, teak.light);
    b.box(0, N, PAVING_VOXELS + 1, PAVING_VOXELS + 1, 0, 1, teak.light);
    spanLantern(b, LAMP);
  },
});
