/**
 * Beach bungalow: a timber hut on stilts under a deep hipped thatch, with a
 * boarded deck across the front and a flight down to the sand.
 * 48x32 (12x8 m plot, a 9x3.5 m hut and a 1.5 m deck, 8.5 m to the ridge
 * pole), a 3x2 tile. Deck faces +z.
 *
 * It was a 6x3 m hut on 2x2 tiles: eighteen square metres, which is a garden
 * shed. A beach bungalow is 30 m² and more, so the hut is half again as long and
 * a little deeper, with a lounger either side of the flight down.
 *
 * Wider rather than deeper, and not by taste: the generator stands bungalows in
 * a row along the shelf on top of the dune, and that shelf is a sidewalk with a
 * few rows of sand either side of it. A plot three tiles deep does not fit there,
 * and a bungalow that cannot stand on the dune is not a beach bungalow.
 *
 * Drawn from `docs/references/beach-bungalow.jpg`. The reference weaves its
 * walls and combs its thatch at a resolution this grid cannot reach, and the
 * previous pass tried anyway: checkerboarding both surfaces made a hut of 6 070
 * voxels cost 5 440 triangles, against the hotel's 246 147 voxels for 2 706,
 * because a dithered face defeats the mesher's merge completely. So the walls
 * and the roof are flat here, and the variation the reference gets from texture
 * comes from geometry instead: a sill course and a wall plate round the walls,
 * two courses of cut ends at the eaves, a pole over the ridge. See
 * `docs/art-direction.md`.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The hut itself. */
const HUT = { x: 6, z: 3, w: 36, d: 14 } as const;
const FRONT = HUT.z + HUT.d - 1;
const LEFT = HUT.x;
const RIGHT = HUT.x + HUT.w - 1;

/**
 * The deck, which the thatch is carried out over on two posts. The hut is drawn
 * wide and shallow on purpose: a hipped roof only has a ridge where the plan is
 * longer than it is wide, and on a square plan the pole the reference finishes
 * on would have nowhere to run.
 */
const DECK = { z: FRONT + 1, d: 6 } as const;
const BRINK = DECK.z + DECK.d - 1;

/** Layers of stilt between the sand and the deck. Three is 75 cm of clearance. */
const STILTS = 3;

export default defineModel({
  id: 'bungalow',
  label: 'Bungalow',
  category: 'lodging',
  tiles: { x: 3, z: 2 },
  windows: WINDOW_GLASS,
  // A lodging holds as many people as it has beds, and no more.
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
  },
  build: (b: VoxelBuilder) => {
    const sand = plinth(b, { x: 0, z: 0, w: 48, d: 32, height: 2, stone: PALETTE.sand });

    // Stilts under each corner of the hut, under the middle of its long sides,
    // and under the two deck posts.
    const floor = sand + STILTS;
    for (const x of [HUT.x, HUT.x + 17, RIGHT - 1]) {
      for (const z of [HUT.z, FRONT - 1, BRINK - 1]) {
        b.box(x, x + 1, sand, floor - 1, z, z + 1, PALETTE.teak.shade);
      }
    }

    // One boarded plane for the hut floor and the deck together, lipped along
    // the three edges that stand in the open.
    b.box(HUT.x, RIGHT, floor, floor, HUT.z, BRINK, PALETTE.teak.base);
    b.box(HUT.x, RIGHT, floor, floor, BRINK, BRINK, PALETTE.teak.shade);
    for (const x of [HUT.x, RIGHT]) {
      b.box(x, x, floor, floor, DECK.z, BRINK, PALETTE.teak.shade);
    }

    // The walls are timber, so they take the palette's teak rather than stucco,
    // and the part's quoins and cornice become corner posts and a wall plate.
    const plate = stuccoWall(b, {
      ...HUT,
      y: floor + 1,
      storeys: 1,
      wall: PALETTE.teak,
      trim: PALETTE.teak,
      skirting: 0,
    });
    // The thatch is drawn over the deck as well as the hut, because on this
    // reference the roof is the building: it comes out past the posts and the
    // hut sits under it rather than wearing it.
    thatchRoof(b, { ...HUT, d: HUT.d + DECK.d, y: plate });

    // A sill course right round the hut, which is the answer to the reference's
    // boarding: one horizontal plane costs two quads a face, where boards
    // painted voxel by voxel would cost one per board.
    const sill = floor + 4;
    b.box(HUT.x, RIGHT, sill, sill, HUT.z, FRONT, PALETTE.teak.light);

    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: HUT.x + 16,
      y: floor + 1,
      w: 4,
      h: 9,
      trim: PALETTE.teak,
    });
    for (const along of [HUT.x + 4, HUT.x + 10, RIGHT - 12, RIGHT - 6]) {
      shutteredWindow(b, {
        face: 'z+',
        at: FRONT,
        along,
        y: sill + 1,
        w: 3,
        trim: PALETTE.teak,
        shutters: false,
      });
    }
    for (const along of [HUT.z + 5]) {
      for (const face of ['x-', 'x+'] as const) {
        shutteredWindow(b, {
          face,
          at: face === 'x-' ? LEFT : RIGHT,
          along,
          y: sill + 1,
          w: 3,
          trim: PALETTE.teak,
          shutters: false,
        });
      }
    }
    for (const along of [HUT.x + 6, HUT.x + 16, RIGHT - 8]) {
      shutteredWindow(b, {
        face: 'z-',
        at: HUT.z,
        along,
        y: sill + 1,
        w: 3,
        trim: PALETTE.teak,
        shutters: false,
      });
    }

    // The deck: a rail either side of the way down, and the two posts that
    // carry the thatch out over it. The posts go on last so the rail stops
    // against them rather than painting over them.
    const rail = floor + 1;
    for (const x of [HUT.x, RIGHT - 14]) {
      balustrade(b, { x, z: BRINK, y: rail, w: 15, along: 'x', rail: PALETTE.teak });
    }
    for (const x of [HUT.x, RIGHT]) {
      balustrade(b, { x, z: DECK.z, y: rail, w: DECK.d, along: 'z', rail: PALETTE.teak });
      b.box(x, x, rail, plate - 1, BRINK, BRINK, PALETTE.teak.light);
    }

    steps(b, {
      x: HUT.x + 15,
      z: BRINK + 1,
      w: 6,
      y: floor,
      treads: 4,
      descends: 'z+',
      stone: PALETTE.teak,
    });

    // In front of the deck: two loungers on the sand either side of the way
    // down, a parasol by one of them, and a pot at the foot of the flight. The
    // loungers are drawn as the beach club's are, head to the hut.
    const { amber, stucco, teak } = PALETTE;
    const head = BRINK + 3;
    for (const x of [HUT.x + 3, RIGHT - 6]) {
      b.box(x, x + 3, sand, sand, head, head + 5, teak.shade);
      b.box(x, x + 3, sand + 1, sand + 1, head, head + 5, stucco.light);
      b.box(x, x + 3, sand + 2, sand + 2, head + 3, head + 3, amber.base);
      b.box(x, x + 3, sand + 2, sand + 3, head, head, stucco.light);
      b.box(x, x + 3, sand + 4, sand + 4, head, head, teak.base);
    }
    parasol(b, { x: HUT.x + 10, z: head + 3, y: sand });
    pottedPlant(b, { x: HUT.x + 22, z: head + 1, y: sand });
  },
});
