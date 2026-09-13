/**
 * Spa pavilion: an open treatment pavilion on a stone plinth — four teak posts
 * under a low hipped tile roof, linen drapes closed across the two back sides,
 * two daybeds under it and four lanterns hung off the plate for the evening.
 * 48x32x25 (12 x 8 m, 6.25 m to the ridge), a 3x2 tile. The open front faces +z.
 *
 * Massing from the `spa` prompt in `docs/references/README.md` — the low pitched
 * roof, the draped linen and the potted palms at the corners — which is one of
 * the two prompts no render came back for, so the colour is `villa.jpg`'s like
 * everything else in the lane. See `docs/art-direction.md`.
 *
 * **The pass is mostly what came off it.** The model it replaces drew its deck
 * in stripes of two browns at `z % 2`, its curtains in two linens at `x % 2`
 * over a 32 x 9 pane on one side and a 14 x 9 pane on the other, and its four
 * corner palms as some 25 loose voxels of frond each — a dithered plane, a
 * second dithered plane, and the shape this grid is worst at, all on one model.
 * None of the three is a thing the greedy mesher can merge, and together they
 * were most of its 807 quads.
 *
 * What replaced them is flat, and three of the parts were already written: a
 * `plinth` in stone is a slab with a darker lip, which is the platform;
 * `hipRoof` lays the courses this drew by hand and overhangs them, which is the
 * line of shadow the old roof had nothing of; and `steps` cuts the way up into
 * the front of the plinth. The drapes are flat panels with a fold down each
 * leading edge and a gap between them, because what reads as cloth is the gaps
 * and the folds rather than a weave nobody can make out from 30 degrees up, and
 * the corner palms keep their crowns to **one flat layer** each.
 *
 * It comes out at 543 quads against 807, with a roof that overhangs, a flight up
 * the front, a trolley between the couches and four lanterns it did not have.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const W = 48;
const D = 32;
const X = W - 1;
const Z = D - 1;

/** The plinth's own surface: what `plinth` hands back for a 3-layer slab. */
const FLOOR = 3;

/** The post frame: 2x2 posts inset from the plinth, and what the roof covers. */
const FRAME = { x: 5, z: 5, w: 38, d: 22 } as const;

/** Top of the posts, a storey above the floor, with the plate on top of it. */
const HEAD = FLOOR + 12;
const PLATE = HEAD + 1;

/** The rows the two treatment beds stand in, each 5 voxels across. */
const DAYBEDS = [11, 20] as const;

/**
 * The one colour that burns after dark.
 *
 * `amber.light`, the same lantern the bars hang under their eaves and the
 * taverna hangs off its piers — one fitting, one colour, right across the
 * catalogue. Nothing else on this model is amber, so nothing else reads as lit.
 */
const LANTERN = PALETTE.amber.light;

/** The columns the four lanterns hang in: one over each end of each daybed. */
const LANTERNS = [
  [17, DAYBEDS[0] + 2],
  [30, DAYBEDS[0] + 2],
  [17, DAYBEDS[1] + 2],
  [30, DAYBEDS[1] + 2],
] as const;

