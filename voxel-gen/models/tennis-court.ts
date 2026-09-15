/**
 * Tennis court: one flat clay court with its lines on it, inside a clipped hedge,
 * with a gate on every side, benches down both flanks and four floodlight masts
 * over it. 144x80x29 (36 x 20 m, 7.25 m to the lamps), a 9x5 tile.
 *
 * Massing from `docs/references/tennis-court.jpg`, which is one of the three
 * renders in the matte Mediterranean lane the whole resort is held to — so this
 * is the rare model whose reference is the lane itself rather than something to
 * be read for shape and ignored for colour. See `docs/art-direction.md`.
 *
 * **The court was the tiled floor, and the tiled floor was the model.** Its
 * playing surface was painted `(x + z) % 2 === 0 ? clay : clayDark` over 95x45
 * cells — 4 275 of them, each its own quad, because the mesher merges coplanar
 * faces of *one* colour and a checkerboard has no two neighbours that agree.
 * That one plane was **8 550 of the model's 10 316 triangles, five sixths of the
 * whole thing**, the largest share of a model any single surface in this
 * catalogue has taken, the resort bar's two-thirds included. It is also the
 * mini-golf lesson in a second sport: where a model *is* a ground, the ground is
 * the entire triangle budget and there is no wall elsewhere to pay for a pattern
 * on it.
 *
 * Laid flat in one tone of `terracotta`, the court is a handful of rectangles cut
 * up only by its own markings, which are what a tennis court is and not a dither:
 * a line 96 voxels long is one rectangle. The same fault was on the net, woven
 * `(z + y) % 2` over 52 columns, and that is now a panel.
 *
 * What the difference bought is everything that was asked of this pass. The
 * chain-link fence is gone, and a clipped hedge stands where it did — drawn in
 * the two tones of `foliage` the `hedge` model itself uses, so the boundary of a
 * court and a hedge run along a path are the same plant, and only 1.25 m tall,
 * because a court is all foreground and is looked *into*. A gate breaks it on
 * every side, the two on the long flanks built up with stone piers, lanterns and
 * planting; all four are a flight of three treads down to the paving, so the
 * layout's spur can arrive on whichever side is nearest a street. Four benches
 * stand on the verge inside the hedge and declare twelve {@link ModelSeat}s
 * between them, which is the first time anybody in the resort has sat down to
 * watch something. And the floodlights are floodlights: a planted mast, a gantry
 * cantilevered out over the court, and three lamp faces hanging under a cowl,
 * rather than the glowing band and lid they were.
 *
 * Everything but the masts and the two gate piers stands under 1.5 m, which is
 * the one rule the model is drawn to: the court is the subject, and anything tall
 * standing between the camera and it is a thing the court loses.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 143;
const NZ = 79;

/**
 * The layer every surface of the plot is painted at, and the first free layer
 * above it.
 *
 * `plinth` lays three courses and hands back layer 3, which is where the turf
 * and the clay go; everything that stands on the court stands on layer 4. One
 * metre of ground in all, the height the rest of the catalogue stands on.
 */
const TURF = 3;
const ON_TURF = TURF + 1;

/** The turf, inset two voxels so the plinth's own top shows as a paved kerb. */
const VERGE = { x0: 2, x1: 141, z0: 2, z1: 77 } as const;

/**
 * The clay, which is the court and its run-off: 112 x 60 voxels, 28 x 15 m,
 * centred on the plot.
 */
const CLAY = { x0: 16, x1: 127, z0: 10, z1: 69 } as const;

/**
 * The markings, at the real dimensions: a 24 x 11 m doubles court, singles
 * sidelines 1.37 m inside it, service lines 6.4 m either side of the net.
 *
 * All four numbers are centred on the plot rather than measured off one corner,
 * which is why the court is an even 96 by 44 rather than the 95 a tape measure
 * gives: an odd span cannot be centred on a 144-voxel plot, and a court half a
 * voxel off centre shows against the hedge behind it.
 */
const COURT = { x0: 24, x1: 119, z0: 18, z1: 61 } as const;
const SINGLES = 5;
const SERVICE = { x0: 45, x1: 98 } as const;

/** The net: a panel on the centre line, its posts 0.9 m outside the sidelines. */
const NET = { x: 71, z0: COURT.z0 - 4, z1: COURT.z1 + 4, top: ON_TURF + 3 } as const;

/**
 * The gate in each side of the hedge, as the span it is broken over.
 *
 * The long flanks are entered beside the net, which is where a real club's gate
 * is, and the short ends across the middle of the baselines.
 */
const GATE = { x0: 62, x1: 81, z0: 33, z1: 46 } as const;

/** The flight each gate steps down: three treads, 12 voxels wide. */
const FLIGHT = 12;

