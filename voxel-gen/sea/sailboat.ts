/**
 * A sailing dinghy: the same open hull as the rowing boat with a mast stepped
 * forward, a boom over the cockpit and one bellied sail. 7 x 19 x 20 voxels,
 * a 5 m boat carrying 3.5 m of rig. Bow towards +z.
 *
 * **The sail has a belly, and that is the whole of why it is drawable.** A sail
 * is a plane, and a plane one voxel thick standing in a boat that turns is a
 * sail that vanishes to a line twice every circuit. Given a curve — two voxels
 * of draught at its middle, tapering to nothing at the mast and at the leech —
 * the same one-voxel surface is caught by the light from every heading, and it
 * is what a sail full of wind actually is. It costs the mesher nothing: the
 * curve is constant down each course, so every course is still one rectangle.
 *
 * **It sails on one tack.** The sail bellies to starboard and the boom lies with
 * it, so the boat reads as having the wind on one side rather than as a model
 * with a symmetrical fin. The bay's craft are all on the same tack, which is
 * what a bay under one breeze looks like — the same decision the balloons make
 * about the evening wind. See `features/sea/domain/flotilla.ts`.
 */

import { PALETTE } from '../palette.ts';
import { hull } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Voxels from transom to stem, and of beam either side of the keel. */
const LENGTH = 20;
const BEAM = 3;

/** Where the mast is stepped, as a station along the hull, and how tall it is. */
const STEP = 13;
const MAST = 16;

/**
 * Voxels the sail reaches aft of the mast at its foot, and voxels of draught in
 * the middle of each course.
 *
 * One voxel of belly, not two. Two put the canvas in three columns, and three
 * columns on a surface whose reach shrinks with every course is a staircase
 * rather than a curve — the sail came out as a flight of steps beside the mast.
 * One puts it in two, which is a curve on this grid and still enough that no
 * heading sees the sail edge on.
 */
const FOOT = 9;
const DRAUGHT = 1;

/**
 * How far up the mast the sail keeps its full reach, as a fraction.
 *
 * The sail is a trapezoid rather than a triangle, and that is a drawing decision
 * the grid forces rather than a liberty. A triangle loses a voxel of reach every
 * course, which at this size is a flight of nine single-voxel steps — the mesher
 * merges none of it and the eye reads a staircase. Held square to half its
 * height and taken off above that, the same sail is two rectangles and a short
 * taper, and it is also closer to the roached head a modern mainsail has.
 */
const SHOULDER = 0.5;

export default defineModel({
  id: 'sailboat',
  label: 'Sailing Dinghy',
  category: 'sea',
  tiles: { x: 1, z: 2 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    const rim = hull(b, { x: 0, z: 0, y: 0, length: LENGTH, beam: BEAM, timber: teak });

    // The thwart the helm sits on, and the tiller running aft from it.
    box(-BEAM, BEAM, rim - 1, rim - 1, 4, 5, teak.light);
    box(0, 0, rim, rim, 1, 3, teak.base);

    // The mast, and the boom lying off to starboard with the sail.
    const head = rim + MAST;
    box(0, 0, rim, head, STEP, STEP, teak.base);
    const boom = rim + 2;
    box(1, 1, boom, boom, STEP - FOOT, STEP - 1, teak.shade);

    // The sail: a triangle of canvas aft of the mast, bellied to starboard so
    // it is a surface from every heading rather than a line from two of them.
    // One band of red across it, which is what a dinghy's sail carries and what
    // gives the eye something to read the curve off.
    const shoulder = boom + Math.round((head - boom) * SHOULDER);
    for (let y = boom + 1; y < head; y++) {
      const reach =
        y <= shoulder ? FOOT : Math.max(1, Math.round((FOOT * (head - y)) / (head - shoulder)));
      for (let aft = 1; aft <= reach; aft++) {
        // Set to starboard of the mast rather than through it, so the canvas is
        // a surface the eye can follow rather than a fin the spar bisects.
        //
        // The belly is taken off the *foot* rather than off this course's own
        // reach, which is what makes the sail one cylindrical surface: a station
        // a given distance aft of the mast lies in the same column at every
        // height, so each column is a clean vertical plane. Measured per course
        // instead, the curve slid sideways as the leech came in and the sail
        // came out crenellated.
        const belly = Math.round(Math.sin((Math.PI * aft) / (FOOT + 1)) * DRAUGHT);
        b.set(1 + belly, y, STEP - aft, y === boom + 5 ? bloom.base : stucco.light);
      }
    }
  },
});
