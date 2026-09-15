/**
 * Resort bar: a thatched hut across the back of a boarded deck, with a 10 m
 * counter along its front, seven stools drawn up to it, a shelf of bottles on
 * the servery behind and a row of lanterns under the eave; three parasol tables
 * out on the deck in front of it.
 * 48x32x24 (12 x 8 m deck, 3 m to the eaves and 6 m to the ridge pole), a 3x2
 * tile. The counter faces +z.
 *
 * Massing and dressing from `docs/references/tiki-bar.jpg` — the counter, the
 * stools drawn up to it, the shelf of bottles behind and the deep thatch over
 * the lot — with the colour taken from `villa.jpg` instead, because the tiki
 * render is the golden-hour lane and its timber carries a sun this renderer
 * supplies for itself. See `docs/art-direction.md`.
 *
 * This is the beach club's bar at the beach club's scale, and it is drawn from
 * the same parts in the same tones on purpose: the two are the same fitting on
 * the same resort, and a bar that agrees with itself across two models is most
 * of what the pass is for. What is different is the plot. The beach club's bar
 * stands on a 16 m deck with a lounge and a beach beside it; this one *is* the
 * plot, so the counter runs 10 m rather than 7 and the deck in front of it is
 * dressed with tables rather than left as the run-up to something else.
 *
 * The model it replaces had the dithering fault at the scale that matters
 * most. Its deck was checkerboarded `(x + z) % 2` across 44x28 cells — one
 * surface, 1 052 of its 1 567 quads, two thirds of the whole model — and its
 * bottle shelf laid 40 bottles `(x + y) % 3` down a single run. Both are flat
 * now: the deck is a `plinth` in teak, which is already a slab with a darker
 * lip round its top edge and therefore already a boarded deck with a skirt,
 * and the shelf is spaced bottles in three colours the way the beach club's
 * is. That is worth rather more here than on the last three passes, because
 * this model stands on the plot **eleven times** — more than anything else in
 * the catalogue.
 *
 * It also used no parts at all, and what it had instead of a roof was a light
 * rail: four posts to y20, five sixths of the model's height, carrying rails
 * across the front and both sides with 24 bulbs strung along them. The front
 * rail crossed directly over the counter and the stools from a camera looking
 * down at 30 degrees, which is exactly the frame the restaurant pass wrote,
 * tested and gave back — anything tall standing between the camera and what a
 * model is for is something the model loses. The light comes off the roof now,
 * from lanterns hung under the eave, which is where the beach club's are and
 * where the reference's are: over the counter, not in front of it.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 47;
const Z = 31;

/**
 * The deck's own surface layer: what the plinth in `build` hands back. Written
 * down because the stools' seats are declared against it and a declaration
 * cannot read a local, so `build` checks that the two still agree.
 */
const FLOOR = 3;

/** The hut: a servery wall at the back, the counter on its front two rows. */
const BAR = { x: 4, z: 2, w: 40, d: 10 } as const;

/**
 * The counter's back row, and how far the thatch stands out past the hut.
 *
 * The counter is drawn on the front two rows of the hut and the stools stand
 * clear of the eave rather than under it, which is what the reference does and
 * what a camera looking down at 30 degrees needs: everything inside the eave
 * line of a roof this deep is roof, not bar.
 */
const COUNTER = BAR.z + BAR.d - 2;
const EAVE_OVERHANG = 2;

/** Where a stool stands at the counter, seven across a 10 m run. */
const STOOLS = [6, 12, 18, 24, 30, 36, 42] as const;

/**
 * The two tables out on the deck: the column each parasol's pole stands in.
 *
 * At the front corners rather than in the middle, and that is a sight line
 * rather than a taste. A canopy 2 m up hides everything on the line back from
 * it at 30 degrees, so a parasol on the centre of this deck would be a parasol
 * over the counter — the pergola fault again, at a third of the height. Set at
 * `z` 27 the canopies clear the stools by a course and what they shade is the
 * deck, which is what they are for. It also leaves the middle of the front
 * open, which is the way in.
 */
const TABLES = [
  [7, 27],
  [23, 27],
  [40, 27],
] as const;

/**
 * The one colour that burns after dark, and the lamp colour that goes with it.
 *
 * `amber.light`, the same lantern the taverna hangs off its piers and the
 * beach club hangs under this same eave, rather than the two private yellows
 * the model it replaces used — one for the bulbs and a second, four points off
 * it, for the lamps. One fitting is one colour. Everything else amber here is
 * `amber.base`, a step off it and unlit, so the stool cushions and the canvas
 * do not read as lit alongside the thing that is.
 */
