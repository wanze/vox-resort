import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Narrower than a pad for two: a figure is three voxels wide. Off to one side, so the
// parasol's pole can stand beside it.
const LOUNGER = { x: 1, x1: 5, z: 3, z1: 12 } as const;

const FRAME = 1;
const PAD = FRAME + 1;

// A canvas parasol on a timber pole, small enough to shade the lounger's edge
// and leave the rest of it in sight from above.
const CANOPY = { reach: 4, peak: 12, chamfer: 2 } as const;
const POLE = { x: 9, z: 8 } as const;

// Furled, the canvas hangs from under the hub to where the rib tips meet.
const FURLED = { y0: 6, y1: CANOPY.peak - 2, tie: 7 } as const;

// Octagonal with 45-degree chamfers: reads round from above, yet every ring edge
// is either straight or a one-voxel stair, never a ragged curve.
const ring = (ax: number, az: number): number => Math.max(ax, az, ax + az - CANOPY.chamfer);

function lounger(b: VoxelBuilder): void {
  const { stucco, teak } = PALETTE;
  for (const x of [LOUNGER.x, LOUNGER.x1]) {
    for (const z of [LOUNGER.z + 1, LOUNGER.z1]) b.set(x, 0, z, teak.deep);
  }
  // One course rather than slats: a slat stripe would mesh as many quads instead of one plane.
  b.box(LOUNGER.x, LOUNGER.x1, FRAME, FRAME, LOUNGER.z, LOUNGER.z1, teak.base);
  b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD, LOUNGER.z + 1, LOUNGER.z1 - 1, stucco.light);

  // The back steps up towards the head, so it reads as reclined rather than as a bed.
  b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 2, LOUNGER.z, LOUNGER.z, teak.base);
  b.box(LOUNGER.x, LOUNGER.x1, PAD + 3, PAD + 3, LOUNGER.z, LOUNGER.z, stucco.light);
  b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 2, LOUNGER.z + 1, LOUNGER.z + 1, stucco.light);
  b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 1, LOUNGER.z + 2, LOUNGER.z + 2, stucco.light);
}

function pole(b: VoxelBuilder): void {
  const { teak } = PALETTE;
  b.box(POLE.x, POLE.x, 0, CANOPY.peak, POLE.z, POLE.z, teak.base);
  b.set(POLE.x, CANOPY.peak + 1, POLE.z, teak.shade);
}

function open(b: VoxelBuilder): void {
  const { stucco, water } = PALETTE;
  for (let x = 0; x <= 15; x++) {
    for (let z = 0; z <= 15; z++) {
      const reach = ring(Math.abs(x - POLE.x), Math.abs(z - POLE.z));
      // The pole's own column stays the pole, which the furled canopy hangs round too.
      if (reach === 0 || reach > CANOPY.reach) continue;
      // Four courses over five rings: flatter than a roof, so it reads as a shade, and
      // whole rings keep every step a clean terrace instead of a ragged one.
      const top = CANOPY.peak - Math.floor((reach * 3) / 4);
      // White canvas with a blue valance and crown: whole rings, so each tone stays one plane.
      const color = reach === CANOPY.reach ? water.base : reach < 2 ? water.light : stucco.light;
      // Two voxels thick: a one-voxel cone shell is see-through along every step.
      b.box(x, x, top - 1, top, z, z, color);
    }
  }
}

function furled(b: VoxelBuilder): void {
  const { stucco, water } = PALETTE;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const [x, z] = [POLE.x + dx, POLE.z + dz];
    b.box(x, x, FURLED.y0, FURLED.y1, z, z, stucco.light);
    b.set(x, FURLED.tie, z, water.base);
  }
}

export default defineModel({
  id: 'sun-lounger-b',
  label: 'Sun Lounger B',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // z is the hips: the figure runs four voxels back and three forward, so at 8
  // the head lands on the raised back and the feet at the end of the pad.
  seats: [{ x: 3, y: PAD + 1, z: 8, facing: 0, pose: 'lie' }],
  canopy: { open, furled },
  build: (b: VoxelBuilder) => {
    lounger(b);
    pole(b);
  },
});
