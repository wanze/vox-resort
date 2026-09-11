/**
 * Promenade bench: a timber seat for three under a back rail, with an arm at
 * either end, standing in the middle of a low stone slab.
 * 16x7x16 (4 m of seat, 1.5 m to the rail), a 1x1 tile. The seat faces +z.
 *
 * The first object in the catalogue drawn for the crowd rather than for the
 * camera: it declares three {@link ModelSeat}s, and what the people do with
 * them is `crowd/domain/crowd.ts`. Everything about the model follows from
 * that, so the numbers are worth writing down.
 *
 * **The slab is two layers, not the catalogue's three.** A bench is dressing on
 * the edge of a path — `resortLayout.ts` stands it there — and `PAVING_VOXELS`
 * is two, so a three-layer plinth would be a step up onto the bench from the
 * pavement beside it. Level with the paving, the seat top lands 50 cm above
 * what a person is walking on, which is what a bench is.
 *
 * **The arms are at the ends of the slab rather than the ends of the seat**, so
 * that three figures of three voxels each fit between them without one
 * straddling an arm. A seated figure is centred on the column its seat names,
 * and the three named here are 4 voxels apart: 1 m, which is a bench people are
 * sitting on rather than a bench people are squeezed onto.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole tile: a model fills the footprint it claims. */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2 } as const;

/** First free layer above the slab, where the bench itself starts. */
const GROUND = SLAB.height;

/** The layer the seat plank lies in, and the one a sitter's hips rest on. */
const PLANK = GROUND + 1;
const HIPS = PLANK + 1;

/**
 * The seat, across the slab: arms at the two ends, plank between them.
 *
 * Halfway down the tile rather than against its back edge, so the slab reads as
 * a paved patch with a bench on it from every side — and so the legs of the
 * three sitters, which fold forward to about the front of the plank, stay on
 * the model's own ground.
 */
const SEAT = { x: 1, x1: 14, z: 6, z1: 8 } as const;

/** The back rail, the row behind the plank. */
const BACK = SEAT.z - 1;

/**
 * The columns the three sitters fill.
 *
 * A figure is three voxels across and is centred on its column, so these are
 * 4 apart and the outer two stand clear of the arms at `SEAT.x` and `SEAT.x1`.
 */
const SITTERS = [4, 8, 12] as const;

export default defineModel({
  id: 'bench',
  label: 'Bench',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  /** Three people, all looking out over the front of the seat. */
  seats: SITTERS.map((x) => ({ x, y: HIPS, z: SEAT.z + 1, facing: 0 as const })),
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { teak } = PALETTE;

    plinth(b, SLAB);

    // Legs under the two ends of the plank, and nothing under the middle: the
    // span is a metre and a half and the underside is the one part of a bench
    // the camera never sees.
    for (const x of [SEAT.x + 1, SEAT.x1 - 1]) {
      box(x, x + 1, GROUND, GROUND, SEAT.z, SEAT.z1, teak.deep);
    }

    // The plank, laid as one course. Slats are what a bench is made of and
    // exactly what this grid cannot hold: at 25 cm a voxel a slat is a stripe,
    // and a stripe down fourteen voxels is fourteen quads where the mesher
    // merges a plane into one. See `docs/art-direction.md`.
    box(SEAT.x, SEAT.x1, PLANK, PLANK, SEAT.z, SEAT.z1, teak.base);

    // The back: two courses of rail with a lighter cap over them, which is what
    // gives the bench an outline from behind as well as a place to lean.
    box(SEAT.x, SEAT.x1, HIPS, HIPS + 1, BACK, BACK, teak.shade);
    box(SEAT.x, SEAT.x1, HIPS + 2, HIPS + 2, BACK, BACK, teak.light);

    // An arm at each end, level with the back's first course.
    for (const x of [SEAT.x, SEAT.x1]) box(x, x, HIPS, HIPS, SEAT.z, SEAT.z1, teak.light);

    // Nothing else on the slab, and both things that were tried there are worth
    // recording. A flower box behind the seat is a green line the back rail
    // hides completely from a camera looking down at 30 degrees; a pot at each
    // front corner stands six courses, which is taller than the bench, so the
    // tile came out as two towers with a seat between them. A bench is a bench.
  },
});
