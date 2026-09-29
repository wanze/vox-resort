import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// A canvas parasol on a timber pole, running to the tile edges so the footprint is
// filled by the canopy itself.
const CANOPY = { reach: 7, peak: 16, chamfer: 3 } as const;
const MIDDLE = 8;

// Octagonal with 45-degree chamfers: reads round from above, yet every ring edge
// is either straight or a one-voxel stair, never a ragged curve.
const ring = (ax: number, az: number): number => Math.max(ax, az, ax + az - CANOPY.chamfer);

export default defineModel({
  id: 'beach-umbrella-b',
  label: 'Beach Umbrella B',
  category: 'grounds',
  placement: { ground: 'beach' },
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { stucco, teak, water } = PALETTE;

    b.box(MIDDLE - 1, MIDDLE, 0, CANOPY.peak, MIDDLE - 1, MIDDLE, teak.base);

    for (let x = 0; x <= 15; x++) {
      for (let z = 0; z <= 15; z++) {
        const reach = ring(
          x < MIDDLE ? MIDDLE - 1 - x : x - MIDDLE,
          z < MIDDLE ? MIDDLE - 1 - z : z - MIDDLE,
        );
        if (reach > CANOPY.reach) continue;
        // Five courses over seven rings: flatter than a roof, so it reads as a shade, and
        // whole rings keep every step a clean terrace instead of a ragged one.
        const top = CANOPY.peak - Math.floor((reach * 5) / 7);
        // White canvas with a blue valance and crown: whole rings, so each tone stays one plane.
        const color = reach === CANOPY.reach ? water.base : reach < 2 ? water.light : stucco.light;
        // Two voxels thick: a one-voxel cone shell is see-through along every step.
        b.box(x, x, top - 1, top, z, z, color);
      }
    }
    b.box(MIDDLE - 1, MIDDLE, CANOPY.peak + 1, CANOPY.peak + 1, MIDDLE - 1, MIDDLE, teak.shade);
  },
});
