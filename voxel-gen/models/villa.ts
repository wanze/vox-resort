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

const BODY = { x: 18, z: 6, w: 43, d: 40 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const VERANDA = { z: 49, d: 3 } as const;
const BAYS = [21, 29, 37, 45, 53] as const;
const CENTRE = BAYS[2];

const POOL = { x: 3, z: 20, w: 13, d: 36 } as const;

export default defineModel({
  id: 'villa',
  label: 'Villa',
  category: 'lodging',
  tiles: { x: 4, z: 4 },
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
    const terrace = cornice + 1;
    const brink = VERANDA.z + 3;
    b.box(BODY.x - 2, RIGHT + 2, cornice, cornice, FRONT + 1, brink + 1, PALETTE.terracotta.deep);
    b.box(BODY.x - 1, RIGHT + 1, terrace, terrace, FRONT + 1, brink, PALETTE.stone.base);

    const rail = terrace + 1;
    balustrade(b, { x: BODY.x + 1, z: brink, y: rail, w: BODY.w - 2, along: 'x' });
    for (const x of [BODY.x + 1, RIGHT - 1]) {
      balustrade(b, { x, z: FRONT + 2, y: rail, w: brink - FRONT - 1, along: 'z' });
    }

    // Two layers from coping to water: the coping's inner face is the only cue that
    // the pool has depth rather than being a blue mat.
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

    doorway(b, { face: 'z+', at: FRONT, along: CENTRE, y: ground, w: 5 });
    steps(b, { x: CENTRE, z: FRONT + 1, w: 5, y: ground, treads: 1, descends: 'z+' });
    for (const along of BAYS) {
      if (along === CENTRE) continue;
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4 });
    }

    for (const along of BAYS) {
      if (along === CENTRE) {
        doorway(b, { face: 'z+', at: FRONT, along, y: rail, w: 5, h: 8 });
        continue;
      }
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: rail, w: 4, h: 8 });
    }

    for (const y of [ground + 3, ground + 3 + STOREY_VOXELS]) {
      for (const along of [12, 22, 32, 40]) {
        shutteredWindow(b, { face: 'x-', at: LEFT, along, y });
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y });
      }
      for (const along of [24, 32, 46, 54]) {
        shutteredWindow(b, { face: 'z-', at: BODY.z, along, y });
      }
    }

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
