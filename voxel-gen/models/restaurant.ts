/**
 * Resort taverna: a whitewashed dining hall whose front is an arcade of five
 * round-headed bays, under one long terracotta gable, with a terrace of
 * parasol tables before it that steps down onto its apron.
 * 64x48x24 (16x12 m plot, a 14x5.5 m hall 3 m to the eaves and 6 m to the
 * ridge, before a 14x3.5 m terrace), a 4x3 tile. The terrace faces +z.
 *
 * Massing and dressing from `docs/references/taverna.jpg` — where the terrace
 * steps down, where the pots stand along its edge — and colour from
 * `villa.jpg`, because the taverna render is the golden-hour lane and its cream
 * carries a sun this renderer supplies for itself. See `docs/art-direction.md`.
 *
 * The model it replaces was drawn before the palette: eighteen private colours,
 * a deck checkerboarded voxel by voxel and four parasols built as stepped domes
 * of two alternating reds, which is the one pattern the mesher cannot merge. It
 * also had no walls at all — eight posts under a roof — so from three sides it
 * read as a carport.
 *
 * Two moves carry the reference across the gap, and both are parts the rest of
 * the resort already stands on. The front is an `arcade`, the same one the
 * villa and the game hall use, so the dining room is on show through the
 * arches rather than hidden behind a painted glass front. And the terrace is
 * edged with a `balustrade` and dropped a course onto its apron, which is what
 * stops a 16 m plot reading as one flat table.
 *
 * The dining room is genuinely hollow, the one cost the model chooses and the
 * same bet the game hall makes: an arcade you cannot see through is a row of
 * painted arches. Against that, the balustrades run at a wider pitch than the
 * villa's, because nine of these stand on the plot against the villa's two.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The building: a solid kitchen at the back, the dining room carved in front. */
