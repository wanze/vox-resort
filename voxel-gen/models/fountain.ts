import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const N = 31;

const C = 16;

const APRON = { x: 0, z: 0, w: N + 1, d: N + 1, height: 2 } as const;
const PEDESTAL = { x: 4, z: 4, w: 24, d: 24, y: 2, height: 2 } as const;

interface Bowl {
  readonly reach: number;
  readonly chamfer: number;
  readonly rim: number;
}

const LOWER: Bowl = { reach: 10, chamfer: 5, rim: 2 };
const MIDDLE: Bowl = { reach: 6, chamfer: 3, rim: 1 };
const TOP: Bowl = { reach: 3, chamfer: 1, rim: 1 };

const COLUMN = { x0: 13, x1: 18, height: 5 } as const;
const STEM = { x0: 14, x1: 17, height: 3 } as const;

export default defineModel({
  id: 'fountain',
  label: 'Fountain',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  // One flat tone: dithering a second blue defeats the water merge. There is no
  // falling water, because the water shader only shades horizontal surfaces correctly.
  water: [PALETTE.water.base],
  lights: [
    { x: 11, y: 2, z: 16, color: PALETTE.water.light, intensity: 90, distance: 52 },
    { x: 21, y: 2, z: 16, color: PALETTE.water.light, intensity: 90, distance: 52 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stone, water } = PALETTE;

    // An octagon rather than a circle: its flats merge into single rectangles, and
    // from 30 degrees it reads as round anyway.
    const inside = (x: number, z: number, reach: number, chamfer: number): boolean => {
      const dx = Math.abs(x + 0.5 - C);
      const dz = Math.abs(z + 0.5 - C);
      return dx <= reach && dz <= reach && dx + dz <= reach + chamfer;
    };

    const pad = (y0: number, y1: number, o: Bowl): void => {
      for (let x = 0; x <= N; x++) {
        for (let z = 0; z <= N; z++) {
          if (inside(x, z, o.reach, o.chamfer)) box(x, x, y0, y1, z, z, stone.base);
        }
      }
    };

    const bowl = (deck: number, depth: number, o: Bowl): void => {
      const floor = deck - depth;
      for (let x = 0; x <= N; x++) {
        for (let z = 0; z <= N; z++) {
          if (!inside(x, z, o.reach, o.chamfer)) continue;
          if (inside(x, z, o.reach - o.rim, o.chamfer)) {
            box(x, x, floor, deck - 1, z, z, water.base);
            b.del(x, deck, z);
          } else {
            box(x, x, floor, deck, z, z, stone.light);
          }
        }
      }
    };

    plinth(b, APRON);
    const top = plinth(b, PEDESTAL) - 1;

    bowl(top, 2, LOWER);

    const foot = top - 2;
    const capital = foot + COLUMN.height + 1;
    box(COLUMN.x0, COLUMN.x1, foot, capital - 1, COLUMN.x0, COLUMN.x1, stone.base);
    box(COLUMN.x0 - 1, COLUMN.x1 + 1, capital, capital, COLUMN.x0 - 1, COLUMN.x1 + 1, stone.shade);

    const middle = capital + 2;
    pad(capital + 1, middle, MIDDLE);
    bowl(middle, 1, MIDDLE);

    const crest = middle + STEM.height + 2;
    box(STEM.x0, STEM.x1, middle + 1, crest - 2, STEM.x0, STEM.x1, stone.base);
    pad(crest - 1, crest, TOP);
    bowl(crest, 1, TOP);
  },
});
