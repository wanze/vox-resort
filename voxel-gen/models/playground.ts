/**
 * Children's playground: a roofed play tower with a slide, a swing frame and a
 * run of monkey bars on one bed of rubber matting, with a shaded sandpit and a
 * row of benches beside it. 64x48 (16 x 12 m), a 4x3 tile.
 *
 * Massing from `docs/references/playground.jpg` — the tower with its pitched
 * roof, the red chute off one side of it, the swings on their own frame and the
 * dark matting the lot stands on, kerbed in timber. The reference is the matte
 * Mediterranean lane, and this pass takes it at its word: the roof over the
 * tower is `gableRoof` in the same terracotta the cottages are tiled in, and
 * the rail round its deck is `balustrade` in the same teak the decks are.
 * See `docs/art-direction.md`.
 *
 * The model it replaces painted its matting as a tile grid — three colours laid
 * `(⌊x/6⌋ + ⌊z/6⌋) % 3` over 60x44 cells — which is the tile grid the
 * dithering rule names, in blocks rather than voxel by voxel, so it merged into
 * about eighty rectangles where the bed wants one. It also painted in nine
 * colours of its own, none of them from the palette: a purple deck, a cyan mat,
 * a magenta frame. What the pass keeps of it is the plan — slide, swings,
 * climbing, sandpit, in that order across the plot — and nothing of the
 * drawing.
 *
 * Three of its four structures were open frames of single voxels, which is the
 * shape this grid is worst at. The slide was a chute of loose yellow bars
 * hanging in the air with nothing under them and nothing at the top; the
 * climbing frame was a wireframe cube of twelve edges, which reads as
 * scaffolding rather than as something to climb; the swings hung from a bar
 * carried on posts that stood clear of it. Everything here is built instead:
 * the tower has posts, a deck, a rail and a roof, the chute has a bed and two
 * side rails, and the swing beam sits on its uprights.
 *
 * It stands on the plot **eleven times**, level with `resort-bar` as the
 * most-placed thing in the catalogue, so what it is allowed to spend is set by
 * that: flat beds, boxed timber, and the one place a per-voxel run is worth its
 * quads is the rungs, which are what a climbing frame is.
 */
import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 63;
const Z = 47;

/** The layer everything on the plot stands on: the plinth's first free layer. */
const GROUND = 3;

/** The lawn, inset a voxel inside the plinth so its stone edge reads as a kerb. */
const LAWN = { x0: 1, x1: 62, z0: 1, z1: 46 } as const;

/**
 * The matting: one bed of rubber, kerbed in timber, with every piece of
 * equipment standing on it.
 *
 * One bed rather than four patches under four structures, which is what a
 * playground is: the matting is there because a child falls off things, so it
 * runs from the slide's runout to the foot of the monkey bars without a break.
 * It is also, being one rectangle of one colour, a single pair of triangles.
 */
const MAT = { x0: 5, x1: 58, z0: 5, z1: 30 } as const;

/** The sandpit, on the lawn south of the matting, under a parasol. */
const PIT = { x0: 5, x1: 24, z0: 33, z1: 42 } as const;

/** The tower: an 8x8 deck at 1.75 m on four posts, roofed and railed. */
const TOWER = { x: 7, z: 10, w: 8, d: 8 } as const;
const DECK = GROUND + 7;

/** The swing frame's two uprights, and the beam that spans between them. */
const SWING = { x0: 34, x1: 50, z0: 11, top: GROUND + 11 } as const;

/** Where a swing hangs off the beam; each is three voxels of seat. */
const SWINGS = [38, 42, 46] as const;

/** The monkey bars, and the rungs spaced along them. */
const BARS = { x0: 37, x1: 54, z0: 22, z1: 27, top: GROUND + 9 } as const;
const RUNGS = [41, 44, 47, 50] as const;

/** The gate through the hedge, on the side the benches and the planting are. */
const GATE = { lo: 29, hi: 34 } as const;

/**
 * Where a bench stands: the near corner of its plank, which is six voxels long
 * and seats two.
 *
 * One by the sandpit and three along the south rail, which is the side the gate
 * and the planting are on — see {@link GATE}.
 */
const BENCHES = [
  [51, 7],
  [28, 36],
  [38, 36],
  [48, 36],
] as const;

