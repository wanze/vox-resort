import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const DECK = { x: 4, x1: 11, z: 5, z1: 12 } as const;

const POST = { x: 7, x1: 8, z: 5, z1: 6 } as const;

const ARM = GROUND + 9;

// Four voxels clear of the post: closer, the stream merges with it from every angle.
const ROSE = 10;

export default defineModel({
  id: 'beach-shower',
  label: 'Beach Shower',
  category: 'amenities',
  tiles: { x: 1, z: 1 },
  venue: {
    shelter: 'open',
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.6 }],
    capacity: 1,
    dwellSeconds: { min: 30, max: 90 },
    doors: [{ x: POST.x1, z: DECK.z1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, metal, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    box(DECK.x, DECK.x1, GROUND, GROUND, DECK.z, DECK.z1, teak.shade);
    box(POST.x, POST.x1, GROUND, GROUND, ROSE - 1, ROSE + 1, teak.deep);

    box(POST.x, POST.x1, GROUND, ARM - 1, POST.z, POST.z1, teak.base);
    box(POST.x, POST.x1, ARM, ARM, POST.z, ROSE, teak.base);
    box(POST.x, POST.x1, ARM - 1, ARM - 1, ROSE, ROSE, metal.light);

    // Painted as albedo, not declared as `water`: the sea shader assumes a horizontal
    // surface. It stops short of the boards so it reads as spray, not a blue post.
    box(POST.x, POST.x1, ARM - 5, ARM - 2, ROSE, ROSE, PALETTE.water.light);

    const bar = GROUND + 5;
    const rail = DECK.x - 2;
    for (const z of [DECK.z, DECK.z1]) box(rail, rail, GROUND, bar, z, z, teak.base);
    box(rail, rail, bar, bar, DECK.z, DECK.z1, teak.light);
    box(rail, rail, GROUND + 2, bar, DECK.z + 2, DECK.z + 3, stucco.light);
    box(rail, rail, GROUND + 2, bar, DECK.z1 - 2, DECK.z1 - 1, bloom.base);
  },
});
