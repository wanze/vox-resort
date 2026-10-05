import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// The variant's extents, off to one side so the parasol's pole can stand beside it.
const LOUNGER = { x: 1, x1: 5, z: 3, z1: 12 } as const;

const FRAME = 1;
const PAD = FRAME + 1;

// As tall and wide as the variant's: the canopy shades the lounger's edge, not all of it.
const CANOPY = { reach: 4, peak: 12, chamfer: 2, wedges: 8 } as const;
const POLE = { x: 9, z: 8 } as const;

// Furled, the canvas hangs from under the hub to where the rib tips meet.
const FURLED = { y0: 6, y1: CANOPY.peak - 2, tie: 7 } as const;

const C = {
  frame: 0xe9e9e2,
  cushion: 0x2fa0a8,
  stripe: 0xede6d6,
  pole: 0xc9b58d,
  canopyA: 0xe4574f,
  canopyB: 0xf3ece0,
  rim: 0xcf4740,
  finial: 0xb8433d,
};

// The variant's octagon: a round cone this small steps raggedly at every edge.
const ring = (ax: number, az: number): number => Math.max(ax, az, ax + az - CANOPY.chamfer);

function open(b: VoxelBuilder): void {
  for (let x = 0; x <= 15; x++) {
    for (let z = 0; z <= 15; z++) {
      const reach = ring(Math.abs(x - POLE.x), Math.abs(z - POLE.z));
      // The pole's own column stays the pole, which the furled canopy hangs round too.
      if (reach === 0 || reach > CANOPY.reach) continue;

      const top = CANOPY.peak - Math.floor((reach * 3) / 4);
      const angle = Math.atan2(z - POLE.z, x - POLE.x);
      const wedge = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * CANOPY.wedges);
      const stripe = wedge % 2 === 0 ? C.canopyA : C.canopyB;
      const color = reach === CANOPY.reach ? C.rim : stripe;
      // Two voxels thick: a one-voxel cone shell is see-through along every step.
      b.box(x, x, top - 1, top, z, z, color);
    }
  }
}

function furled(b: VoxelBuilder): void {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const [x, z] = [POLE.x + dx, POLE.z + dz];
    b.box(x, x, FURLED.y0, FURLED.y1, z, z, C.canopyA);
    b.set(x, FURLED.tie, z, C.canopyB);
  }
}

export default defineModel({
  id: 'sun-lounger',
  label: 'Sun Lounger',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // z is the hips: the figure runs four voxels back and three forward, so at 8
  // the head lands on the backrest rise and the feet at the end of the pad.
  seats: [{ x: 3, y: PAD + 1, z: 8, facing: 0, pose: 'lie' }],
  canopy: { open, furled },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    for (const x of [LOUNGER.x, LOUNGER.x1]) {
      for (const z of [LOUNGER.z, LOUNGER.z1]) box(x, x, 0, FRAME, z, z, C.frame);
    }
    box(LOUNGER.x, LOUNGER.x1, FRAME, FRAME, LOUNGER.z, LOUNGER.z1, C.frame);

    for (let z = LOUNGER.z + 2; z <= LOUNGER.z1; z++) {
      box(LOUNGER.x, LOUNGER.x1, PAD, PAD, z, z, z % 2 === 0 ? C.cushion : C.stripe);
    }
    box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 1, LOUNGER.z + 1, LOUNGER.z + 1, C.cushion);
    box(LOUNGER.x, LOUNGER.x1, PAD, PAD, LOUNGER.z, LOUNGER.z, C.stripe);
    box(LOUNGER.x, LOUNGER.x1, PAD + 1, PAD + 2, LOUNGER.z, LOUNGER.z, C.cushion);

    box(POLE.x, POLE.x, 0, CANOPY.peak, POLE.z, POLE.z, C.pole);
    b.set(POLE.x, CANOPY.peak + 1, POLE.z, C.finial);
  },
});
