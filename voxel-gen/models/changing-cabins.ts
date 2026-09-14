/**
 * Changing cabins: a row of three beach huts on a sand slab, each a whitewashed
 * timber box under a gable roof in its own colour, with a boarded walk along
 * their fronts. 32x16x16 (8 x 4 m, 4 m to the ridge), a 2x1 tile. The doors face
 * +z, which on a generated beach is the water.
 *
 * **The slab is the two layers of `sand` every beach prop stands on**, and on
 * sand that is the whole point of it: sand on sand is invisible, so the row
 * reads as standing on the beach rather than on a plinth dropped onto it. It is
 * also what fills the 2x1 footprint the model claims — see `--audit`. The same
 * reasoning `lifeguard-tower.ts` records, for the same reason.
 *
 * **Three huts rather than one.** A changing cabin is 2 m square, which is an
 * eighth of a tile: drawn alone it would be a prop lost on its own plot, and
 * drawn at tile scale it would be a shed. Three of them side by side is what a
 * beach actually puts up, and it is what makes the object read at the size it
 * claims — the footprint is filled by huts, not by the slab under them.
 *
 * **The colour is the roof, and only the roof.** Beach huts are the one thing on
 * this plot that is meant to be bright, and the cheapest way to say so is the
 * surface that is already laid in courses: `gableRoof` takes any ramp and lays
 * its eave course in `deep`, its slopes in `base` and its ridge in `light`, so
 * three roofs in `bloom`, `amber` and `water` are three painted huts for no
 * colours the palette did not already hold. The walls stay `stucco` and the
 * frame stays `teak`, which is what keeps the row in the lane rather than
 * turning it into a funfair — see `docs/art-direction.md`.
 *
 * `water` is a roof here and not a shader: the model declares no `water` field,
 * so the colour is an ordinary albedo, exactly as the pool shower's stream is.
 */
import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole 2x1 footprint: a model fills what it claims. */
const SLAB = { x: 0, z: 0, w: 32, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the huts stand. */
const GROUND = SLAB.height;

/** One hut: 8 wide by 9 deep, which is 2 x 2.25 m of changing room. */
const CABIN = { w: 8, z: 2, d: 9 } as const;

/** The row the front wall's outer surface sits on, where the doors are cut. */
const FRONT = CABIN.z + CABIN.d - 1;

/** Layers of wall. Ten is 2.5 m, so a 2 m door clears its lintel by a course. */
const WALL = 10;

/** The plate course under the eaves, and the first free layer above the wall. */
const PLATE = GROUND + WALL - 1;
const EAVES = PLATE + 1;

/** The door, centred in the 8-voxel front: 1 x 2 m, a course clear of each post. */
const DOOR = { inset: 2, w: 4, h: 8 } as const;

/**
 * Where each hut stands, and what its roof is painted.
 *
 * Ten voxels of roof apiece with a voxel of daylight between them: 3 x 10 + 2
 * fills the 32-voxel footprint exactly, which is what lets the three read as
 * three huts rather than as one long shed with doors in it.
 */
const CABINS: readonly { readonly x: number; readonly paint: Ramp }[] = [
  { x: 1, paint: PALETTE.bloom },
  { x: 12, paint: PALETTE.amber },
  { x: 23, paint: PALETTE.water },
];

/** The boarded walk along the front, filling the sand the huts do not reach. */
const WALK = { z: 12, z1: 15 } as const;

export default defineModel({
  id: 'changing-cabins',
  label: 'Changing Cabins',
  category: 'amenities',
  placement: { ground: 'beach' },
  venue: {
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.3 }],
    capacity: 2,
    dwellSeconds: { min: 60, max: 180 },
  },
  tiles: { x: 2, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stucco, teak, metal } = PALETTE;

    plinth(b, SLAB);

    // One board walk across the whole front, a course proud of the sand. Flat
    // and in one tone: it is a single quad from above whatever its size.
    box(SLAB.x, SLAB.x + SLAB.w - 1, GROUND, GROUND, WALK.z, WALK.z1, teak.shade);

    for (const cabin of CABINS) {
      const x1 = cabin.x + CABIN.w - 1;

      // The body, solid — a cavity would get its own inside surface and cost
      // more triangles than it saves voxels. See `parts/wall.ts`.
      box(cabin.x, x1, GROUND, PLATE, CABIN.z, FRONT, stucco.base);
      // A timber sill against the sand, and the plate the roof sits on.
      box(cabin.x, x1, GROUND, GROUND, CABIN.z, FRONT, teak.shade);
      box(cabin.x, x1, PLATE, PLATE, CABIN.z, FRONT, stucco.light);
      // Corner posts, which is what a boarded hut has where a rendered building
      // has quoins: four columns, four rectangles.
      for (const x of [cabin.x, x1]) {
        for (const z of [CABIN.z, FRONT]) box(x, x, GROUND, PLATE, z, z, teak.base);
      }

      gableRoof(b, {
        x: cabin.x,
        z: CABIN.z,
        w: CABIN.w,
        d: CABIN.d,
        y: EAVES,
        // One voxel rather than the usual two: a 25 cm eave on a 2 m hut is the
        // same proportion a 50 cm eave is on a villa, and two would have the
        // neighbouring roofs touching.
        overhang: 1,
        // Along the depth, so the gable faces the beach — the triangle over the
        // door is the whole silhouette of a beach hut.
        ridge: 'z',
        tile: cabin.paint,
      });

      const along = cabin.x + DOOR.inset;
      doorway(b, { face: 'z+', at: FRONT, along, y: GROUND, w: DOOR.w, h: DOOR.h });
      // A handle on the leaf, which sits a voxel back in the recess. One voxel,
      // and it is what stops the door reading as a dark rectangle.
      b.set(along + DOOR.w - 1, GROUND + 4, FRONT - 1, metal.light);
    }
  },
});
