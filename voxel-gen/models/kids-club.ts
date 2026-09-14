/**
 * Kids club: a small whitewashed clubhouse with an amber band round it and
 * shutters in three colours, under a tiled gable roof, opening onto a fenced
 * yard with a slide, a sandpit, a playhouse and a bench for the parents.
 * 48x48 (12 x 12 m plot, a 6.5 x 4.5 m clubhouse), a 3x3 tile. The clubhouse
 * door and the yard gate face +z.
 *
 * The playground is the resort's open equipment; this is the supervised one, so
 * what it has to say from across the plot is *building with a garden behind a
 * fence*, not *climbing frame*. The colour is spent on the parts that are
 * already separate materials — the band, the shutters, the door, the slide —
 * rather than painted across the walls, so the house stays in the lane and the
 * yard is what reads as a child's. See `docs/art-direction.md`.
 */
import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = 48;
const EDGE = PLOT - 1;

const BODY = { x: 3, z: 3, w: 26, d: 18 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

/** Surface of the plinth, and the lawn laid into its top course. */
const GROUND = 3;
const LAWN_Y = GROUND - 1;

/** The fence line: its z along the front, and its x down the east side. */
const FENCE_Z = EDGE - 1;
const FENCE_X = EDGE - 1;
/** The gap in the front fence, in front of the path in. */
const GATE = { x0: 10, x1: 17 } as const;

/** The slide: a deck on four posts, a ladder up its back and a chute down +z. */
const SLIDE = { x: 35, z: 6, deck: GROUND + 5 } as const;

/** The parents' bench along the front fence, looking back into the yard. */
const BENCH = { x0: 21, x1: 31, z: 41, z1: 43 } as const;
const BENCH_HIPS = GROUND + 2;

export default defineModel({
  id: 'kids-club',
  label: 'Kids Club',
  category: 'leisure',
  tiles: { x: 3, z: 3 },
  windows: WINDOW_GLASS,
  seats: [23, 27].map((x) => ({ x, y: BENCH_HIPS, z: BENCH.z + 1, facing: 2 as const })),
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, sand, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    if (ground !== GROUND) throw new Error('The plinth moved under the bench');

    // The yard: lawn laid into the plinth's top course inside its lip, round
    // the front and the east side of the clubhouse, and a paved step outside
    // the door.
    box(1, EDGE - 1, LAWN_Y, LAWN_Y, FRONT + 1, EDGE - 1, grass.base);
    box(RIGHT + 2, EDGE - 1, LAWN_Y, LAWN_Y, 1, FRONT, grass.base);
    box(8, 19, LAWN_Y, LAWN_Y, FRONT + 1, FRONT + 4, stone.shade);
    box(GATE.x0 + 1, GATE.x1 - 1, LAWN_Y, LAWN_Y, FRONT + 5, EDGE - 1, stone.shade);

    // The clubhouse, with a band of amber round it under the cornice.
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    box(LEFT, RIGHT, ground + 10, ground + 10, BODY.z, FRONT, amber.base);
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    /** Shutters in turn: red, amber, and the glass blue the door is painted. */
    const shutters: readonly Ramp[] = [bloom, amber, PALETTE.glass];
    doorway(b, { face: 'z+', at: FRONT, along: 12, y: ground, w: 5, h: 8, timber: PALETTE.glass });
    for (const [i, along] of [5, 21].entries()) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, timber: shutters[i]! });
    }
    for (const [i, along] of [7, 15, 22].entries()) {
      shutteredWindow(b, {
        face: 'z-',
        at: BODY.z,
        along,
        y: ground + 3,
        timber: shutters[i % shutters.length]!,
      });
    }
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: 10, y: ground + 3, timber: bloom });
    }

    // The fence: a low white plane with a teak post every two metres, round the
    // front and the east side, open at the gate.
    const fence = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, ground, ground + 2, z0, z1, stucco.light);
    };
    fence(1, GATE.x0 - 1, FENCE_Z, FENCE_Z);
    fence(GATE.x1 + 1, FENCE_X, FENCE_Z, FENCE_Z);
    fence(FENCE_X, FENCE_X, 1, FENCE_Z);
    fence(RIGHT + 2, FENCE_X, 1, 1);
    for (let x = 1; x <= FENCE_X; x += 8) {
      if (x < GATE.x0 || x > GATE.x1) box(x, x, ground, ground + 3, FENCE_Z, FENCE_Z, teak.base);
    }
    for (let z = 1; z < FENCE_Z; z += 8) box(FENCE_X, FENCE_X, ground, ground + 3, z, z, teak.base);
    for (const x of [GATE.x0 - 1, GATE.x1 + 1]) {
      box(x, x, ground, ground + 4, FENCE_Z, FENCE_Z, teak.shade);
    }

    // The slide, on a soft mat: four posts, a red deck, a ladder at its back
    // and an amber chute stepping down one course every two voxels.
    box(SLIDE.x - 2, SLIDE.x + 5, LAWN_Y, LAWN_Y, SLIDE.z - 3, SLIDE.z + 16, terracotta.deep);
    for (const x of [SLIDE.x, SLIDE.x + 3]) {
      for (const z of [SLIDE.z, SLIDE.z + 3]) box(x, x, ground, SLIDE.deck - 1, z, z, teak.base);
    }
    box(SLIDE.x, SLIDE.x + 3, SLIDE.deck, SLIDE.deck, SLIDE.z, SLIDE.z + 3, bloom.base);
    box(SLIDE.x, SLIDE.x + 3, SLIDE.deck + 1, SLIDE.deck + 2, SLIDE.z, SLIDE.z, bloom.shade);
    for (let rung = ground + 1; rung < SLIDE.deck; rung += 2) {
      box(SLIDE.x + 1, SLIDE.x + 2, rung, rung, SLIDE.z - 1, SLIDE.z - 1, teak.light);
    }
    const drop = SLIDE.deck - ground;
    for (let step = 0; step < drop; step++) {
      const z = SLIDE.z + 4 + step * 2;
      box(SLIDE.x + 1, SLIDE.x + 2, SLIDE.deck - step - 1, SLIDE.deck - step, z, z + 1, amber.base);
    }

    // The sandpit, kerbed in teak, with a red bucket in it and a parasol over it.
    const PIT = { x0: 19, x1: 30, z0: 26, z1: 35 } as const;
    box(PIT.x0, PIT.x1, ground, ground, PIT.z0, PIT.z1, teak.base);
    box(PIT.x0 + 1, PIT.x1 - 1, ground, ground, PIT.z0 + 1, PIT.z1 - 1, sand.base);
    box(26, 27, ground + 1, ground + 2, 29, 30, bloom.base);
    parasol(b, { x: 23, z: 30, y: ground + 1, height: 9, reach: 3, canvas: bloom });

    // The playhouse: a stucco box with a glass-blue door, under a red roof.
    const HOUSE = { x: 35, z: 29, w: 7, d: 7 } as const;
    const hx1 = HOUSE.x + HOUSE.w - 1;
    const hz1 = HOUSE.z + HOUSE.d - 1;
    box(HOUSE.x, hx1, ground, ground + 5, HOUSE.z, hz1, stucco.base);
    box(HOUSE.x + 2, HOUSE.x + 4, ground, ground + 3, hz1, hz1, PALETTE.glass.deep);
    gableRoof(b, { ...HOUSE, y: ground + 6, ridge: 'z', overhang: 1, tile: bloom });

    // Hopscotch chalked on the path in: flat squares, one course each.
    for (const z of [FRONT + 7, FRONT + 11, FRONT + 15]) {
      box(GATE.x0 + 2, GATE.x1 - 2, LAWN_Y, LAWN_Y, z, z + 2, stucco.light);
    }

    // The parents' bench, back to the fence.
    for (const x of [BENCH.x0 + 1, BENCH.x1 - 1]) {
      box(x, x, ground, ground, BENCH.z, BENCH.z1, teak.deep);
    }
    box(BENCH.x0, BENCH.x1, ground + 1, ground + 1, BENCH.z, BENCH.z1, teak.base);
    box(BENCH.x0, BENCH.x1, BENCH_HIPS, BENCH_HIPS + 1, BENCH.z1 + 1, BENCH.z1 + 1, teak.shade);

    // A pot either side of the clubhouse door.
    for (const x of [9, 18]) pottedPlant(b, { x, z: FRONT + 2, y: ground, leaf: foliage });
  },
});
