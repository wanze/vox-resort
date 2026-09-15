/**
 * Premium resort villa: two whitewashed storeys under a terracotta hipped roof,
 * an arcaded veranda along the front carrying a first-floor terrace, and a
 * plunge pool sunk into the paved terrace beside it.
 * 64x64 (16x16 m plot, a 10.75x10 m villa with two 3 m storeys, 10 m to the
 * ridge), a 4x4 tile. Veranda faces +z; the pool sits on the -x terrace.
 *
 * Drawn from `docs/references/villa.jpg`, which is the render the whole resort
 * is held against — see `docs/art-direction.md`. The two moves that carry the
 * reference across the gap are the ones a plain box cannot make: the arcade,
 * whose arches are cut through masonry rather than painted on it, and the
 * balustraded terrace it holds up, which stops the elevation an eave short of
 * the roof so the building has a middle as well as a top and a bottom.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The body, set back so the +z end is a veranda and the -x end a pool terrace. */
const BODY = { x: 18, z: 6, w: 43, d: 40 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

/** The veranda, three voxels of pier standing clear of the wall behind it. */
const VERANDA = { z: 49, d: 3 } as const;
/** Where each arch stands, so the openings behind them line up with the bays. */
const BAYS = [21, 29, 37, 45, 53] as const;
/** The bay on the centre line, which the front door and the steps sit under. */
const CENTRE = BAYS[2];

/** The plunge pool, sunk one layer into the terrace inside a stone coping. */
const POOL = { x: 3, z: 20, w: 13, d: 36 } as const;

export default defineModel({
  id: 'villa',
  label: 'Villa',
  category: 'lodging',
  tiles: { x: 4, z: 4 },
  // A few to a resort, mixed in among the houses rather than given a street of
  // their own: see `hostsAccent` in `resortGenerator.ts`.
  placement: { perResort: { min: 1, max: 12 } },
  venue: {
    role: 'lodging',
    capacity: 8,
    beds: 8,
    dwellSeconds: { min: 25_200, max: 32_400 },
    doors: [{ x: CENTRE + 2, z: FRONT, facing: 0 }],
  },
  windows: WINDOW_GLASS,
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 64 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 2 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    // The veranda, and the terrace its roof doubles as. The arcade hands back
    // the layer its cornice ends on, so the roof lands wherever the arches did.
    const cornice = arcade(b, {
      x: BODY.x,
      z: VERANDA.z,
      w: BODY.w,
      d: VERANDA.d,
      y: ground,
      along: 'x',
      bays: BAYS.length,
      pier: 3,
      height: 8,
    });
    // A tiled eave course, standing out past the arcade to throw the line of
    // shadow a roof is for, and a paved deck laid on top of it.
    const terrace = cornice + 1;
    const brink = VERANDA.z + 3;
    b.box(BODY.x - 2, RIGHT + 2, cornice, cornice, FRONT + 1, brink + 1, PALETTE.terracotta.deep);
    b.box(BODY.x - 1, RIGHT + 1, terrace, terrace, FRONT + 1, brink, PALETTE.stone.base);

    // The terrace is edged rather than left as a cliff, which is the reference's
    // one loud detail and the reason the first floor reads as lived on.
    const rail = terrace + 1;
    balustrade(b, { x: BODY.x + 1, z: brink, y: rail, w: BODY.w - 2, along: 'x' });
    for (const x of [BODY.x + 1, RIGHT - 1]) {
      balustrade(b, { x, z: FRONT + 2, y: rail, w: brink - FRONT - 1, along: 'z' });
    }

    // The pool, cut into the paving rather than stood on it, and ringed by a
    // coping that stands a voxel proud of the paving. Two layers between the
    // coping and the water is what makes it read as a hole rather than as a
    // blue mat: the coping's inner face is the only thing that says it has
    // depth, and there is no shading in these colours to say it for us.
    const poolX = POOL.x + POOL.w - 1;
    const poolZ = POOL.z + POOL.d - 1;
    for (let x = POOL.x; x <= poolX; x++) {
      for (let z = POOL.z; z <= poolZ; z++) {
        if (x === POOL.x || x === poolX || z === POOL.z || z === poolZ) {
          b.box(x, x, ground - 1, ground, z, z, PALETTE.stone.light);
          continue;
        }
        b.del(x, ground - 1, z);
        b.set(x, ground - 2, z, PALETTE.water.base);
      }
    }

    // Ground floor: the door and a window under every arch of the veranda.
    doorway(b, { face: 'z+', at: FRONT, along: CENTRE, y: ground, w: 5 });
    steps(b, { x: CENTRE, z: FRONT + 1, w: 5, y: ground, treads: 1, descends: 'z+' });
    for (const along of BAYS) {
      if (along === CENTRE) continue;
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4 });
    }

    // First floor: a French window onto the terrace behind every arch, so the
    // openings of the two storeys sit on the same five vertical lines.
    for (const along of BAYS) {
      if (along === CENTRE) {
        doorway(b, { face: 'z+', at: FRONT, along, y: rail, w: 5, h: 8 });
        continue;
      }
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: rail, w: 4, h: 8 });
    }

    // The other three sides, both storeys, on the same rhythm: the reference is
    // detailed all the way round, which is what a model seen from any angle has
    // to be.
    for (const y of [ground + 3, ground + 3 + STOREY_VOXELS]) {
      for (const along of [12, 22, 32, 40]) {
        shutteredWindow(b, { face: 'x-', at: LEFT, along, y });
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y });
      }
      for (const along of [24, 32, 46, 54]) {
        shutteredWindow(b, { face: 'z-', at: BODY.z, along, y });
      }
    }

    // Planting, the one high-frequency detail the lane allows, by the entrance
    // and down the long side of the pool.
    for (const x of [BODY.x + 1, CENTRE - 4, CENTRE + 6, RIGHT - 2]) {
      pottedPlant(b, { x, z: VERANDA.z + 4, y: ground });
    }
    flowerBox(b, {
      x: poolX + 2,
      z: POOL.z + 2,
      y: ground,
      w: POOL.d - 4,
      along: 'z',
      blooms: [PALETTE.foliage.base, PALETTE.foliage.light],
    });
    flowerBox(b, { x: CENTRE + 10, z: brink + 4, y: ground, w: 10, along: 'x' });
  },
});
