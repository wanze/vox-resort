import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { clippedCypress, oleander } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const N = 31;
const C = 16;

const GROUND = 2;
const RIM_TOP = GROUND + 1;

// An eight-pointed star, a square laid over a diamond: every edge is straight or a clean
// diagonal, so the rim merges into runs where a circle would break into steps.
interface Star {
  readonly square: number;
  readonly diamond: number;
}

const OUTER: Star = { square: 7, diamond: 10 };
const WATER: Star = { square: 6, diamond: 8.5 };

// The rills run out along both axes from the star's points, as in a Moorish garden.
const RILL = { lo: C - 1, hi: C, end: 2 } as const;

const BOWL = { reach: 3, chamfer: 1, deck: GROUND + 6 } as const;

export default defineModel({
  id: 'fountain-c',
  label: 'Fountain C',
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
    const { bloom, stone, stucco, terracotta, water } = PALETTE;

    const inStar = (x: number, z: number, star: Star): boolean => {
      const dx = Math.abs(x + 0.5 - C);
      const dz = Math.abs(z + 0.5 - C);
      return (dx <= star.square && dz <= star.square) || dx + dz <= star.diamond;
    };
    const inRill = (x: number, z: number): boolean =>
      (x >= RILL.lo && x <= RILL.hi && z >= RILL.end && z <= N - RILL.end) ||
      (z >= RILL.lo && z <= RILL.hi && x >= RILL.end && x <= N - RILL.end);

    plinth(b, { x: 0, z: 0, w: N + 1, d: N + 1, height: GROUND });
    box(1, N - 1, GROUND - 1, GROUND - 1, 1, N - 1, terracotta.light);

    for (let x = 0; x <= N; x++) {
      for (let z = 0; z <= N; z++) {
        if (inStar(x, z, WATER)) {
          box(x, x, 1, RIM_TOP - 1, z, z, water.base);
        } else if (inStar(x, z, OUTER)) {
          box(x, x, GROUND, RIM_TOP - 1, z, z, stucco.light);
          b.set(x, RIM_TOP, z, water.shade);
        } else if (inRill(x, z)) {
          b.set(x, GROUND - 1, z, water.base);
        }
      }
    }

    // A stone block caps each rill where it meets the plaza edge, the spout it seems to run to.
    for (const [x0, x1, z0, z1] of [
      [RILL.lo, RILL.hi, RILL.end - 1, RILL.end - 1],
      [RILL.lo, RILL.hi, N - RILL.end + 1, N - RILL.end + 1],
      [RILL.end - 1, RILL.end - 1, RILL.lo, RILL.hi],
      [N - RILL.end + 1, N - RILL.end + 1, RILL.lo, RILL.hi],
    ] as const) {
      box(x0, x1, GROUND - 1, GROUND + 1, z0, z1, stone.light);
    }

    box(C - 2, C + 1, 1, RIM_TOP, C - 2, C + 1, stone.base);
    box(C - 1, C, RIM_TOP + 1, BOWL.deck - 2, C - 1, C, stone.base);

    const inBowl = (x: number, z: number, reach: number): boolean => {
      const dx = Math.abs(x + 0.5 - C);
      const dz = Math.abs(z + 0.5 - C);
      return dx <= reach && dz <= reach && dx + dz <= reach + BOWL.chamfer;
    };
    for (let x = C - BOWL.reach; x < C + BOWL.reach; x++) {
      for (let z = C - BOWL.reach; z < C + BOWL.reach; z++) {
        if (!inBowl(x, z, BOWL.reach)) continue;
        if (inBowl(x, z, BOWL.reach - 1)) box(x, x, BOWL.deck - 1, BOWL.deck - 1, z, z, water.base);
        else box(x, x, BOWL.deck - 1, BOWL.deck, z, z, stone.light);
      }
    }
    // The jet is painted light rather than as water: the shader only takes level water.
    box(C - 1, C, BOWL.deck, BOWL.deck + 3, C - 1, C, water.light);
    box(C - 1, C, BOWL.deck + 4, BOWL.deck + 4, C - 1, C, stucco.light);

    // Cypresses in the three far quarters; the near one gets a low oleander, since a tree
    // there would stand between the camera and the basin.
    for (const [x, z] of [
      [2, 2],
      [N - 5, 2],
      [N - 5, N - 5],
    ] as const) {
      box(x - 1, x + 4, GROUND - 1, GROUND - 1, z - 1, z + 4, stucco.base);
      clippedCypress(b, { x, z, y: GROUND, height: 16 });
    }
    oleander(b, { x: 2, z: N - 7, y: GROUND });
    for (const [x, z] of [
      [N - 4, 9],
      [9, N - 4],
    ] as const) {
      box(x, x + 1, GROUND, GROUND + 1, z, z + 1, terracotta.shade);
      box(x, x + 1, GROUND + 2, GROUND + 2, z, z + 1, bloom.base);
    }
  },
});
