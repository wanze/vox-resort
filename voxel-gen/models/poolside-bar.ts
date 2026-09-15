/**
 * Poolside bar: a thatched palapa on a stone terrace, with a servery under it,
 * a 5 m counter, four stools drawn up and a lantern either end of the run;
 * two parasol tables on the paving in front.
 * 32x32x24 (8 x 8 m plot, 3 m to the eaves and 6 m to the ridge pole), a
 * 2x2 tile. The counter faces +z.
 *
 * Massing and dressing from `docs/references/tiki-bar.jpg`, read for shape
 * rather than colour — it is the golden-hour lane, so the timber and the cream
 * come from `villa.jpg` as everything else in the resort does. See
 * `docs/art-direction.md`.
 *
 * This is `resort-bar` at two thirds of its width, drawn from the same parts in
 * the same tones, and that is the point of doing the two in one sitting: the
 * resort has one bar, in two sizes, rather than two ideas of what a bar is. The
 * one thing it does differently is the ground it stands on. A `plinth` in the
 * default stone rather than in teak, because this bar stands on the pool
 * terrace and `swimming-pool` pays its whole deck in stone — a timber deck
 * abutting a stone one is two terraces, where a timber hut on a stone one is a
 * bar on a terrace.
 *
 * The model it replaces was drawn before the palette and before the parts, and
 * its fault was the curve. Its counter was a crescent found with `Math.hypot`
 * and slatted `Math.floor(ang / (PI / 24)) % 2` in two browns around its own
 * arc, which is a dither laid on the one surface in the model that had no flat
 * plane to merge into in the first place. A curve on a 25 cm grid is a
 * staircase; a two-tone curve is a staircase no two treads of which are the
 * same colour. It also hung fifteen bulbs in mid-air off nothing, built its
 * roof and its base by hand where `thatchRoof` and `plinth` exist, and painted
 * twelve private colours nothing else in the catalogue used — a teal cushion,
 * two bamboos, two thatches, four drinks and a pair of near-identical yellows
 * for the one fitting.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 31;
const Z = 31;

/**
 * The terrace's own surface layer: what the plinth in `build` hands back, and
 * what the stools' seats are declared against. `build` checks the two agree.
 */
const FLOOR = 3;

/** The palapa: a servery wall at the back, the counter on its front two rows. */
const BAR = { x: 6, z: 4, w: 20, d: 10 } as const;

/**
 * The counter's back row, and how far the thatch stands out past the hut.
 *
 * The same ten rows deep and the same two voxels of eave as `resort-bar`, so
 * the two roofs are the same roof and the stools stand the same distance clear
 * of the same eave line.
 */
const COUNTER = BAR.z + BAR.d - 2;
const EAVE_OVERHANG = 2;

/** Where a stool stands at the counter, four across a 5 m run. */
const STOOLS = [8, 13, 18, 23] as const;

/**
 * Which column the one stool at a table stands in: the inner side of it, so
 * that a stool at the west table is east of its top and the other way round at
 * the east one. A stool on the outer side would stand off the edge of the
 * paving.
 */
const tableStool = (x: number): number => (x < X / 2 ? x + 4 : x - 5);

/**
 * The two tables out on the paving: the column each parasol's pole stands in.
 *
 * At the front corners for the reason `resort-bar` puts its there — a canopy
 * 2 m up on the centre of the terrace is a canopy over the counter from a
 * camera looking down at 30 degrees — and because the middle of the front is
 * the way in.
 */
const TABLES = [
  [5, 27],
  [26, 27],
] as const;

