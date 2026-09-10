/**
 * Mini-golf course: ten kerbed greens laid out as a lattice on one stone plinth,
 * with sand walks between them, a hedge round the lot and a windmill on the
 * third hole. 96x80 (24 x 20 m), a 6x5 tile.
 *
 * Massing from `docs/references/minigolf.jpg` — greens divided by walks, the
 * windmill standing over the middle of the course, planting at the edges — with
 * the colour taken from the matte Mediterranean lane, as everything is. See
 * `docs/art-direction.md`.
 *
 * The model it replaces had the dithering fault twice over on the one surface a
 * course is made of. Its lawn was `(x + z) % 2` in two greens across 76x60
 * cells and its paths were the same alternation in two sands over another 1 700
 * — the whole ground of the model, painted voxel by voxel, which is exactly the
 * pattern the mesher cannot merge into a rectangle. Both are one flat tone now,
 * and what the difference paid for is the rest of this pass: five more holes, a
 * kerb round every green, a windmill built rather than blocked out, two ponds
 * cut with `poolWater` and a clipped hedge round the boundary.
 *
 * The layout is a lattice rather than the old winding spine, and that is a
 * legibility argument rather than a taste one. A course seen from 30 degrees
 * above is read by its greens, so the greens are what carry the outline: five
 * across and two down, each 3 x 7 m and kerbed a voxel proud, with 1 m of sand
 * between them. A path that wanders reads as noise at this scale; a path that
 * rules the plot into ten equal beds reads as a course.
 *
 * Nothing on it stands higher than the hedge except the windmill, which is the
 * one thing that is meant to. `docs/art-direction.md` is blunt about what a
 * tall object in front of a building costs, and a course is all foreground —
 * so the hedge is 75 cm, the kerbs are 25, and the flags are thin.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 95;
const Z = 79;

/** The layer the whole course is played on: the plinth's first free layer. */
const GREEN = 3;

/** The lawn, inset a voxel inside the plinth so its stone edge reads as a kerb. */
const LAWN = { x0: 2, x1: 93, z0: 2, z1: 77 } as const;

/**
 * The lattice: six sand walks across and three down, each 4 voxels (1 m) wide,
 * with a 12x28 green in every bed between them.
 *
 * The numbers are one division rather than five arbitrary ones — 92 voxels of
 * lawn across is 4 of verge, then six walks and five greens, and 76 down is the
 * same sum with three walks and two greens. Every green is therefore the same
 * size and every walk the same width, which is what stops ten holes reading as
 * ten drawings.
 */
const WALK = 4;
const WALK_X = [6, 22, 38, 54, 70, 86] as const;
const WALK_Z = [6, 38, 70] as const;
const FAIR_X = [10, 26, 42, 58, 74] as const;
const FAIR_Z = [10, 42] as const;
const FAIR_W = 12;
const FAIR_D = 28;

/** The middle walk of each axis, which is the one that runs out to a gate. */
const GATE = { lo: 38, hi: 41 } as const;

/** What stands in the middle of a hole, between its tee and its cup. */
type Obstacle = 'hedge' | 'bank' | 'mound' | 'pond' | 'windmill';

/**
 * The ten holes, in the order they are played: west to east along the north
 * row, then back east to west along the south one.
 *
 * `tee` is the end the ball starts at, and it alternates down each row so the
 * circuit snakes — a player finishing hole 1 at its south end starts hole 2 at
 * the south end too, which is how a real course is walked and why the walks
 * between the beds are where they are.
 */
const HOLES: ReadonlyArray<{
  readonly x: number;
  readonly z: number;
  readonly tee: 'north' | 'south';
  readonly obstacle: Obstacle;
}> = [
  { x: FAIR_X[0]!, z: FAIR_Z[0]!, tee: 'north', obstacle: 'hedge' },
  { x: FAIR_X[1]!, z: FAIR_Z[0]!, tee: 'south', obstacle: 'bank' },
  { x: FAIR_X[2]!, z: FAIR_Z[0]!, tee: 'north', obstacle: 'windmill' },
  { x: FAIR_X[3]!, z: FAIR_Z[0]!, tee: 'south', obstacle: 'pond' },
  { x: FAIR_X[4]!, z: FAIR_Z[0]!, tee: 'north', obstacle: 'mound' },
  { x: FAIR_X[4]!, z: FAIR_Z[1]!, tee: 'north', obstacle: 'bank' },
  { x: FAIR_X[3]!, z: FAIR_Z[1]!, tee: 'south', obstacle: 'hedge' },
  { x: FAIR_X[2]!, z: FAIR_Z[1]!, tee: 'north', obstacle: 'pond' },
  { x: FAIR_X[1]!, z: FAIR_Z[1]!, tee: 'south', obstacle: 'mound' },
  { x: FAIR_X[0]!, z: FAIR_Z[1]!, tee: 'north', obstacle: 'hedge' },
];

