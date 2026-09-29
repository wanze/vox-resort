import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const N = 31;
const C = 16;

const GROUND = 2;
const RIM_TOP = GROUND + 2;

// A square with a half-round lobe on each side: the lobes' curves are short runs, and the
// square between them keeps most of the rim in long straight rectangles.
interface Foil {
  readonly square: number;
  readonly lobe: number;
}

const OUTER: Foil = { square: 9, lobe: 5.5 };
const WATER: Foil = { square: 7, lobe: 3.5 };
const LOBE_AT = 9;

const BOWL = { reach: 6, chamfer: 3 } as const;
const COLUMN = { x0: 14, x1: 17 } as const;
const BOWL_DECK = RIM_TOP + 6;

export default defineModel({
  id: 'fountain-b',
  label: 'Fountain B',
  category: 'amenities',
  scenery: 1,
  tiles: { x: 2, z: 2 },
  water: [PALETTE.water.base],
  lights: [
    { x: 11, y: 2, z: 16, color: PALETTE.water.light, intensity: 90, distance: 52 },
    { x: 21, y: 2, z: 16, color: PALETTE.water.light, intensity: 90, distance: 52 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, stone, teak, terracotta, water } = PALETTE;

    const inFoil = (x: number, z: number, foil: Foil): boolean => {
      const dx = x + 0.5 - C;
      const dz = z + 0.5 - C;
      if (Math.abs(dx) <= foil.square && Math.abs(dz) <= foil.square) return true;
      return [
        [LOBE_AT, 0],
        [-LOBE_AT, 0],
        [0, LOBE_AT],
        [0, -LOBE_AT],
      ].some(([lx, lz]) => (dx - lx!) ** 2 + (dz - lz!) ** 2 <= foil.lobe ** 2);
    };

    plinth(b, { x: 0, z: 0, w: N + 1, d: N + 1, height: GROUND });
    box(2, N - 2, GROUND - 1, GROUND - 1, 2, N - 2, stone.light);

    for (let x = 0; x <= N; x++) {
      for (let z = 0; z <= N; z++) {
        if (inFoil(x, z, WATER)) {
          box(x, x, 1, RIM_TOP - 1, z, z, water.base);
        } else if (inFoil(x, z, OUTER)) {
          box(x, x, GROUND, RIM_TOP - 1, z, z, stone.base);
          b.set(x, RIM_TOP, z, stone.light);
        }
      }
    }

    box(COLUMN.x0 - 1, COLUMN.x1 + 1, 1, RIM_TOP + 1, COLUMN.x0 - 1, COLUMN.x1 + 1, stone.base);
    box(COLUMN.x0, COLUMN.x1, RIM_TOP + 2, BOWL_DECK - 2, COLUMN.x0, COLUMN.x1, stone.base);
    box(
      COLUMN.x0 - 1,
      COLUMN.x1 + 1,
      BOWL_DECK - 3,
      BOWL_DECK - 3,
      COLUMN.x0 - 1,
      COLUMN.x1 + 1,
      stone.shade,
    );

    // An octagon: its flats merge into single rectangles and from 30 degrees it reads as round.
    const inBowl = (x: number, z: number, reach: number): boolean => {
      const dx = Math.abs(x + 0.5 - C);
      const dz = Math.abs(z + 0.5 - C);
      return dx <= reach && dz <= reach && dx + dz <= reach + BOWL.chamfer;
    };
    for (let x = 0; x <= N; x++) {
      for (let z = 0; z <= N; z++) {
        if (!inBowl(x, z, BOWL.reach)) continue;
        if (inBowl(x, z, BOWL.reach - 1)) {
          box(x, x, BOWL_DECK - 2, BOWL_DECK - 1, z, z, water.base);
        } else {
          box(x, x, BOWL_DECK - 2, BOWL_DECK, z, z, stone.light);
        }
      }
    }
    box(COLUMN.x0, COLUMN.x1, BOWL_DECK - 2, BOWL_DECK - 2, COLUMN.x0, COLUMN.x1, stone.base);

    // A pine cone on a short stem: a plus in plan, so from above it reads round, not as a cube.
    const cone = BOWL_DECK + 3;
    box(15, 16, BOWL_DECK - 1, cone - 1, 15, 16, stone.base);
    box(14, 17, cone, cone + 2, 15, 16, stone.light);
    box(15, 16, cone, cone + 2, 14, 17, stone.light);
    box(15, 16, cone + 3, cone + 4, 15, 16, stone.light);

    // Orange trees in the three far corners; the near one gets a low bed, since a tree there
    // would stand between the camera and the basin.
    box(2, 7, GROUND, GROUND + 1, N - 3, N - 2, teak.deep);
    box(2, 3, GROUND, GROUND + 1, N - 7, N - 4, teak.deep);
    for (let x = 2; x <= 7; x += 2) b.set(x, GROUND + 2, N - 2, bloom.base);
    for (let z = N - 7; z <= N - 3; z += 2) b.set(2, GROUND + 2, z, amber.base);
    for (const [x, z] of [
      [1, 1],
      [N - 5, 1],
      [N - 5, N - 5],
    ] as const) {
      box(x + 1, x + 3, GROUND, GROUND + 1, z + 1, z + 3, terracotta.shade);
      box(x + 1, x + 3, GROUND + 2, GROUND + 2, z + 1, z + 3, terracotta.base);
      box(x + 2, x + 2, GROUND + 3, GROUND + 5, z + 2, z + 2, teak.base);
      box(x, x + 4, GROUND + 6, GROUND + 8, z + 1, z + 3, foliage.base);
      box(x + 1, x + 3, GROUND + 6, GROUND + 8, z, z + 4, foliage.base);
      box(x + 1, x + 3, GROUND + 9, GROUND + 9, z + 1, z + 3, foliage.light);
      for (const [dx, dy, dz] of [
        [0, 7, 3],
        [3, 8, 4],
        [4, 6, 1],
        [2, 9, 2],
      ] as const) {
        b.set(x + dx, GROUND + dy, z + dz, amber.base);
      }
    }
  },
});
