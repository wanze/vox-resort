/**
 * Basketball court: a full 28 x 14 m hard court in blue with red keys, laid into
 * a slate slab with run-off all round, a hoop on a padded pole behind each
 * baseline, three tiers of timber bleachers along the north side and four
 * floodlight masts at the corners. 128x80x27 (32 x 20 m), an 8x5 tile.
 * The bleachers face +z, across the court.
 *
 * **The lines are straight.** A three-point arc and a centre circle drawn on
 * this grid are staircases of single voxels, which is the one shape the mesher
 * cannot merge — see `docs/art-direction.md`. So the arc is drawn as the box a
 * court's corner threes and top of the key make, the centre circle is a square,
 * and the key is one filled rectangle. From the height the plot is seen at, the
 * lines read as a basketball court because of the hoops and the keys, not
 * because of the curves.
 *
 * **The hoop is at the right height.** Rim at 3 m, twelve voxels over the court,
 * with the backboard a metre and a quarter in from the baseline, so a crowd
 * figure standing under it is the size it should be.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 128;
const NZ = 80;

/** The court's own course, laid into the slab's top, and the layer over it. */
const SURFACE = 2;
const ON = SURFACE + 1;

/** The playing court, 28 x 14 m, south of the bleachers. */
const COURT = { x0: 8, x1: 119, z0: 12, z1: 67 } as const;
const MID_X = (COURT.x0 + COURT.x1 + 1) / 2;
const MID_Z = (COURT.z0 + COURT.z1 + 1) / 2;

/** The key: 4.9 m wide, 5.8 m from the baseline. */
const KEY = { depth: 23, half: 10 } as const;
/** The three-point line, drawn as a box: 6.75 m out from the baseline, 0.9 m in from the sides. */
const THREE = { depth: 28, inset: 4 } as const;

/** Rim height above the court, and how far in from the baseline the backboard stands. */
const RIM = 12;
const BOARD = 5;

/** The bleachers: their run along x, and three tiers stepping up towards the plot edge. */
const STAND = { x0: 32, x1: 95 } as const;
const TIERS = 3;
/** The z of tier `k`'s front row; each tier is two voxels deep and two courses higher. */
const tierZ = (k: number): number => COURT.z0 - 3 - 2 * k;
const tierTop = (k: number): number => ON + 1 + 2 * k;

/** Columns along the stand people sit in, a metre and a half apart. */
const SITTERS = Array.from({ length: 11 }, (_, i) => STAND.x0 + 2 + i * 6);

const LANTERN = PALETTE.amber.light;
const MAST_TOP = ON + 22;
const MASTS = [
  [2, 2],
  [NX - 4, 2],
  [2, NZ - 4],
  [NX - 4, NZ - 4],
] as const;