/**
 * The one colour that burns after dark: `amber.light`, the lantern the bars and
 * the taverna hang, rather than a yellow private to this model.
 */
const LANTERN = PALETTE.amber.light;

/**
 * Six bollards down the middle walk, alternating sides of it so the trail
 * reads as a trail rather than as a row of posts.
 *
 * Six on a course half again the size of the old one, which is the same count
 * the model it replaces carried: a lamp is bake time and volume rather than
 * frame time, but this object stands on the plot eight times, so the six here
 * are 48 anchors and a seventh would be eight more. They are knee-high and
 * short-reaching on purpose — a course lit by one flood is a car park.
 */
const BOLLARDS: ReadonlyArray<readonly [number, number]> = [
  [7, GATE.lo],
  [23, GATE.hi],
  [39, GATE.lo],
  [55, GATE.hi],
  [71, GATE.lo],
  [87, GATE.hi],
];

export default defineModel({
  id: 'minigolf',
  label: 'Minigolf',
  category: 'leisure',
  tiles: { x: 6, z: 5 },
  emissive: [LANTERN],
  // The two ponds, meshed apart and shaded with the sea's own shader.
  water: [PALETTE.water.base],
  lights: BOLLARDS.map(([x, z]) => ({
    x,
    z,
    y: GREEN + 4,
    color: LANTERN,
    intensity: 34,
    distance: 28,
  })),
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { foliage, glass, grass, metal, sand, stone, stucco, teak, water } = PALETTE;

    /**
     * The plinth, and the whole of the ground this model has.
     *
     * Three layers, the 75 cm the rest of the catalogue stands its plots on, in
     * stone, so a course between a tennis court and a playground sits at the
     * height they do. The lawn is laid a layer above it and inset a voxel, so
     * the plinth's own lip shows as a paved kerb all the way round rather than
     * being hidden under grass.
     */
    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    box(LAWN.x0, LAWN.x1, GREEN, GREEN, LAWN.z0, LAWN.z1, grass.base);

    /**
     * The walks: one flat tone of sand, and the lattice closed on itself.
     *
     * Each run stops at the outermost walk of the other axis rather than at the
     * edge of the lawn, which leaves the verge outside it whole for the hedge
     * to stand on. The four gates below are the only places the sand crosses it.
     */
    const lastX = WALK_X[WALK_X.length - 1]! + WALK - 1;
    const lastZ = WALK_Z[WALK_Z.length - 1]! + WALK - 1;
    for (const x of WALK_X) box(x, x + WALK - 1, GREEN, GREEN, WALK_Z[0]!, lastZ, sand.base);
    for (const z of WALK_Z) box(WALK_X[0]!, lastX, GREEN, GREEN, z, z + WALK - 1, sand.base);

    // The four gates: the middle walk of each axis run out through the verge to
    // the plinth's edge, so the course is entered from whichever side the
    // layout's spur arrives on.
    box(GATE.lo, GATE.hi, GREEN, GREEN, LAWN.z0, WALK_Z[0]! - 1, sand.base);
    box(GATE.lo, GATE.hi, GREEN, GREEN, lastZ + 1, LAWN.z1, sand.base);
    box(LAWN.x0, WALK_X[0]! - 1, GREEN, GREEN, GATE.lo, GATE.hi, sand.base);
    box(lastX + 1, LAWN.x1, GREEN, GREEN, GATE.lo, GATE.hi, sand.base);

    /**
     * A hole: a mown green a step lighter than the lawn, kerbed a voxel proud
     * all round, with a tee pad at one end and a cup, its ring and its flag at
     * the other.
     *
     * The kerb is geometry rather than paint, which is the whole trick of the
     * pass: a green marked out by a course of stone standing 25 cm above it
     * reads from any angle and costs four rectangles, where the two-tone lawn
     * it replaces cost one quad per voxel and read as static.
     */
    const fairway = (fx: number, fz: number): void => {
      const x1 = fx + FAIR_W - 1;
      const z1 = fz + FAIR_D - 1;
      box(fx, x1, GREEN, GREEN, fz, z1, grass.light);
      box(fx, x1, GREEN + 1, GREEN + 1, fz, fz, stone.light);
      box(fx, x1, GREEN + 1, GREEN + 1, z1, z1, stone.light);
      box(fx, fx, GREEN + 1, GREEN + 1, fz, z1, stone.light);
      box(x1, x1, GREEN + 1, GREEN + 1, fz, z1, stone.light);
    };

    /** The mat the ball is struck from: a slab of paving with a teak marker. */
    const tee = (x: number, z: number): void => {
      box(x, x + 3, GREEN, GREEN, z, z + 2, stone.base);
      set(x + 1, GREEN + 1, z + 1, teak.deep);
    };

    /**
     * The cup, its ring of paving, and the flag standing in it.
     *
     * The flags alternate red and yellow down the course. Two colours over ten
     * separate objects is not a dither — each flag is its own 4x3 rectangle and
     * merges whole — and it is what tells one hole from the next in a frame
     * where every green is the same size on purpose.
     */
    const cup = (x: number, z: number, flag: number): void => {
      box(x - 1, x + 1, GREEN, GREEN, z - 1, z + 1, stone.light);
      set(x, GREEN, z, metal.deep);
      box(x, x, GREEN + 1, GREEN + 10, z, z, stucco.light);
      box(x + 1, x + 4, GREEN + 8, GREEN + 10, z, z, flag);
    };

    /** A clipped block of hedge, the obstacle and the boundary both. */
    const clipped = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, GREEN + 1, GREEN + 3, z0, z1, foliage.base);

    /** A dogleg: two blocks of hedge offset from opposite kerbs. */
    const dogleg = (fx: number, fz: number): void => {
      clipped(fx + 1, fx + 6, fz + 10, fz + 12);
      clipped(fx + 5, fx + 10, fz + 15, fz + 17);
    };

    /** A bank: a low stone wall across the green with a gate in the middle. */
    const bank = (fx: number, fz: number): void => {
      box(fx + 1, fx + 4, GREEN + 1, GREEN + 2, fz + 13, fz + 14, stone.base);
      box(fx + 7, fx + 10, GREEN + 1, GREEN + 2, fz + 13, fz + 14, stone.base);
    };

    /** A mound: two grass terraces the ball has to be put up and over. */
    const mound = (fx: number, fz: number): void => {
      box(fx + 2, fx + 9, GREEN + 1, GREEN + 1, fz + 10, fz + 19, grass.base);
      box(fx + 3, fx + 8, GREEN + 2, GREEN + 2, fz + 11, fz + 18, grass.light);
    };

    /**
     * A pond, cut with `poolWater` and crossed by a plank.
     *
     * The part the swimming pool asked for, at the smallest scale it has been
     * used at: one layer of water, which is a hazard rather than a pool, with
     * the coping it draws round its own edge doing the work a hand-drawn rim
     * would have got slightly wrong twice. The colour is declared as this
     * model's water, so the two ponds swell and glint like the sea.
     */
    const pond = (fx: number, fz: number): void => {
      poolWater(b, { x: fx + 1, z: fz + 7, w: 7, d: 14, deck: GREEN, depth: 1, water });
      box(fx + 1, fx + 8, GREEN + 1, GREEN + 1, fz + 13, fz + 14, teak.base);
      for (const end of [fx + 1, fx + 8])
        box(end, end, GREEN + 2, GREEN + 2, fz + 13, fz + 14, teak.shade);
    };

    /**
     * The windmill on the third hole: a rendered tower with a tunnel through
     * its foot, a tiled hip over it and four sails on its front.
     *
     * It is drawn as a building rather than as a prop because it is the one
     * thing on the plot tall enough to be read as one — stucco with a stone
     * base course, an opening cut *into* the wall with a stone surround, and a
     * `hipRoof` in terracotta, which is the same four moves every building on
     * this resort is made of. That is what makes a fairground object belong
     * here: not a mini-golf palette, the resort's own.
     */
    const windmill = (fx: number, fz: number): void => {
      const x0 = fx + 2;
      const x1 = fx + 9;
      const z0 = fz + 9;
      const z1 = fz + 16;
      const base = GREEN + 1;
      const top = base + 17;

      box(x0, x1, base, top, z0, z1, stucco.base);
      box(x0, x1, base, base + 1, z0, z1, stone.base);
      box(x0, x1, top, top, z0, z1, stucco.light);
      for (const face of [x0, x1]) box(face, face, base + 9, base + 11, z0 + 2, z0 + 5, glass.base);

      // The tunnel the ball is putted through, carved out of the wall rather
      // than left as a gap between two piers, and framed in stone at both ends.
      const lo = fx + 4;
      const hi = fx + 7;
      for (let x = lo; x <= hi; x++) {
        for (let y = base; y <= base + 3; y++) {
          for (let z = z0; z <= z1; z++) b.del(x, y, z);
        }
      }
      for (const face of [z0, z1]) {
        box(lo - 1, hi + 1, base + 4, base + 4, face, face, stone.light);
        box(lo - 1, lo - 1, base, base + 4, face, face, stone.light);
        box(hi + 1, hi + 1, base, base + 4, face, face, stone.light);
      }

      hipRoof(b, { x: x0, z: z0, w: 8, d: 8, y: top + 1, overhang: 1 });

      /**
       * The sails, on the face the camera is on: a hub, four arms, and two
       * courses of canvas set off each arm on the same side of it.
       *
       * The canvas is what makes a cross read as a sail — offset the same way
       * round all four arms, so the wheel looks like it turns one way, which is
       * the one thing a voxel windmill can say about movement standing still.
       */
      const hx = fx + 5;
      const hy = base + 9;
      const hz = z1 + 1;
      box(hx - 1, hx + 1, hy - 1, hy + 1, hz, hz, teak.shade);
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ] as const) {
        for (let arm = 1; arm <= 6; arm++) {
          set(hx + dx * arm, hy + dy * arm, hz, teak.shade);
          if (arm === 1) continue;
          for (const vane of [1, 2])
            set(hx + dx * arm - dy * vane, hy + dy * arm + dx * vane, hz, stucco.light);
        }
      }
    };

    const OBSTACLES: Record<Obstacle, (fx: number, fz: number) => void> = {
      hedge: dogleg,
      bank,
      mound,
      pond,
      windmill,
    };

    HOLES.forEach((hole, index) => {
      fairway(hole.x, hole.z);
      const near = hole.tee === 'north' ? hole.z + 2 : hole.z + FAIR_D - 5;
      const far = hole.tee === 'north' ? hole.z + FAIR_D - 4 : hole.z + 3;
      tee(hole.x + 4, near);
      OBSTACLES[hole.obstacle](hole.x, hole.z);
      cup(hole.x + 5, far, index % 2 === 0 ? PALETTE.bloom.base : PALETTE.amber.base);
    });

    /**
     * The boundary hedge: 50 cm of clipped foliage on the verge, 75 cm tall,
     * broken at each of the four gates with a pot either side of the opening.
     *
     * Low on purpose. A course is all foreground — it is looked *into* rather
     * than at — so the hedge is there to say where the plot ends, and a hedge
     * tall enough to hide a green would take the model's whole subject away.
     * Planting at the entrance is the one high-frequency detail the lane
     * allows, and this is where the eye comes in.
     */
    const stop = GATE.lo - 3;
    const start = GATE.hi + 3;
    for (const z of [LAWN.z0 + 1, LAWN.z1 - 2]) {
      clipped(LAWN.x0 + 1, stop, z, z + 1);
      clipped(start, LAWN.x1 - 1, z, z + 1);
    }
    for (const x of [LAWN.x0 + 1, LAWN.x1 - 2]) {
      clipped(x, x + 1, LAWN.z0 + 1, stop);
      clipped(x, x + 1, start, LAWN.z1 - 1);
    }
    for (const z of [LAWN.z0 + 1, LAWN.z1 - 2]) {
      for (const x of [stop + 1, start - 2]) pottedPlant(b, { x, z, y: GREEN });
    }
    for (const x of [LAWN.x0 + 1, LAWN.x1 - 2]) {
      for (const z of [stop + 1, start - 2]) pottedPlant(b, { x, z, y: GREEN });
    }

    // The bollards: a stubby post, a burning head and a dark cap over it.
    for (const [x, z] of BOLLARDS) {
      box(x, x, GREEN + 1, GREEN + 3, z, z, metal.deep);
      set(x, GREEN + 4, z, LANTERN);
      set(x, GREEN + 5, z, metal.deep);
    }
  },
});