export default defineModel({
  id: 'spa-pavilion',
  label: 'Spa Pavilion',
  category: 'leisure',
  tiles: { x: 3, z: 2 },
  emissive: [LANTERN],
  /**
   * One guest on each treatment bed, lying with their head on the bolster.
   *
   * A bed's linen top is laid in layer 6, so hips rest on 7; the bolster is at
   * the -x end, so the legs point +x and the head lands on it four voxels back
   * along the bed. The beds are 5 voxels across and the figure is 3, so it is
   * centred on `bz + 2`.
   */
  seats: DAYBEDS.map((bz) => ({ x: 20, y: 7, z: bz + 2, facing: 1, pose: 'lie' }) as const),
  /**
   * Four lanterns off the plate, one over each end of each daybed.
   *
   * Short-throw on purpose. The thing a spa wants lit after dark is the couch
   * somebody is lying on, which is directly under the fitting — the case
   * `docs/art-direction.md` says a point lamp is exactly right for — so these
   * are 60 at 36 voxels rather than the bars' 90 at 52. Four of them at that
   * reach bake into less volume than two of the long-throw kind, and the plot
   * stands six of this model.
   */
  lights: LANTERNS.map(
    ([x, z]) => ({ x, y: PLATE - 2, z, color: LANTERN, intensity: 60, distance: 36 }) as const,
  ),
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak, terracotta } = PALETTE;

    // The platform, and the way up onto it: two treads cut into the front edge
    // so the flight lands flush with the paving a path lays beside the plot.
    const floor = plinth(b, { x: 0, z: 0, w: W, d: D });
    if (floor !== FLOOR) throw new Error('The plinth moved under the daybeds');
    steps(b, { x: 18, z: D - 4, w: 12, y: FLOOR - 1, treads: 2, descends: 'z+' });

    // The deck inside the frame, one flat course of boards a shade off the
    // plinth it is laid over, so the pavilion's floor reads apart from the
    // terrace round it without a stripe anywhere in it.
    box(
      FRAME.x,
      FRAME.x + FRAME.w - 1,
      FLOOR - 1,
      FLOOR - 1,
      FRAME.z,
      FRAME.z + FRAME.d - 1,
      teak.base,
    );

    // Four 2x2 posts and the plate they carry, which is what the roof sits on.
    const posts = [
      [FRAME.x, FRAME.z],
      [FRAME.x, FRAME.z + FRAME.d - 2],
      [FRAME.x + FRAME.w - 2, FRAME.z],
      [FRAME.x + FRAME.w - 2, FRAME.z + FRAME.d - 2],
    ] as const;
    for (const [x, z] of posts) box(x, x + 1, FLOOR, HEAD, z, z + 1, teak.shade);
    box(FRAME.x, FRAME.x + FRAME.w - 1, PLATE, PLATE, FRAME.z, FRAME.z + 1, teak.deep);
    box(
      FRAME.x,
      FRAME.x + FRAME.w - 1,
      PLATE,
      PLATE,
      FRAME.z + FRAME.d - 2,
      FRAME.z + FRAME.d - 1,
      teak.deep,
    );
    box(FRAME.x, FRAME.x + 1, PLATE, PLATE, FRAME.z, FRAME.z + FRAME.d - 1, teak.deep);
    box(
      FRAME.x + FRAME.w - 2,
      FRAME.x + FRAME.w - 1,
      PLATE,
      PLATE,
      FRAME.z,
      FRAME.z + FRAME.d - 1,
      teak.deep,
    );

    // A low hipped roof over the frame, overhanging it by two voxels a side.
    hipRoof(b, { ...FRAME, y: PLATE + 1, overhang: 2, tile: terracotta });

    /**
     * One panel of linen, hung the full drop from the plate to just clear of
     * the deck.
     *
     * A flat pane with its two leading edges a tone down, which is three
     * rectangles a face rather than the thirty-two a column-by-column weave
     * came out as — and it is the folds and the gaps between panels that read
     * as cloth anyway. `across` is the fixed coordinate of the wall it hangs
     * on; `along` runs with it.
     */
    const drape = (wall: 'x' | 'z', across: number, along: number, width: number): void => {
      for (let step = 0; step < width; step++) {
        const fold = step === 0 || step === width - 1;
        const x = wall === 'x' ? across : along + step;
        const z = wall === 'z' ? across : along + step;
        box(x, x, FLOOR + 1, HEAD, z, z, fold ? stucco.base : stucco.light);
      }
    };

    // Drapes closed across the two back sides, in panels of six with a gap of
    // two between them; the +x and +z sides are left open, which is the front.
    for (let x = FRAME.x + 2; x + 5 <= FRAME.x + FRAME.w - 3; x += 8) drape('z', FRAME.z + 1, x, 6);
    for (let z = FRAME.z + 2; z + 5 <= FRAME.z + FRAME.d - 3; z += 8) drape('x', FRAME.x + 1, z, 6);

    // Two treatment daybeds under the roof, heads towards the drapes.
    for (const bz of DAYBEDS) {
      box(14, 33, FLOOR, 5, bz, bz + 4, teak.deep); // frame, standing on the deck
      box(14, 33, 6, 6, bz, bz + 4, stucco.light); // linen top
      box(14, 17, 7, 7, bz + 1, bz + 3, stucco.base); // bolster
    }

    // The trolley between the two couches: folded linen on a teak stand, which
    // is what a treatment room has between its beds and what stops the middle
    // of the deck reading as a gap the model forgot to fill.
    box(20, 27, FLOOR, 5, 16, 19, teak.shade);
    box(21, 26, 6, 6, 16, 19, stucco.light);

    // The lanterns themselves: a bracket down off the plate with a lit head on
    // the end of it, in the columns `lights` declares.
    for (const [x, z] of LANTERNS) {
      box(x, x, PLATE - 1, PLATE - 1, z, z, teak.deep);
      set(x, PLATE - 2, z, LANTERN);
    }

    /**
     * A potted palm on the corner of the platform: a 3x3 pot, a trunk, and a
     * crown drawn as **one flat layer** in the shape of a cross.
     *
     * `pottedPlant` is the part for a pot on a terrace and it is used below for
     * the two by the steps, but it is a shrub — five layers, no trunk — and the
     * reference asks for palms at these four corners. What matters is that the
     * crown stays a plane: the model this replaces spelled each frond out as
     * loose single voxels, which is six quads apiece and the shape this grid is
     * worst at, and a flat cross reads as a palm from 30 degrees up for a
     * handful of rectangles.
     */
    const palm = (x: number, z: number): void => {
      box(x, x + 2, FLOOR, FLOOR + 1, z, z + 2, terracotta.shade);
      box(x, x + 2, FLOOR + 2, FLOOR + 2, z, z + 2, terracotta.base);
      box(x + 1, x + 1, FLOOR + 3, FLOOR + 9, z + 1, z + 1, teak.shade);
      const crown = FLOOR + 10;
      box(x, x + 2, crown, crown, z, z + 2, foliage.base);
      box(x - 1, x + 3, crown, crown, z + 1, z + 1, foliage.base);
      box(x + 1, x + 1, crown, crown, z - 1, z + 3, foliage.base);
      set(x + 1, crown + 1, z + 1, foliage.light);
    };

    // Palms at the four corners of the platform, which is the one piece of
    // high-frequency detail the lane allows and where the reference puts it.
    for (const [x, z] of [
      [1, 1],
      [1, Z - 3],
      [X - 3, 1],
      [X - 3, Z - 3],
    ] as const) {
      palm(x, z);
    }

    // A pot either side of the steps, so the way in is dressed the way every
    // other entrance in the catalogue is.
    for (const x of [15, 31]) pottedPlant(b, { x, z: Z - 2, y: FLOOR, size: 2, leaf: foliage });

    // The skirting the plinth's lip does not cover: a stone course round the
    // foot of each post, so the posts read as set into the floor.
    for (const [x, z] of posts) box(x - 1, x + 2, FLOOR - 1, FLOOR - 1, z - 1, z + 2, stone.shade);
  },
});