export default defineModel({
  id: 'playground',
  label: 'Playground',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  /**
   * Two grown-ups on every bench, watching.
   *
   * The plank is laid in `GROUND + 3`, so hips rest on the layer above it, and
   * the back rail is on the +z row, so everybody on one looks -z — across the
   * equipment on the three by the rail, and at the sandpit on the fourth. Six
   * voxels of plank take two figures of three, at `x + 1` and `x + 4`.
   */
  seats: BENCHES.flatMap(
    ([x, z]) =>
      [
        { x: x + 1, y: GROUND + 4, z, facing: 2 },
        { x: x + 4, y: GROUND + 4, z, facing: 2 },
      ] as const,
  ),
  venue: {
    // only the play tower has a roof, and nobody sits in it.
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.9 },
      { need: 'energy', amount: -0.3 },
    ],
    capacity: 12,
    dwellSeconds: { min: 900, max: 2400 },
    doors: [{ x: GATE.lo + 2, z: LAWN.z1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, metal, sand, teak } = PALETTE;

    /**
     * The plinth and the lawn over it, the same three layers and the same inset
     * the rest of the catalogue stands its plots on, so a playground between a
     * course and a tennis club sits at the height they do.
     */
    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    box(LAWN.x0, LAWN.x1, GROUND, GROUND, LAWN.z0, LAWN.z1, grass.base);

    /**
     * A bed with a timber kerb standing a voxel proud of it: the matting and
     * the sandpit are the same construction in two materials, which is what
     * they are on the ground too.
     */
    const bed = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      fill: number,
      kerb: number,
    ): void => {
      box(x0, x1, GROUND, GROUND, z0, z1, fill);
      box(x0, x1, GROUND + 1, GROUND + 1, z0, z0, kerb);
      box(x0, x1, GROUND + 1, GROUND + 1, z1, z1, kerb);
      box(x0, x0, GROUND + 1, GROUND + 1, z0, z1, kerb);
      box(x1, x1, GROUND + 1, GROUND + 1, z0, z1, kerb);
    };

    bed(MAT.x0, MAT.x1, MAT.z0, MAT.z1, PALETTE.terracotta.deep, teak.base);
    bed(PIT.x0, PIT.x1, PIT.z0, PIT.z1, sand.base, teak.base);

    /**
     * The tower: four posts, a boarded deck, a rail on the two sides nothing
     * leaves by, and a tiled gable over the lot.
     *
     * The roof is the move that puts this model on the same resort as the
     * cottages rather than in a catalogue of play equipment — same part, same
     * tile, same 26-degree pitch, at a fifth of the span. A hip rather than a
     * gable because the deck is square, which is the rule `roof.ts` states and
     * the reference's own cap is. It stands at 4.5 m, below every roof it will
     * ever be seen next to.
     */
    const east = TOWER.x + TOWER.w - 1;
    const south = TOWER.z + TOWER.d - 1;
    for (const x of [TOWER.x, east - 1]) {
      for (const z of [TOWER.z, south - 1])
        box(x, x + 1, GROUND + 1, DECK - 1, z, z + 1, teak.base);
    }
    box(TOWER.x, east, DECK, DECK, TOWER.z, south, teak.light);
    for (const z of [TOWER.z, south]) {
      balustrade(b, {
        x: TOWER.x,
        z,
        y: DECK + 1,
        w: TOWER.w,
        along: 'x',
        height: 3,
        pitch: 3,
        rail: teak,
      });
    }
    for (const x of [TOWER.x, east]) {
      for (const z of [TOWER.z, south]) box(x, x, DECK + 1, DECK + 5, z, z, teak.base);
    }
    hipRoof(b, { ...TOWER, y: DECK + 6, overhang: 2 });

    // The ladder up the west face: two rails and four rungs, which is the one
    // place in the model a run of single voxels is what the thing is.
    for (const z of [TOWER.z + 2, TOWER.z + 4])
      box(TOWER.x - 1, TOWER.x - 1, GROUND + 1, DECK, z, z, metal.base);
    for (let rung = GROUND + 2; rung <= DECK; rung += 2)
      box(TOWER.x - 1, TOWER.x - 1, rung, rung, TOWER.z + 2, TOWER.z + 4, metal.light);

    /**
     * The chute, falling east off the deck at one voxel of drop to two of run —
     * the same 1:2 the catalogue's every step and terrace is cut at, so a slide
     * and a flight of stairs agree about what a descent is.
     *
     * A bed four voxels wide with a rail standing a voxel proud either side of
     * it, and a flat runout at the bottom. The chute it replaces was six loose
     * two-voxel bars stepping down through empty air with no bed under them, no
     * rail beside them and nothing joining the top of it to the platform.
     */
    const chute = (from: number): void => {
      const bed0 = TOWER.z + 2;
      const bed1 = TOWER.z + 5;
      const fall = DECK - (GROUND + 1);
      for (let step = 0; step <= fall; step++) {
        const x = from + step;
        const y = DECK - step;
        box(x, x, GROUND + 1, y, bed0, bed1, bloom.shade);
        box(x, x, y, y, bed0, bed1, bloom.base);
        set(x, y + 1, bed0 - 1, bloom.base);
        set(x, y + 1, bed1 + 1, bloom.base);
      }
      box(from + fall + 1, from + fall + 3, GROUND + 1, GROUND + 1, bed0, bed1, bloom.base);
    };
    chute(east + 1);

    /**
     * The swing frame: two uprights on spread feet, a beam across them, and
     * three seats hung off it on chains.
     *
     * The feet are what an A-frame is for, and they are drawn as a plate rather
     * than as a splayed leg on purpose — a diagonal on a 25 cm grid is a
     * staircase, and `docs/art-direction.md` prices that at about what a
     * dithered plane costs. A boxed foot says the same thing about the frame
     * standing up on its own and merges into two rectangles.
     */
    const beam = SWING.z0;
    for (const x of [SWING.x0, SWING.x1 - 1]) {
      box(x, x + 1, GROUND + 1, SWING.top - 1, beam, beam + 1, metal.base);
      box(x, x + 1, GROUND + 1, GROUND + 1, beam - 3, beam + 4, metal.deep);
    }
    box(SWING.x0, SWING.x1, SWING.top, SWING.top + 1, beam, beam + 1, metal.base);
    for (const x of SWINGS) {
      for (const chain of [x, x + 2])
        box(chain, chain, GROUND + 5, SWING.top - 1, beam, beam, metal.light);
      box(x, x + 2, GROUND + 4, GROUND + 4, beam - 1, beam + 1, amber.base);
    }

    /**
     * The monkey bars: four posts, a beam down each side and rungs across.
     *
     * This is the wireframe cube redrawn as the thing the cube was trying to
     * be. A cube of twelve single-voxel edges has no top to hang from and no
     * side to climb, so it read as scaffolding; a pair of beams with rungs
     * between them and a ladder at one end reads as monkey bars from any angle,
     * for about the same voxels.
     */
    for (const x of [BARS.x0, BARS.x1 - 1]) {
      for (const z of [BARS.z0, BARS.z1 - 1])
        box(x, x + 1, GROUND + 1, BARS.top - 1, z, z, metal.base);
    }
    for (const z of [BARS.z0, BARS.z1 - 1])
      box(BARS.x0, BARS.x1, BARS.top, BARS.top, z, z, metal.base);
    for (const x of RUNGS) box(x, x, BARS.top, BARS.top, BARS.z0 + 1, BARS.z1 - 1, amber.base);
    for (let rung = GROUND + 3; rung < BARS.top; rung += 2)
      box(BARS.x0, BARS.x0 + 1, rung, rung, BARS.z0, BARS.z1 - 1, amber.base);

    /** A spring rider: a coil, a seat and a back, which is all one of them is. */
    const springer = (x: number, z: number, paint: Ramp): void => {
      box(x, x, GROUND + 1, GROUND + 3, z, z, metal.base);
      box(x - 1, x + 1, GROUND + 4, GROUND + 4, z - 1, z + 1, paint.base);
      box(x - 1, x + 1, GROUND + 5, GROUND + 6, z - 1, z - 1, paint.shade);
    };
    springer(11, 26, bloom);
    springer(19, 26, amber);
    springer(27, 26, bloom);

    /** A bench: two legs, a plank and a back, the teak the decks are boarded in. */
    const bench = (x: number, z: number): void => {
      for (const leg of [x, x + 5]) box(leg, leg, GROUND + 1, GROUND + 2, z, z + 1, teak.deep);
      box(x, x + 5, GROUND + 3, GROUND + 3, z, z + 1, teak.base);
      box(x, x + 5, GROUND + 4, GROUND + 5, z + 1, z + 1, teak.base);
    };
    for (const [x, z] of BENCHES) bench(x, z);

    // A parasol over the sandpit, which is the one thing on a plot of this kind
    // that has to be in the shade. The same canvas the terraces and the daybeds
    // are under, so the resort has one idea of what shade is.
    parasol(b, { x: (PIT.x0 + PIT.x1) >> 1, z: (PIT.z0 + PIT.z1) >> 1, y: GROUND, reach: 3 });

    /**
     * The hedge round the plot, broken at one gate with a pot either side.
     *
     * A playground is the one thing on the resort that genuinely wants an edge
     * — it is where the small children are — and 75 cm of clipped foliage is
     * the resort's own way of drawing one. It is the same hedge the mini-golf
     * course is bounded by, which is deliberate: the two stand side by side in
     * four of the plan's districts, and a park reads as a park when its plots
     * agree about where they end.
     */
    const clipped = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, GROUND + 1, GROUND + 3, z0, z1, foliage.base);
    clipped(LAWN.x0 + 1, LAWN.x1 - 1, LAWN.z0 + 1, LAWN.z0 + 2);
    clipped(LAWN.x0 + 1, GATE.lo - 1, LAWN.z1 - 2, LAWN.z1 - 1);
    clipped(GATE.hi + 1, LAWN.x1 - 1, LAWN.z1 - 2, LAWN.z1 - 1);
    clipped(LAWN.x0 + 1, LAWN.x0 + 2, LAWN.z0 + 1, LAWN.z1 - 1);
    clipped(LAWN.x1 - 2, LAWN.x1 - 1, LAWN.z0 + 1, LAWN.z1 - 1);

    // Planting, the one high-frequency detail the lane allows, at the gate the
    // children come in by and along the rail the benches back onto.
    for (const x of [GATE.lo - 3, GATE.hi + 1]) pottedPlant(b, { x, z: LAWN.z1 - 2, y: GROUND });
    for (const x of [28, 38, 48]) {
      flowerBox(b, { x, z: 32, y: GROUND, w: 6, along: 'x', blooms: [foliage.base] });
    }
    for (const z of [PIT.z0, PIT.z1 - 1]) pottedPlant(b, { x: PIT.x1 + 3, z, y: GROUND });
  },
});