const BODY = { x: 4, z: 3, w: 56, d: 22 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

/**
 * The open front. Two voxels deep, as the game hall's is and half what the
 * villa's veranda piers are: depth in an arcade you are meant to see through is
 * a tunnel, and every layer of reveal is a layer of the opening the soffit
 * hides from a camera looking down at it.
 */
const ARCADE = { z: 23, d: 2, bays: 5 } as const;

/** The room, carved out of the body: the kitchen is what is left behind it. */
const HALL = { x: 7, x1: 56, z: 12, z1: 22 } as const;

/**
 * The plinth's own surface layer: what `plinth` hands back in `build`, and what
 * the terrace chairs are declared against. `build` checks the two agree.
 */
const GROUND = 3;

/** The open terrace, from the eaves out to the brink. */
const TERRACE = { z: 27, d: 14 } as const;

/** The brink of the raised terrace, and the apron it steps down onto. */
const BRINK = TERRACE.z + TERRACE.d;
const APRON = { z: BRINK + 1, d: 6 } as const;

/** The flight down off the terrace, in front of the middle bay. */
const FLIGHT = { x: 28, w: 8 } as const;

/**
 * Where a table stands: the five lines the arches are sprung on, so that what
 * is behind an arch is a table rather than a pier's worth of empty floor. The
 * terrace takes the outer four and leaves the middle one clear, because that
 * is the way in — the flight lands on it and the centre arch looks down it.
 */
const COVERS = [9, 19, 30, 40, 51] as const;
const OUTDOORS = [COVERS[0], COVERS[1], COVERS[3], COVERS[4]] as const;

/**
 * The middle column of each of the six piers, which is where a lantern hangs.
 *
 * The arcade works its own bays out, so these are the answer read back off it:
 * five bays on piers of three, over a run of 56 from `BODY.x`.
 */
const PIERS = [5, 16, 26, 37, 47, 58] as const;

/**
 * The one colour that burns after dark, and the lamp colour that goes with it.
 *
 * Spent in one place only — a lantern on each pier, out over the terrace and
 * back into the room — because a colour reads as lit next to something that is
 * not, and a taverna with a glow on every surface is a taverna at noon. The
 * canvas of the parasols is `amber.base`, a step off it and unlit, so the two
 * do not become one warm smear at dusk.
 */
const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'restaurant',
  label: 'Restaurant',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [LANTERN],
  /**
   * Eight diners: a chair at either end of each of the four terrace tables.
   *
   * The terrace only, not the dining room. A chair indoors is two tiles from
   * any edge of the plot, so no paving is ever within reach of it and the
   * network would drop every one — see `crowd/domain/walkNetwork.ts`. The
   * terrace tables stand in the plot's own front row, which is where the spur
   * arrives.
   *
   * A chair's seat is laid in `GROUND + 1`, so hips rest on the layer above,
   * and each faces across the table it is drawn up to.
   */
  seats: OUTDOORS.flatMap(
    (x) =>
      [
        { x: x + 1, y: GROUND + 2, z: TERRACE.z + 6, facing: 0 },
        { x: x + 1, y: GROUND + 2, z: TERRACE.z + 11, facing: 2 },
      ] as const,
  ),
  windows: WINDOW_GLASS,
  /**
   * Two lamps: one in the middle of the dining room, one over the terrace.
   *
   * Both are needed because the model is two rooms, one of them roofed — a
   * single lamp in the hall leaves the terrace, which is half the plot and the
   * half people are on at night, as a dark shelf in front of a lit one.
   *
   * Declaring two on a building placed nine times used to be the expensive
   * choice. It is not any more: `lightGrid.ts` bakes every anchor into an
   * irradiance volume once at load, so there is no pool of real point lights
   * to compete for and night costs a frame what day costs. What eighteen more
   * anchors cost is bake time, which is measured in `pnpm bench`.
   */
  lights: [
    { x: 32, y: 10, z: 16, color: LANTERN, intensity: 90, distance: 50 },
    // Over the terrace, and two courses clear of the parasol canvas: a lamp at
    // the height of the canopies grazes their tops instead of pooling on the
    // paving under them. Neither of these sits in a lantern — they stand for
    // the row of them, the way the hotel's two stand for its balcony lamps.
    { x: 32, y: 13, z: 33, color: LANTERN, intensity: 90, distance: 56 },
  ],
  venue: {
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 1 },
      { need: 'thirst', amount: 0.5 },
    ],
    capacity: 40,
    dwellSeconds: { min: 1800, max: 3600 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak, terracotta } = PALETTE;

    // Two slabs rather than one: the terrace stands a course above the apron,
    // which is the reference's step down to the lane and the cheapest way a
    // 16 m plot gets a middle instead of being one flat table.
    const ground = plinth(b, { x: 0, z: 0, w: 64, d: BRINK + 1 });
    if (ground !== GROUND) throw new Error('The plinth and the chairs must agree on its surface');
    const apron = plinth(b, { x: 0, z: APRON.z, w: 64, d: APRON.d, height: 2 });

    // The terrace is paved a course darker than the plinth it is cut from, the
    // way the game hall's forecourt is: one flat colour, because the mesher
    // merges it into a single quad and a tile grid painted voxel by voxel is
    // exactly what the old model spent its triangles on.
    box(1, 62, ground - 1, ground - 1, TERRACE.z, BRINK, terracotta.shade);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    // The arcade repaints the front strip of the body and carves its bays
    // through it, and has to come out on the course the wall does, so that one
    // gable covers the two of them.
    const cornice = arcade(b, {
      x: BODY.x,
      z: ARCADE.z,
      w: BODY.w,
      d: ARCADE.d,
      y: ground,
      along: 'x',
      bays: ARCADE.bays,
      pier: 3,
      // Nine clear layers under a rise of two: the twelve a storey is, and a
      // 2.25 m opening. An arch that springs low enough to read as an arch on
      // the villa reads as a slot on a room you are meant to see into.
      height: 9,
      rise: 2,
    });
    if (cornice !== eaves) throw new Error('The arcade and the wall must reach the same eaves');
    // The strip it repaints takes the body's two front quoins with it.
    for (const x of [LEFT, RIGHT]) box(x, x, ground, eaves - 2, FRONT, FRONT, stucco.light);

    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    // The dining room, cleared up to the cornice, which stays as its ceiling.
    for (let x = HALL.x; x <= HALL.x1; x++) {
      for (let z = HALL.z; z <= HALL.z1; z++) {
        for (let y = ground; y <= eaves - 2; y++) b.del(x, y, z);
      }
    }
    // A hard floor laid over the plinth. Pale, because a dark floor is what
    // turns five arches into five cave mouths.
    box(HALL.x, HALL.x1, ground - 1, ground - 1, HALL.z, HALL.z1, stone.shade);

    // The counter along the kitchen wall, which is what the arches look at.
    box(12, 50, ground, ground + 2, HALL.z, HALL.z + 2, teak.shade);
    box(12, 50, ground + 3, ground + 3, HALL.z, HALL.z + 2, stone.light);

    // Windows all the way round. The kitchen takes shuttered ones on the
    // rhythm the lodging range uses; the dining room takes a long unshuttered
    // light down each flank, because a room this size behind a pair of cottage
    // windows reads as the back of the building.
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: BODY.z + 4, y: ground + 4 });
      shutteredWindow(b, {
        face,
        at,
        along: HALL.z + 1,
        y: ground + 3,
        w: 8,
        h: 7,
        shutters: false,
      });
    }
    for (const along of [10, 18, 43, 51]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 4 });
    }
    // The service door on the back, where the deliveries come in.
    doorway(b, { face: 'z-', at: BODY.z, along: 30, y: ground });
    steps(b, { x: 30, z: BODY.z - 1, w: 4, y: ground, treads: 1, descends: 'z-' });

    /**
     * A table: a pedestal, a top, and a chair drawn up at either end. Four
     * voxels square is the metre a round taverna table is, and two chairs are
     * the pair that can be seen — one on each of four sides would put sixteen
     * loose voxels under every table for the two nobody looks at.
     */
    const table = (x: number, z: number): void => {
      box(x + 1, x + 2, ground, ground + 2, z + 1, z + 2, teak.shade);
      box(x, x + 3, ground + 3, ground + 3, z, z + 3, teak.light);
      for (const seat of [z - 2, z + 4]) {
        box(x + 1, x + 2, ground, ground + 1, seat, seat + 1, teak.base);
      }
      for (const back of [z - 2, z + 5]) {
        box(x + 1, x + 2, ground + 2, ground + 3, back, back, teak.base);
      }
    };

    // Inside, one behind each arch, forward of the counter.
    for (const x of COVERS) table(x, HALL.z + 5);

    // The terrace: four tables out in the open, each under its own canvas, 2 m
    // over the paving. The parasol is the part this pass asked for and the
    // beach club's pass wrote — one flat plane, where the model this replaces
    // built each canopy as four stepped rings of two alternating reds.
    for (const x of OUTDOORS) {
      table(x, TERRACE.z + 7);
      parasol(b, { x: x + 1, z: TERRACE.z + 8, y: ground });
    }

    /**
     * A lantern: a pane of two voxels under a timber bracket, hung flat on a
     * pier face.
     *
     * The bracket is what keeps the pane from reading as a stray voxel of
     * paint, the way the pot's rim does for the greenery above it, and it is
     * `teak` rather than the `metal` a real fitting would be for the same
     * reason the pool's shower post is: a near-black speck on a cream pier is
     * a smut, and this one would be repeated ten times over.
     */
    const lantern = (x: number, y: number, z: number): void => {
      box(x, x, y, y + 1, z, z, LANTERN);
      b.set(x, y + 2, z, teak.shade);
    };

    // One on the front of every pier, over the terrace, and one on the back of
    // the four that stand inside the room, so the arches are lit from both
    // sides and the hall is not a black mouth behind a lit front.
    for (const x of PIERS) {
      lantern(x, ground + 6, FRONT + 1);
      if (x > HALL.x && x < HALL.x1) lantern(x, ground + 6, HALL.z1);
    }

    // The terrace is edged rather than left as a cliff, and stepped down onto
    // the apron on the centre line. Pitch three rather than the villa's two:
    // every baluster is four quads the mesher cannot merge into its neighbour,
    // and this building stands on the plot nine times.
    for (const x of [1, 62]) {
      balustrade(b, { x, z: TERRACE.z, y: ground, w: TERRACE.d + 1, along: 'z', pitch: 3 });
    }
    for (const [x, w] of [
      [1, FLIGHT.x - 1],
      [FLIGHT.x + FLIGHT.w, 62 - FLIGHT.x - FLIGHT.w],
    ] as const) {
      balustrade(b, { x, z: BRINK, y: ground, w, along: 'x', pitch: 3 });
    }
    steps(b, { ...FLIGHT, z: APRON.z, y: ground - 1, treads: 1, descends: 'z+' });

    // Planting, the one high-frequency detail the lane allows: pots at the
    // corners of the terrace and either side of the flight, where the reference
    // puts them and where the eye enters the plot, and boxes under the kitchen
    // windows and down the two side walks.
    for (const x of [2, 15, 48, 60]) pottedPlant(b, { x, z: BRINK - 3, y: ground });
    for (const x of [FLIGHT.x - 4, FLIGHT.x + FLIGHT.w + 1]) {
      pottedPlant(b, { x, z: APRON.z + 2, y: apron });
    }
    for (const x of [9, 37]) flowerBox(b, { x, z: BODY.z - 1, y: ground, w: 15, along: 'x' });
    for (const x of [2, 61]) {
      flowerBox(b, {
        x,
        z: BODY.z + 2,
        y: ground,
        w: 18,
        along: 'z',
        blooms: [foliage.base, foliage.light],
      });
    }
  },
});