/**
 * The four floodlight masts, off each service line and out on the verge.
 *
 * Four is what lights a court evenly, and they are the tallest lamps on the plot
 * at 7.25 m — the only ones in the resort that light a surface rather than a
 * walkway.
 */
const MASTS: ReadonlyArray<readonly [number, number, 1 | -1]> = [
  [45, 7, 1],
  [98, 7, 1],
  [45, 72, -1],
  [98, 72, -1],
];

/** The four benches, as the row their backrest stands in and which way they face. */
const BENCHES: ReadonlyArray<readonly [number, number, 1 | -1]> = [
  [24, 5, 1],
  [106, 5, 1],
  [24, 74, -1],
  [106, 74, -1],
];

/** The plank a sitter's hips rest on, and the columns the three of them fill. */
const HIPS = ON_TURF + 2;
const SITTERS = [3, 7, 11] as const;

/**
 * The one colour that burns after dark: `amber.light`, the lantern the bars, the
 * taverna and the mini-golf bollards hang. A sports flood is a cooler white in
 * life, and `stucco.light` is the catalogue's white — but that is the colour of
 * the court's own markings, and a declared emissive is emissive *everywhere* in
 * a model, so a white flood would have set all twelve lines glowing. The resort
 * burns one colour after dark; this is it.
 */
const LANTERN = PALETTE.amber.light;

/** Where the lamp faces hang, which is the layer the light is measured from. */
const LAMPS = 26;

/**
 * How a mast's light is declared: two anchors, thrown out over the court.
 *
 * A floodlight is a *beam*, and the bake has only point lamps — so the honest
 * place for the point is not the lamp, it is where the lamp's beam lands. Each
 * mast therefore declares two anchors, `AIM` either side of its shaft to match
 * the three lamp faces spread along its gantry, and `THROW` in from the verge
 * so the pair sit over the court rather than over the hedge behind them. Eight
 * of them cover a 28 x 15 m surface evenly; the four that stood *at* the lamps
 * lit the ground under each mast at more than a street lamp's pool and left the
 * middle of the court at a third of one, which is a court with four bright
 * patches on it rather than a floodlit court.
 *
 * The numbers are read off `pointLightAttenuation`, the bake's own falloff,
 * measured over the clay against the pool a `street-lamp` throws on the paving
 * beneath it. This lights the court to **twice** that on average and never
 * below nine tenths of it — the brightest surface on the plot after dark, which
 * is what a floodlit court is and what the masts are there to say.
 */
const AIM = 14;
const THROW = 15;

