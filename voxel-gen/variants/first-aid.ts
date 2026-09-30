import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 3, z: 4, w: 16, d: 20 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const GROUND = 3;

// Spans the building's depth, so the canopy lines up with the flat roof beside it.
const PORCH = { x0: RIGHT + 1, x1: 30, z0: BODY.z, z1: FRONT } as const;
const CANOPY = GROUND + 11;

// The bench backs onto the side wall so the waiting patients face out across the porch.
const BENCH = { x0: RIGHT + 2, x1: RIGHT + 4, z0: 9, z1: 18 } as const;
const HIPS = GROUND + 2;

export default defineModel({
  id: 'first-aid-b',
  label: 'First Aid B',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  windows: WINDOW_GLASS,
  seats: [11, 16].map((z) => ({ x: BENCH.x0 + 1, y: HIPS, z, facing: 1 as const })),
  venue: {
    role: 'service',
    satisfies: [{ need: 'health', amount: 1 }],
    capacity: 4,
    dwellSeconds: { min: 300, max: 900 },
    doors: [{ x: 8, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, glass, grass, stone, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32 });
    if (ground !== GROUND) throw new Error('The porch and its bench must agree on its surface');
    box(PORCH.x0, PORCH.x1, ground - 1, ground - 1, PORCH.z0, PORCH.z1, stone.light);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    flatRoof(b, { ...BODY, y: eaves, cover: stucco });
    // Painted on the roof as well as the wall: from 30 degrees the roof is most of what shows.
    box(7, 14, eaves, eaves, 12, 15, bloom.base);
    box(9, 12, eaves, eaves, 10, 17, bloom.base);

    doorway(b, { face: 'z+', at: FRONT, along: 6, y: ground, timber: glass });
    shutteredWindow(b, { face: 'z+', at: FRONT, along: 12, y: ground + 4, w: 4, timber: foliage });
    flowerBox(b, { x: 11, z: FRONT + 1, y: ground, w: 6, along: 'x' });

    for (const along of [6, 20]) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along, y: ground + 4, w: 2, timber: foliage });
    }
    box(LEFT, LEFT, ground + 3, ground + 10, 12, 15, bloom.base);
    box(LEFT, LEFT, ground + 5, ground + 8, 10, 17, bloom.base);

    // A green canvas lean-to on two posts, off the side wall and over the bench: the reference's
    // canopy. It falls a course every four voxels so it reads as sloping, not as a lid.
    for (let course = 0; course < 3; course++) {
      const x0 = PORCH.x0 + course * 4;
      const x1 = course === 2 ? PORCH.x1 : x0 + 3;
      box(x0, x1, CANOPY - course, CANOPY - course, PORCH.z0, PORCH.z1, foliage.light);
    }
    box(PORCH.x1, PORCH.x1, CANOPY - 4, CANOPY - 3, PORCH.z0, PORCH.z1, foliage.base);
    for (const z of [PORCH.z0 + 1, PORCH.z1 - 1]) {
      box(PORCH.x1 - 1, PORCH.x1 - 1, ground, CANOPY - 3, z, z, teak.shade);
    }

    box(BENCH.x0, BENCH.x1, ground + 1, ground + 1, BENCH.z0, BENCH.z1, teak.base);
    for (const z of [BENCH.z0, BENCH.z1]) {
      box(BENCH.x0, BENCH.x1, ground, ground, z, z, teak.shade);
    }
    box(BENCH.x0 - 1, BENCH.x0 - 1, ground, ground + 4, BENCH.z0, BENCH.z1, teak.shade);

    box(27, 28, ground, ground + 3, 9, 10, stucco.light);
    box(27, 28, ground + 4, ground + 5, 9, 10, glass.light);

    box(1, 16, ground - 1, ground - 1, FRONT + 3, 30, grass.base);
    box(5, 10, ground - 1, ground - 1, FRONT + 1, 30, stone.light);
    pottedPlant(b, { x: 2, z: 27, y: ground });
    pottedPlant(b, { x: 0, z: 1, y: ground });
  },
});