const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'resort-bar',
  label: 'Resort Bar',
  category: 'amenities',
  tiles: { x: 3, z: 2 },
  emissive: [LANTERN],
  /**
   * Thirteen drinkers: seven on stools along the counter, and one either side
   * of each of the three tables.
   *
   * A stool's cushion is `FLOOR + 2`, so hips rest a layer above it. The ones
   * at the counter look back at it, which is -z; the ones at a table look
   * across it, so the stool west of a table faces +x and the one east of it
   * -x. Both are the same two columns `build` stands the stools in, read off
   * the same constants, which is what keeps a sitter on a seat rather than
   * beside one.
   */
  seats: [
    ...STOOLS.map((x) => ({ x, y: FLOOR + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...TABLES.flatMap(
      ([x, z]) =>
        [
          { x: x - 5, y: FLOOR + 3, z: z - 1, facing: 1 },
          { x: x + 4, y: FLOOR + 3, z: z - 1, facing: 3 },
        ] as const,
    ),
  ],
  /**
   * Two lamps under the eave, a quarter of the way in from each end.
   *
   * Two rather than the beach club's one because that model's counter is 7 m
   * and this one's is 10, and one lamp on a 10 m front leaves both ends of the
   * run darker than the middle. They are not free — eleven placements is
   * eleven anchors a lamp, and the supermarket pass measured a lit sign and
   * its lamp at exactly nine calls and nine lamps over nine placements — but
   * they are already paid for: the baseline carries both, so holding at two
   * costs nothing and the saving is the eleven the second one would give back.
   * `lightGrid.ts` bakes every anchor into one irradiance volume at load, so
   * what they cost is bake time rather than frame time.
   */
  lights: [
    { x: 15, y: 12, z: 12, color: LANTERN, intensity: 90, distance: 52 },
    { x: 33, y: 12, z: 12, color: LANTERN, intensity: 90, distance: 52 },
  ],
  venue: {
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.3 },
    ],
    capacity: 24,
    dwellSeconds: { min: 900, max: 2400 },
    doors: [{ x: 23, z: COUNTER, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, stone, stucco, teak } = PALETTE;

    /**
     * The deck, and the whole of the ground this model has.
     *
     * A `plinth` in teak: a slab with a darker lip round its top edge, which is
     * a boarded deck with a skirt and nothing else needed. Three layers, the
     * 75 cm the rest of the catalogue stands its plots on, so a bar between two
     * buildings sits at the height they do. One flat colour — the deck it
     * replaces alternated two tones voxel by voxel over 1 232 cells, which is
     * the one pattern the mesher cannot merge, and it was two thirds of the
     * model on its own.
     */
    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, stone: teak });
    if (floor !== FLOOR) throw new Error('The deck and its stools must agree on its surface');
    const deck = floor - 1;

    // The hut stands on its own boards, a step of the ramp lighter than the
    // deck they are laid into and run out past the eave as far as the stools.
    // A bar reads as a bar because it has a floor of its own; one drawn on the
    // deck it stands on is a wall and some furniture.
    box(BAR.x - 2, BAR.x + BAR.w + 1, deck, deck, 1, COUNTER + 6, teak.light);

    /**
     * The servery: a low wall along the back with a stone base course and a
     * plate over it, a shelf of bottles on its front, and the counter out in
     * front of that.
     *
     * Cream rather than a third brown, which is what the model it replaces put
     * here: a 10 m by 3.25 m slab of `back` between a `counter` and a `shelf`
     * two and three points off it, so the back of the bar was one flat brown
     * face with nothing on it. Two metres of it, not a storey — the roof
     * stands four courses clear above the plate, so the hut is open under its
     * eaves the way the reference is.
     */
    const wall = floor + 8;
    box(BAR.x, BAR.x + BAR.w - 1, floor, wall, BAR.z, BAR.z + 1, stucco.base);
    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 1, BAR.z, BAR.z + 1, stone.base);
    box(BAR.x, BAR.x + BAR.w - 1, wall, wall, BAR.z, BAR.z + 1, stucco.light);
    box(BAR.x + 1, BAR.x + BAR.w - 2, floor + 4, floor + 4, BAR.z + 2, BAR.z + 2, teak.shade);

    // Bottles along the shelf, three colours, spaced — the beach club's shelf
    // at this shelf's length. Twelve loose voxels are twelve quads and nobody's
    // frame notices; the forty this replaces were laid shoulder to shoulder in
    // a repeating three, which is a run of forty quads where a flat course is
    // one, and is bunting rather than a bar.
    const BOTTLES = [foliage.base, amber.base, bloom.base] as const;
    for (let bottle = 0; bottle < 12; bottle++) {
      const x = BAR.x + 3 + bottle * 3;
      box(x, x, floor + 5, floor + 6, BAR.z + 2, BAR.z + 2, BOTTLES[bottle % BOTTLES.length]!);
    }

    // The counter, drawn the way the taverna's and the beach club's are — a
    // teak body under a pale stone top — so the resort has one idea of what a
    // bar to stand at is.
    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 3, COUNTER, COUNTER + 1, teak.shade);
    box(BAR.x, BAR.x + BAR.w - 1, floor + 4, floor + 4, COUNTER, COUNTER + 1, stone.light);

    /** A stool: two legs and a cushioned seat, the beach club's at the counter. */
    const stool = (x: number, z: number): void => {
      box(x, x + 1, floor, floor + 1, z, z + 1, teak.deep);
      box(x, x + 1, floor + 2, floor + 2, z, z + 1, amber.base);
    };
    for (const x of STOOLS) stool(x, COUNTER + 3);

    // Four posts under the corners of the thatch, and the roof over them. The
    // thatch is carried well out past the counter, which is what the reference
    // does and what keeps the stools in the shade of the hut rather than in
    // front of it.
    const eaves = floor + 12;
    for (const x of [BAR.x, BAR.x + BAR.w - 1]) {
      for (const z of [BAR.z, BAR.z + BAR.d - 1]) box(x, x, floor, eaves - 1, z, z, teak.base);
    }
    thatchRoof(b, { ...BAR, y: eaves, ridge: 'x', overhang: EAVE_OVERHANG });

    /**
     * A lantern hung under the eave: a pane of two voxels with a teak strap
     * above it, drawn against the thatch's lowest course so it reads as hanging
     * from the roof rather than as a stray voxel of paint in mid-air.
     *
     * Four of them, over the gap between the counter and the stools, which is
     * the one line of the plot that is under a roof and in front of a wall, so
     * the light has something to fall on from both sides. This is where the 24
     * bulbs strung round the old light rail went: the rail is gone and what
     * carried it was the fault, but a bar is still the thing on this resort
     * that is lit, so the lights come off the roof instead.
     */
    const lantern = (x: number): void => {
      box(x, x, eaves - 3, eaves - 2, COUNTER + 2, COUNTER + 2, LANTERN);
      box(x, x, eaves - 1, eaves - 1, COUNTER + 2, COUNTER + 2, teak.shade);
    };
    for (const x of [5, 15, 25, 35]) lantern(BAR.x + x);

    /**
     * A table on the deck: the counter's own section at a fifth of its length —
     * a teak pedestal under a stone top that stands a voxel proud all round —
     * with a parasol up through the middle of it and a stool either side.
     *
     * The pole is painted through the pedestal and the top, so the one teak
     * voxel that shows in the middle of the stone is the pole coming through,
     * which is what a parasol table is. The canopy is one flat plane 2 m up:
     * the part draws it, and the part exists because two models had built
     * theirs as stepped rings of alternating colour.
     */
    for (const [x, z] of TABLES) {
      box(x - 1, x + 1, floor, floor + 3, z - 1, z + 1, teak.shade);
      box(x - 2, x + 2, floor + 4, floor + 4, z - 2, z + 2, stone.light);
      parasol(b, { x, z, y: floor });
      for (const at of [x - 5, x + 4]) stool(at, z - 1);
    }

    // Planting, the one high-frequency detail the lane allows: a pot at each
    // end of the counter and at each front corner of the deck, which is where
    // the eye enters the plot, and a green box down each flank between them so
    // that a 12 m deck has an edge without being fenced. One green rather than
    // the box's usual three — a long run of three colours alternating voxel by
    // voxel is bunting, and it is also 24 quads where a flat course is one.
    for (const x of [0, X - 1]) {
      pottedPlant(b, { x, z: COUNTER + 3, y: floor });
      pottedPlant(b, { x, z: Z - 1, y: floor });
    }
    for (const x of [0, X]) {
      flowerBox(b, { x, z: 17, y: floor, w: 12, along: 'z', blooms: [foliage.base] });
    }
  },
});
