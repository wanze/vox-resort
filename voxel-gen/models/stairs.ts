/**
 * Stair tile: the paving the resort uses where a path crosses a terrace step —
 * a flight of flagstone treads climbing one level across a single tile.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * **Where it stands.** On the *lower* tile of the step, at the lower terrace's
 * own height, turned so the climb faces the higher ground. Unturned the flight
 * climbs towards the north (z = 0), which is the face a turn of one swings round
 * to the west — see `rotation.ts`. So one model and a quarter turn cover all four
 * directions a path can climb in, exactly as one cottage covers all four ways a
 * cottage can face: no second geometry, no second bucket.
 *
 * Nobody picks it, either: the palette offers `path`, and a path laid across a
 * step comes out as this. See `groundDecides` below.
 *
 * **Why it lines up.** Two heights have to agree with things authored elsewhere,
 * and both are derived rather than typed in:
 *
 * - The lowest tread stands one voxel above `path.ts`'s slab, so you step up
 *   onto it from the paving that runs into it.
 * - The highest tread is flush with the slab of a path laid on the terrace
 *   above, which is `LEVEL_VOXELS` higher.
 *
 * Between them that is a climb of `LEVEL_VOXELS` voxels in as many treads, one
 * voxel of rise each, `TILE_VOXELS / LEVEL_VOXELS` voxels of going. A voxel is
 * 25 cm, so those are steps of 25 by 50 — steep for a staircase and the shallowest
 * a grid this coarse can express, and at the height the resort is ever seen from
 * they read as stairs. `stairs.test.ts` in `src/` holds the two heights to the
 * paving they have to meet.
 *
 * The mass under the treads is one colour and only the treads themselves are
 * banded, which keeps this at the same order of triangles as the flagstones it
 * continues: the greedy mesher merges each tread's top into one rectangle and
 * the buried faces are culled before it ever sees them.
 */
import { defineModel, LEVEL_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

/**
 * Top surface of a path slab, in voxels.
 *
 * `path.ts` and `boardwalk.ts` both fill their lowest two layers, so their
 * walking surface is at 2. This flight has to start one step above that and end
 * one level above it.
 */
const PAVING_TOP = 2;

/** One voxel of rise per tread, which is as shallow as the grid goes. */
const TREADS = LEVEL_VOXELS;

/** How deep one tread is, so the flight fills the tile exactly. */
const GOING = TILE_VOXELS / TREADS;

export default defineModel({
  id: 'stairs',
  label: 'Stairs',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: a flight is what a path turns into where it climbs a step, so
  // the palette leaves it out and the paving lays it. See `groundDecides`.
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      core: 0x9a8a6a,
      treadA: 0xc3b189,
      treadB: 0xb6a379,
      treadC: 0xcdbc95,
    };
    const treads = [C.treadA, C.treadB, C.treadC];

    const N = TILE_VOXELS - 1;

    // Highest tread first, at the north edge, descending towards the south: the
    // topmost voxel of tread `step` is the tread you walk on, and its exposed
    // south face is the riser down to the next one.
    for (let step = 0; step < TREADS; step++) {
      const top = PAVING_TOP + LEVEL_VOXELS - 1 - step;
      const z0 = step * GOING;
      const z1 = z0 + GOING - 1;
      box(0, N, 0, top - 1, z0, z1, C.core);
      box(0, N, top, top, z0, z1, treads[step % treads.length]!);
    }
  },
});
