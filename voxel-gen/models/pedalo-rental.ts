/**
 * Pedalo rental: a timber hire shack under a thatch roof with a hatch and a
 * counter facing the water, and three pedal boats drawn up on the sand in front
 * of it. 32x21x32 (8 x 5.25 x 8 m), a 2x2 tile. The counter and the boats face
 * +z, which on a generated plot is the sea.
 *
 * The slab is the two layers of `sand` every beach prop stands on, so the hut
 * reads as standing on the beach rather than on a plinth dropped onto it, and
 * the boats rest straight on it. See `lifeguard-tower.ts`, which found that.
 *
 * **The rack is most of the model, and that is deliberate.** A hire shack with
 * nothing outside it is a kiosk, and the catalogue has four of those already;
 * what says *pedalo rental* from across the bay is a row of bright hulls lying
 * bow-to-the-water with their paddle wheels in the sand. They are drawn from
 * `parts/boat.ts`, which is the same part `sea/pedalo.ts` paints the ones out on
 * the water with — so a boat that has been taken out and a boat still on the
 * rack are the same boat, and there is one place to change what a pedalo looks
 * like. Three trims rather than one, because a rack of hire boats is never all
 * one colour and because it is what keeps three copies of one part from reading
 * as one object stamped three times.
 *
 * **It belongs at the water.** `placement.ground` is `shore`, so neither the
 * generator nor the build tool will stand it anywhere but on the sand a couple
 * of tiles off the sea — the generator puts it beside a pier — for the reason a
 * lifeguard tower is held there: a pedalo rental behind the hotels is renting
 * boats to a lawn. It needs no path: nothing standing on sand is given a spur,
 * because sand is walked on.
 */
import { PALETTE } from '../palette.ts';
import { PEDALO_BEAM, PEDALO_LENGTH, pedalo } from '../parts/boat.ts';
import { plinth } from '../parts/ground.ts';
import { thatchRoof } from '../parts/roof.ts';
import {
  awning,
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole footprint: a model fills the tiles it claims. */
const SLAB = { x: 0, z: 0, w: 32, d: 32, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab: the sand the hut and the boats stand on. */
const GROUND = SLAB.height;

/** The shack, against the back of the plot so the boats get the seaward half. */
const HUT = { x: 4, z: 3, w: 14, d: 10 } as const;

/** The face the counter is on: the front wall of the hut. */
const FRONT = HUT.z + HUT.d - 1;

/** The columns the three boats are drawn up in, and the row their transoms rest on. */
const RACK = [PEDALO_BEAM + 1, 16, 31 - PEDALO_BEAM] as const;
const RACK_Z = 31 - PEDALO_LENGTH;

export default defineModel({
  id: 'pedalo-rental',
  label: 'Pedalo Rental',
  category: 'leisure',
  placement: { ground: 'shore', perResort: { min: 1, max: 1 } },
  tiles: { x: 2, z: 2 },
  windows: WINDOW_GLASS,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, stucco, teak, water } = PALETTE;

    plinth(b, SLAB);

    // The shack: timber rather than whitewash, because a hire hut on a beach is
    // a shed and the resort's render is for its buildings. The quoins `stuccoWall`
    // draws come out as the corner posts a shed actually has.
    const eaves = stuccoWall(b, {
      x: HUT.x,
      z: HUT.z,
      w: HUT.w,
      d: HUT.d,
      y: GROUND,
      storeys: 1,
      wall: teak,
      trim: PALETTE.stone,
      skirting: 1,
    });
    thatchRoof(b, { ...HUT, y: eaves, overhang: 2 });

    // The serving hatch, the counter under it and the blind over it.
    const hatch = GROUND + 4;
    doorway(b, { face: 'z+', at: FRONT, along: HUT.x + 4, y: hatch, w: 6, h: 5, timber: teak });
    box(HUT.x + 3, HUT.x + 11, hatch - 1, hatch - 1, FRONT, FRONT + 2, teak.light);
    box(HUT.x + 3, HUT.x + 11, GROUND, hatch - 2, FRONT + 1, FRONT + 2, teak.shade);
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: HUT.x + 2,
      w: 11,
      y: GROUND + STOREY_VOXELS - 2,
      reach: 3,
      canvas: bloom,
    });

    // One window on the eastern flank, so the hut is a room rather than a box
    // with a hatch in it, and somebody is in there after dark.
    shutteredWindow(b, {
      face: 'x+',
      at: HUT.x + HUT.w - 1,
      along: HUT.z + 3,
      y: GROUND + 5,
      w: 3,
      h: 4,
      timber: teak,
    });

    // A board of prices on the western jamb, and two life rings on the wall
    // beside it: the two things that say what is hired here.
    box(HUT.x, HUT.x, GROUND + 4, GROUND + 8, HUT.z + 2, HUT.z + 6, stucco.light);
    for (const z of [HUT.z + 2, HUT.z + 6]) {
      box(HUT.x - 1, HUT.x - 1, GROUND + 5, GROUND + 8, z, z + 2, bloom.base);
      box(HUT.x - 1, HUT.x - 1, GROUND + 6, GROUND + 7, z + 1, z + 1, stucco.light);
    }

    // The rack: three boats lying bow to the water, each in its own trim.
    for (const [index, x] of RACK.entries()) {
      pedalo(b, { x, z: RACK_Z, y: GROUND, trim: [water, bloom, amber][index]! });
    }

    // A rail of paddles and buoyancy aids along the eastern edge of the plot,
    // which is what fills the corner the hut leaves and what a hire beach is
    // never without.
    const rail = GROUND + 6;
    for (const z of [HUT.z, HUT.z + 8]) box(24, 24, GROUND, rail, z, z, teak.base);
    box(24, 24, rail, rail, HUT.z, HUT.z + 8, teak.light);
    for (const z of [HUT.z + 1, HUT.z + 4, HUT.z + 7]) {
      box(24, 24, rail - 4, rail - 1, z, z, amber.base);
    }
  },
});