export default defineModel({
  id: 'basketball-court',
  label: 'Basketball Court',
  category: 'leisure',
  tiles: { x: 8, z: 5 },
  emissive: [LANTERN],
  /** Spectators on every tier, looking out across the court. */
  seats: Array.from({ length: TIERS }, (_, k) =>
    SITTERS.map((x) => ({ x, y: tierTop(k) + 1, z: tierZ(k) - 1, facing: 0 as const })),
  ).flat(),
  /** Four floods, each over its own quarter of the court rather than at its mast. */
  lights: [
    [36, 26],
    [92, 26],
    [36, 54],
    [92, 54],
  ].map(([x, z]) => ({
    x: x!,
    y: MAST_TOP - 4,
    z: z!,
    color: LANTERN,
    intensity: 120,
    distance: 90,
  })),
  venue: {
    // a hard court in the open, floodlights and all.
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ],
    capacity: 10,
    dwellSeconds: { min: 1200, max: 2700 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, glass, metal, slate, stucco, teak, terracotta } = PALETTE;

    // The slab, in slate, with its darker lip, and the court laid into its top.
    plinth(b, { x: 0, z: 0, w: NX, d: NZ, stone: slate });
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, glass.shade);

    const line = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, SURFACE, SURFACE, z0, z1, stucco.light);
    const outline = (x0: number, x1: number, z0: number, z1: number): void => {
      line(x0, x1, z0, z0);
      line(x0, x1, z1, z1);
      line(x0, x0, z0, z1);
      line(x1, x1, z0, z1);
    };

    // Each end: the three-point box, the filled key, and the hoop.
    for (const end of [-1, 1] as const) {
      const baseline = end === -1 ? COURT.x0 : COURT.x1;
      const inward = (d: number): number => baseline - end * d;
      const [threeLo, threeHi] = [inward(0), inward(THREE.depth)].toSorted((p, q) => p - q);
      outline(threeLo!, threeHi!, COURT.z0 + THREE.inset, COURT.z1 - THREE.inset);
      const [keyLo, keyHi] = [inward(0), inward(KEY.depth)].toSorted((p, q) => p - q);
      box(
        keyLo!,
        keyHi!,
        SURFACE,
        SURFACE,
        MID_Z - KEY.half,
        MID_Z + KEY.half - 1,
        terracotta.base,
      );
      outline(keyLo!, keyHi!, MID_Z - KEY.half, MID_Z + KEY.half - 1);

      // The pole stands in the run-off behind the baseline, padded at its
      // foot, with an arm out over the court to the board.
      const pole = baseline + end * 5;
      box(pole - 1, pole + 1, ON, ON + 4, MID_Z - 2, MID_Z + 1, bloom.shade);
      box(pole, pole, ON, ON + RIM + 3, MID_Z - 1, MID_Z, metal.base);
      const board = inward(BOARD);
      box(
        Math.min(pole, board),
        Math.max(pole, board),
        ON + RIM + 2,
        ON + RIM + 2,
        MID_Z - 1,
        MID_Z,
        metal.shade,
      );
      box(board, board, ON + RIM - 1, ON + RIM + 3, MID_Z - 4, MID_Z + 3, stucco.light);
      box(board, board, ON + RIM, ON + RIM + 1, MID_Z - 2, MID_Z + 1, bloom.base);

      // The rim, a hollow square hung off the board.
      const [rimLo, rimHi] = [inward(BOARD + 1), inward(BOARD + 4)].toSorted((p, q) => p - q);
      box(rimLo!, rimHi!, ON + RIM - 1, ON + RIM - 1, MID_Z - 2, MID_Z + 1, amber.base);
      for (let x = rimLo! + 1; x < rimHi!; x++) {
        for (let z = MID_Z - 1; z <= MID_Z; z++) b.del(x, ON + RIM - 1, z);
      }
    }

    // The boundary, the halfway line and the centre square over everything else.
    outline(COURT.x0, COURT.x1, COURT.z0, COURT.z1);
    box(MID_X - 7, MID_X + 6, SURFACE, SURFACE, MID_Z - 7, MID_Z + 6, terracotta.base);
    outline(MID_X - 7, MID_X + 6, MID_Z - 7, MID_Z + 6);
    line(MID_X - 1, MID_X, COURT.z0, COURT.z1);

    // The bleachers: each tier a teak step on a shaded riser, and a rail behind
    // the top one.
    for (let k = 0; k < TIERS; k++) {
      const z = tierZ(k);
      box(STAND.x0, STAND.x1, ON, tierTop(k) - 1, z - 1, z, teak.shade);
      box(STAND.x0, STAND.x1, tierTop(k), tierTop(k), z - 1, z, teak.base);
    }
    const back = tierZ(TIERS - 1) - 2;
    box(STAND.x0, STAND.x1, ON, tierTop(TIERS - 1) + 3, back, back, metal.base);

    // The basketball, left at the foot of the stand: a 50 cm cube.
    box(60, 61, ON, ON + 1, COURT.z0 + 3, COURT.z0 + 4, amber.shade);

    // The floodlight masts, one at each corner, with a bar of lamps on top.
    for (const [x, z] of MASTS) {
      box(x, x + 1, ON, MAST_TOP - 1, z, z + 1, metal.shade);
      box(x - 1, x + 2, MAST_TOP, MAST_TOP + 1, z - 1, z + 2, metal.deep);
      box(x - 1, x + 2, MAST_TOP - 1, MAST_TOP - 1, z - 1, z + 2, LANTERN);
    }
  },
});