/** The one colour that burns after dark, and the lamp colour that goes with it. */
const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'poolside-bar',
  label: 'Poolside Bar',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  emissive: [LANTERN],
  /**
   * Six drinkers: four along the counter and one at each table.
   *
   * The counter's stools look back at it, which is -z. A table's single stool
   * stands on the inner side of the top and looks across it, so which way that
   * is follows {@link tableStool} rather than being written out twice.
   */
  seats: [
    ...STOOLS.map((x) => ({ x, y: FLOOR + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...TABLES.map(
      ([x, z]) =>
        ({
          x: tableStool(x),
          y: FLOOR + 3,
          z: z - 1,
          facing: tableStool(x) > x ? 3 : 1,
        }) as const,
    ),
  ],
  /**
   * One lamp under the eave, over the middle of the counter.
   *
   * One rather than `resort-bar`'s two: that counter is 10 m and this one is 5,
   * which one lamp at 2 m covers end to end. It is also the count this model
   * already declared, so the pass changes no anchor totals — six placements,
   * six lamps, before and after.
   */
  lights: [{ x: 15, y: 12, z: 14, color: LANTERN, intensity: 100, distance: 52 }],
  venue: {
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.2 },
    ],
    capacity: 12,
    dwellSeconds: { min: 600, max: 1800 },
    doors: [{ x: 15, z: COUNTER, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, stone, stucco, teak } = PALETTE;

    // The terrace: the pool deck's own stone, so a bar set against the pool
    // reads as standing on it rather than as a second plot beside it.
    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    if (floor !== FLOOR) throw new Error('The terrace and its stools must agree on its surface');
    const deck = floor - 1;

    // The palapa stands on its own boards, run out past the eave as far as the
    // stools: the one patch of timber on a stone terrace, which is what tells
    // the bar from the paving it is laid into.
    box(BAR.x - 2, BAR.x + BAR.w + 1, deck, deck, 1, COUNTER + 6, teak.light);

    // The servery: a low wall with a stone base course and a plate over it, a
    // shelf of bottles on its front, and the counter out in front of that.
    // Two metres of it, not a storey, so the hut is open under its eaves.
    const wall = floor + 8;
    box(BAR.x, BAR.x + BAR.w - 1, floor, wall, BAR.z, BAR.z + 1, stucco.base);
    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 1, BAR.z, BAR.z + 1, stone.base);
    box(BAR.x, BAR.x + BAR.w - 1, wall, wall, BAR.z, BAR.z + 1, stucco.light);
    box(BAR.x + 1, BAR.x + BAR.w - 2, floor + 4, floor + 4, BAR.z + 2, BAR.z + 2, teak.shade);

    // Six bottles, three colours, spaced — the beach club's shelf at this
    // shelf's length. The blenders, jars, straws and four cocktails the old
    // model stood along its counter are gone with them: at 25 cm a voxel a
    // cocktail is one coloured speck, and eleven of them in seven colours is
    // the noise `docs/art-direction.md` opens by saying this grid cannot hold.
    const BOTTLES = [foliage.base, amber.base, bloom.base] as const;
    for (let bottle = 0; bottle < 6; bottle++) {
      const x = BAR.x + 3 + bottle * 3;
      box(x, x, floor + 5, floor + 6, BAR.z + 2, BAR.z + 2, BOTTLES[bottle % BOTTLES.length]!);
    }

    // The counter: a teak body under a pale stone top, straight rather than
    // curved. What the crescent bought was a shape the grid cannot draw; what
    // it cost was every quad in the model that might have merged.
    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 3, COUNTER, COUNTER + 1, teak.shade);
    box(BAR.x, BAR.x + BAR.w - 1, floor + 4, floor + 4, COUNTER, COUNTER + 1, stone.light);

    /** A stool: two legs and a cushioned seat, the beach club's at the counter. */
    const stool = (x: number, z: number): void => {
      box(x, x + 1, floor, floor + 1, z, z + 1, teak.deep);
      box(x, x + 1, floor + 2, floor + 2, z, z + 1, amber.base);
    };
    for (const x of STOOLS) stool(x, COUNTER + 3);

    // Four posts under the corners of the thatch, and the roof over them.
    const eaves = floor + 12;
    for (const x of [BAR.x, BAR.x + BAR.w - 1]) {
      for (const z of [BAR.z, BAR.z + BAR.d - 1]) box(x, x, floor, eaves - 1, z, z, teak.base);
    }
    thatchRoof(b, { ...BAR, y: eaves, ridge: 'x', overhang: EAVE_OVERHANG });

    // A lantern at either end of the counter: a pane of two voxels with a teak
    // strap above it, hung against the thatch's lowest course. This is where
    // the fifteen bulbs the old model strung under its eaves went — they hung
    // off nothing, in a yellow four points from the one its lamp used, and one
    // fitting is one colour.
    for (const x of [BAR.x + 4, BAR.x + 15]) {
      box(x, x, eaves - 3, eaves - 2, COUNTER + 2, COUNTER + 2, LANTERN);
      box(x, x, eaves - 1, eaves - 1, COUNTER + 2, COUNTER + 2, teak.shade);
    }

    // A table on the paving: a teak pedestal under a stone top that stands a
    // voxel proud, with a parasol up through the middle of it and a stool at
    // its inner side. The one teak voxel showing in the stone is the pole
    // coming through, which is what a parasol table is.
    for (const [x, z] of TABLES) {
      box(x - 1, x + 1, floor, floor + 3, z - 1, z + 1, teak.shade);
      box(x - 2, x + 2, floor + 4, floor + 4, z - 2, z + 2, stone.light);
      parasol(b, { x, z, y: floor });
      stool(tableStool(x), z - 1);
    }

    // Planting, the one high-frequency detail the lane allows: a pot at each
    // end of the counter and at each front corner, and a green box down each
    // flank between them. One green rather than the box's usual three, because
    // a run of three alternating voxel by voxel is bunting.
    for (const x of [0, X - 1]) {
      pottedPlant(b, { x, z: COUNTER + 3, y: floor });
      pottedPlant(b, { x, z: Z - 1, y: floor });
    }
    for (const x of [0, X]) {
      flowerBox(b, { x, z: 19, y: floor, w: 10, along: 'z', blooms: [foliage.base] });
    }
  },
});