export default defineModel({
  id: 'tennis-court',
  label: 'Tennis Court',
  category: 'leisure',
  tiles: { x: 9, z: 5 },
  emissive: [LANTERN],
  /**
   * Twelve spectators on four benches, all of them looking in at the court.
   *
   * They are drawn on the verge nearest the plot's edge on purpose. A seat with
   * no paving within a tile of it is never used, and the only paving a court
   * this size has is the spur the layout runs to its gate — so a bench in the
   * outermost tile row is a bench somebody walks to, and a bench courtside
   * halfway down the plot would have been scenery. See `docs/crowd.md`.
   */
  seats: BENCHES.flatMap(([x0, zBack, dir]) =>
    SITTERS.map((along) => ({
      x: x0 + along,
      y: HIPS,
      z: zBack + dir * 2,
      facing: dir === 1 ? (0 as const) : (2 as const),
    })),
  ),
  lights: [
    // The masts: two anchors each, out over the clay their beams fall on.
    ...MASTS.flatMap(([x, z, dir]) =>
      [x - AIM, x + AIM].map((along) => ({
        x: along,
        z: z + dir * THROW,
        y: LAMPS - 2,
        color: LANTERN,
        intensity: 120,
        distance: 100,
      })),
    ),
    // The gate lanterns: short-reaching, the way the mini-golf bollards are. A
    // gate lamp lights a gate; a gate lit by a flood is a car park.
    ...[
      [GATE.x0 + 1, 4],
      [GATE.x1 - 1, 4],
      [GATE.x0 + 1, 75],
      [GATE.x1 - 1, 75],
    ].map(([x, z]) => ({
      x: x!,
      z: z!,
      y: ON_TURF + 10,
      color: LANTERN,
      intensity: 40,
      distance: 30,
    })),
  ],
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ],
    capacity: 4,
    dwellSeconds: { min: 1800, max: 3600 },
    doors: [
      { x: (GATE.x0 + GATE.x1) / 2, z: 0, facing: 2 },
      { x: (GATE.x0 + GATE.x1) / 2, z: 79, facing: 0 },
      { x: 0, z: (GATE.z0 + GATE.z1) / 2, facing: 3 },
      { x: 143, z: (GATE.z0 + GATE.z1) / 2, facing: 1 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { foliage, grass, metal, stone, stucco, teak, terracotta } = PALETTE;

    // ── the ground ───────────────────────────────────────────────────────────

    plinth(b, { x: 0, z: 0, w: NX + 1, d: NZ + 1 });
    box(VERGE.x0, VERGE.x1, TURF, TURF, VERGE.z0, VERGE.z1, grass.base);

    /**
     * The court: one flat tone of clay, and nothing else.
     *
     * This single `box` is the whole pass. It replaces 4 275 hand-painted cells
     * of alternating terracotta that cost 8 550 triangles a placement, nine
     * times over, and from the 30 degrees the resort is seen at the two are
     * indistinguishable — a 25 cm checker is below the resolution of the frame
     * before it is below the resolution of the eye.
     */
    box(CLAY.x0, CLAY.x1, TURF, TURF, CLAY.z0, CLAY.z1, terracotta.base);

    // ── the markings ─────────────────────────────────────────────────────────

    const hLine = (z: number, from: number, to: number): void =>
      box(from, to, TURF, TURF, z, z, stucco.light);
    const vLine = (x: number, from: number, to: number): void =>
      box(x, x, TURF, TURF, from, to, stucco.light);

    hLine(COURT.z0, COURT.x0, COURT.x1);
    hLine(COURT.z1, COURT.x0, COURT.x1); // doubles sidelines
    hLine(COURT.z0 + SINGLES, COURT.x0, COURT.x1);
    hLine(COURT.z1 - SINGLES, COURT.x0, COURT.x1); // singles, tramlines between
    vLine(COURT.x0, COURT.z0, COURT.z1);
    vLine(COURT.x1, COURT.z0, COURT.z1); // baselines
    vLine(SERVICE.x0, COURT.z0 + SINGLES, COURT.z1 - SINGLES);
    vLine(SERVICE.x1, COURT.z0 + SINGLES, COURT.z1 - SINGLES);
    // The centre service line, and the centre mark on each baseline. Two voxels
    // rather than one, so both are symmetric about a court of even width.
    box(SERVICE.x0, SERVICE.x1, TURF, TURF, 39, 40, stucco.light);
    for (const x of [COURT.x0 + 1, COURT.x1 - 1]) box(x, x, TURF, TURF, 39, 40, stucco.light);

    /**
     * The net: one panel on the centre line with a tape along its top, between
     * two posts.
     *
     * The weave it replaces was `(z + y) % 2` down 52 columns — the dithering
     * fault at its smallest and most pointless, since a 25 cm mesh is not a mesh
     * at any distance this is seen from. A panel of `metal.shade` under a white
     * tape reads as a net from the only angle there is, in two rectangles.
     */
    for (const z of [NET.z0, NET.z1]) box(NET.x, NET.x + 1, ON_TURF, NET.top + 1, z, z, metal.base);
    box(NET.x, NET.x, ON_TURF, NET.top - 1, NET.z0, NET.z1, metal.shade);
    box(NET.x, NET.x, NET.top, NET.top, NET.z0, NET.z1, stucco.light);

    // ── the boundary ─────────────────────────────────────────────────────────

    /**
     * A run of clipped hedge, drawn exactly as the `hedge` model draws itself:
     * four courses of `foliage.shade` under one of `foliage.base`, so the crown
     * of new growth catches the eye from above and each flank still merges into
     * two rectangles. 1.25 m, the same height as a hedge beside a path.
     */
    const CROWN = ON_TURF + 4;
    const clipped = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, ON_TURF, CROWN - 1, z0, z1, foliage.shade);
      box(x0, x1, CROWN, CROWN, z0, z1, foliage.base);
    };

    // The four runs, each broken over its own gate.
    for (const z of [3, 75]) {
      clipped(3, GATE.x0 - 1, z, z + 1);
      clipped(GATE.x1 + 1, 140, z, z + 1);
    }
    for (const x of [3, 139]) {
      clipped(x, x + 1, 3, GATE.z0 - 1);
      clipped(x, x + 1, GATE.z1 + 1, 76);
    }

    // ── the gates ────────────────────────────────────────────────────────────

    /**
     * Each gate is a flight of three treads down to the paving outside.
     *
     * Three treads at one voxel of rise to two of going lands on layer 1, which
     * is the surface of a `path` tile — `PAVING_VOXELS` is two — so the court is
     * entered level with the walk rather than over a 1 m kerb. The going is why
     * the flights start six voxels inside the edge and not at it.
     */
    const walk = Math.floor((NX + 1 - FLIGHT) / 2);
    steps(b, { x: walk, z: 5, w: FLIGHT, y: TURF, treads: 3, descends: 'z-' });
    steps(b, { x: walk, z: NZ - 5, w: FLIGHT, y: TURF, treads: 3, descends: 'z+' });
    const across = Math.floor((NZ + 1 - FLIGHT) / 2);
    steps(b, { x: 5, z: across, w: FLIGHT, y: TURF, treads: 3, descends: 'x-' });
    steps(b, { x: NX - 5, z: across, w: FLIGHT, y: TURF, treads: 3, descends: 'x+' });

    // The threshold each gate opens onto: the verge paved from the top tread in
    // to the edge of the clay, so a gate is a way in rather than a step into grass.
    box(walk, walk + FLIGHT - 1, TURF, TURF, 5, CLAY.z0 - 1, stone.base);
    box(walk, walk + FLIGHT - 1, TURF, TURF, CLAY.z1 + 1, NZ - 5, stone.base);
    box(5, CLAY.x0 - 1, TURF, TURF, across, across + FLIGHT - 1, stone.base);
    box(CLAY.x1 + 1, NX - 5, TURF, TURF, across, across + FLIGHT - 1, stone.base);

    /**
     * The two built gates, on the long flanks: a stone pier either side of the
     * opening with a lantern on its cap, and a pot at its foot.
     *
     * Planting by the entrance is the one high-frequency detail the lane allows,
     * and the piers are the only thing besides the masts that stands above the
     * hedge — which is the whole reason they are *here*, on the two sides the
     * court is most likely to be walked up to, and not on all four.
     */
    const pier = (x0: number, z0: number): void => {
      const cap = ON_TURF + 8;
      box(x0, x0 + 2, ON_TURF, cap - 1, z0, z0 + 2, stone.base);
      box(x0 - 1, x0 + 3, cap, cap + 1, z0 - 1, z0 + 3, stone.light);
      set(x0 + 1, cap + 2, z0 + 1, LANTERN);
      set(x0 + 1, cap + 3, z0 + 1, metal.deep);
    };
    for (const z of [3, 74]) {
      pier(GATE.x0, z);
      pier(GATE.x1 - 2, z);
    }
    for (const z of [7, 71]) {
      pottedPlant(b, { x: GATE.x0 - 3, z, y: TURF });
      pottedPlant(b, { x: GATE.x1 + 1, z, y: TURF });
    }

    // ── the benches ──────────────────────────────────────────────────────────

    /**
     * A courtside bench, drawn the way the `bench` model is: legs under the two
     * ends only, the plank as one course rather than as slats — at 25 cm a slat
     * is a stripe and a stripe down fourteen voxels is fourteen quads — a back
     * of two rails under a lighter cap, and an arm at each end.
     */
    const courtBench = (x0: number, zBack: number, dir: 1 | -1): void => {
      const x1 = x0 + 13;
      const plank = HIPS - 1;
      const z0 = Math.min(zBack + dir, zBack + dir * 3);
      const z1 = Math.max(zBack + dir, zBack + dir * 3);
      for (const x of [x0 + 1, x1 - 1]) box(x, x + 1, ON_TURF, ON_TURF, z0, z1, teak.deep);
      box(x0, x1, plank, plank, z0, z1, teak.base);
      box(x0, x1, HIPS, HIPS + 1, zBack, zBack, teak.shade);
      box(x0, x1, HIPS + 2, HIPS + 2, zBack, zBack, teak.light);
      for (const x of [x0, x1]) box(x, x, HIPS, HIPS, z0, z1, teak.light);
    };
    for (const [x0, zBack, dir] of BENCHES) courtBench(x0, zBack, dir);

    // ── the floodlights ──────────────────────────────────────────────────────

    /**
     * A mast: a splayed foot, a slim shaft, and a gantry cantilevered two voxels
     * out over the court with three lamp faces hanging under its cowl.
     *
     * The lamps are a course below the cowl so their underside is exposed, which
     * is the face that burns — and the cowl above them is what stops a floodlight
     * reading as a glowing brick, which is what the band and lid it replaces did.
     */
    const mast = (mx: number, mz: number, dir: 1 | -1): void => {
      box(mx - 1, mx + 2, ON_TURF, ON_TURF + 1, mz - 1, mz + 2, metal.deep);
      box(mx, mx + 1, ON_TURF, LAMPS - 1, mz, mz + 1, metal.shade);
      const over = mz + dir * 2;
      box(
        mx - 4,
        mx + 5,
        LAMPS + 1,
        LAMPS + 2,
        Math.min(mz, over),
        Math.max(mz + 1, over + 1),
        metal.deep,
      );
      for (const lx of [mx - 3, mx, mx + 3]) box(lx, lx + 1, LAMPS, LAMPS, over, over + 1, LANTERN);
    };
    for (const [mx, mz, dir] of MASTS) mast(mx, mz, dir);
  },
});
