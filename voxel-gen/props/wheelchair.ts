// Faces +z like the figure, and is painted at the figure's scale. The field centres both on their
// footprints, so the frame reaches as far behind the seat as the footrest does in front: that puts
// the seated figure's torso over the middle of the seat.
import { PALETTE } from '../palette.ts';
import { FIGURE_SCALE } from '../people/figure.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// The figure sits with its hips at the instance's height, so the seat's top is that far up.
export const CHAIR_SEAT_VOXELS = 2;

const SEAT_TOP = CHAIR_SEAT_VOXELS / FIGURE_SCALE;

const WHEEL = { y: 3, z: 6, radius: 3 } as const;

// A tyre with a cross of spokes, and the hub on the inside where the axle meets the frame.
function wheel(b: VoxelBuilder, x: number, hub: number): void {
  const { metal, slate } = PALETTE;
  for (let y = 0; y <= 2 * WHEEL.radius; y++) {
    for (let z = WHEEL.z - WHEEL.radius; z <= WHEEL.z + WHEEL.radius; z++) {
      const off = Math.hypot(y - WHEEL.y, z - WHEEL.z);
      const tyre = off > WHEEL.radius - 0.8 && off <= WHEEL.radius + 0.4;
      const spoke = off <= WHEEL.radius - 0.8 && (y === WHEEL.y || z === WHEEL.z);
      if (tyre || spoke) b.set(x, y, z, tyre ? metal.deep : slate.light);
    }
  }
  b.set(hub, WHEEL.y, WHEEL.z, metal.base);
}

export default defineModel({
  id: 'wheelchair',
  label: 'Wheelchair',
  category: 'props',
  tiles: { x: 1, z: 1 },
  scale: FIGURE_SCALE,
  build: (b: VoxelBuilder) => {
    const { metal, slate, water } = PALETTE;

    wheel(b, 0, 1);
    wheel(b, 9, 8);

    b.box(1, 8, SEAT_TOP - 1, SEAT_TOP - 1, 5, 10, water.shade);
    b.box(2, 7, SEAT_TOP, SEAT_TOP + 5, 4, 4, water.shade);

    for (const x of [2, 7]) {
      b.box(x, x, SEAT_TOP + 5, SEAT_TOP + 6, 4, 4, slate.base);
      b.box(x, x, SEAT_TOP + 6, SEAT_TOP + 6, 2, 3, metal.base);
      b.box(x, x, 1, SEAT_TOP - 2, 10, 10, slate.base);
      b.box(x, x, 1, 1, 1, 3, slate.base);
      b.set(x, 0, 12, metal.deep);
    }
    b.box(2, 7, 1, 1, 11, 12, slate.base);
  },
});
