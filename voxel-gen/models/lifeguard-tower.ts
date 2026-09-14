/**
 * Lifeguard tower: four braced timber legs carrying a railed deck two metres up,
 * with a red-and-white back panel, a bench for the lifeguard and a parasol over
 * it. 16x19x16 (4 x 4.75 x 4 m), a 1x1 tile. The open side faces +z, which on a
 * generated plot is the water.
 *
 * The slab is the same two layers of `sand` every prop on the plot stands on,
 * and on a beach that is the whole point of it: sand on sand is invisible, so
 * the tower reads as standing on the beach rather than on a plinth dropped onto
 * it. It is also what fills the footprint the model claims — see `--audit`.
 *
 * **The legs are braced rather than splayed.** A real tower's legs lean in, and
 * a lean is a staircase on this grid: four legs stepping one voxel in per course
 * is sixteen rectangles apiece where a straight post is one. A ring of bracing
 * halfway up says the same thing about the structure for the cost of four more.
 *
 * **The shade is a parasol, and it stands beside the bench rather than over it.**
 * A pitched roof on a box this size is a doll's house, and the flat plane of
 * thatch this first carried swallowed the tower under it — an overhang wide
 * enough to read as a roof hid the deck, the bench and the red from every angle
 * the plot is ever seen at. A parasol is the part the catalogue already has for
 * exactly that: a pole through one flat square of canvas, six quads whatever its
 * reach.
 *
 * Beside rather than over, because those are the only two choices and the
 * geometry decides between them. A canopy directly above somebody hides them
 * from any camera looking down — the plot's isometric one sits at 30°, which is
 * about where the sun is, and shade is precisely the line to the sun being
 * blocked. Raising it does not help: a ray from the lifeguard's head has to
 * leave through the canopy's far edge whatever height it hangs at. So the
 * catalogue's own answer applies here too, the one `beach-umbrella.ts` records:
 * a parasol stands *beside* what it shades, or it is a lid. See
 * `parts/props.ts`.
 *
 * **The seat is the point of the tower**, and it is why the deck is two metres
 * up rather than three: a lifeguard sits high enough to see over the sunbathers
 * and no higher, and every course of tower above the bench is a course of
 * nothing. `seats.test.ts` holds the bench, the back panel and the parasol to
 * leaving a sitter room — the canopy clears their head by a course.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { parasol } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole tile: a model fills the footprint it claims. */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the legs stand. */
const GROUND = SLAB.height;

/** The deck: ten of the sixteen voxels across, so the legs stand inside the tile. */
const DECK = { x: 3, x1: 12, z: 3, z1: 12 } as const;

/** The columns the four legs stand in, two voxels square at each corner of the deck. */
const LEGS = [
  { x: DECK.x, z: DECK.z },
  { x: DECK.x1 - 1, z: DECK.z },
  { x: DECK.x, z: DECK.z1 - 1 },
  { x: DECK.x1 - 1, z: DECK.z1 - 1 },
] as const;

/** Layers of leg above the slab. Eight is two metres, which is what a tower is for. */
const LEG_HEIGHT = 8;

/** The layer the deck plank lies in. */
const DECK_TOP = GROUND + LEG_HEIGHT;

/**
 * The bench across the back of the deck, and the row a sitter's hips land on.
 *
 * Down the western half of it, which is what leaves the eastern half for the
 * parasol to stand in without its canopy coming over the lifeguard's head.
 */
const BENCH = { x: 4, x1: 9, z: 4, z1: 5 } as const;

/** The layer the bench plank lies in: two courses up, so the seat is 50 cm over the deck. */
const PLANK = DECK_TOP + 2;

/** The column the lifeguard fills. One seat, because one lifeguard. */
const SITTER = 6;

export default defineModel({
  id: 'lifeguard-tower',
  label: 'Lifeguard Tower',
  category: 'amenities',
  placement: { ground: 'shore' },
  tiles: { x: 1, z: 1 },
  /**
   * The lifeguard, looking out over the front of the deck at the water.
   *
   * Taken up only where the tower stands on sand: a beach seat is walked to by
   * whoever is already out there, and nowhere else on the plot is there paving
   * within a tile of a deck two metres up — so an inland tower carries a bench
   * nobody climbs to, which is a seat quietly dropped rather than an error. See
   * `crowd/domain/walkNetwork.ts`.
   */
  seats: [{ x: SITTER, y: PLANK + 1, z: BENCH.z1, facing: 0 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    const brace = GROUND + Math.floor(LEG_HEIGHT / 2);
    const rail = DECK_TOP + 3;

    // The legs, and a ring of bracing halfway up them.
    for (const leg of LEGS) {
      box(leg.x, leg.x + 1, GROUND, DECK_TOP - 1, leg.z, leg.z + 1, teak.base);
    }
    box(DECK.x, DECK.x1, brace, brace, DECK.z, DECK.z, teak.shade);
    box(DECK.x, DECK.x1, brace, brace, DECK.z1, DECK.z1, teak.shade);
    box(DECK.x, DECK.x, brace, brace, DECK.z, DECK.z1, teak.shade);
    box(DECK.x1, DECK.x1, brace, brace, DECK.z, DECK.z1, teak.shade);

    // A ladder up the open side, as rungs between the two seaward legs.
    for (let y = GROUND + 2; y < DECK_TOP; y += 3) {
      box(DECK.x + 3, DECK.x1 - 3, y, y, DECK.z1, DECK.z1, teak.light);
    }

    // The deck floor a shade down from the posts, so the two read apart.
    box(DECK.x, DECK.x1, DECK_TOP, DECK_TOP, DECK.z, DECK.z1, teak.shade);

    // The bench: a plank on two short supports, so the seat lands 50 cm over the
    // deck — somewhere to sit, rather than a board lying on the floor.
    for (const x of [BENCH.x, BENCH.x1]) {
      box(x, x, DECK_TOP + 1, DECK_TOP + 1, BENCH.z, BENCH.z1, teak.deep);
    }
    box(BENCH.x, BENCH.x1, PLANK, PLANK, BENCH.z, BENCH.z1, teak.light);

    // The back panel, which is the bench's backrest as well: a lifeguard station
    // is red with a white band across it, and two rectangles says so.
    box(DECK.x, DECK.x1, DECK_TOP + 1, rail + 1, DECK.z, DECK.z, bloom.base);
    box(DECK.x, DECK.x1, PLANK, PLANK, DECK.z, DECK.z, stucco.light);

    // The two flanks: red to the waist and a rail above it, so the station reads
    // as a station from the sides as well as from behind. The seaward side keeps
    // a single low rail, which is what leaves the deck open.
    for (const x of [DECK.x, DECK.x1]) {
      box(x, x, DECK_TOP + 1, DECK_TOP + 2, DECK.z, DECK.z1, bloom.base);
      box(x, x, rail, rail, DECK.z, DECK.z1, teak.light);
    }
    box(DECK.x, DECK.x1, DECK_TOP + 2, DECK_TOP + 2, DECK.z1, DECK.z1, teak.light);

    // The parasol, stood on the deck east of the bench. Two voxels of reach
    // rather than three or four: a canopy wider than the deck it stands on reads
    // as a roof slab sliding off the tower, and this one has only the eastern
    // half of a ten-voxel deck to sit over.
    parasol(b, {
      x: DECK.x1 - 1,
      z: 7,
      y: DECK_TOP + 1,
      height: 6,
      reach: 2,
      pole: teak,
      canvas: bloom,
    });
  },
});
