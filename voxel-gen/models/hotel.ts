import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Lit at night, so it is drawn unlit at full brightness.
const LANTERN = PALETTE.amber.light;

const PLOT = { w: 160, d: 80 } as const;
const BODY = { x: 6, z: 10, w: 148, d: 56 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;
const STOREYS = 5;

const LOGGIA = { x: 63, w: 34, z: FRONT + 3, d: 3 } as const;
const ARCHES = [67, 77, 87] as const;

const BALCONIES: readonly number[] = Array.from({ length: 10 }, (_, i) => 11 + i * 14);
const BALCONY_W = 12;
const FIRST_FLOOR = BALCONIES.filter((x) => x + BALCONY_W <= LOGGIA.x || x >= LOGGIA.x + LOGGIA.w);

const POOL = { x: 30, z: 20, w: 40, d: 30 } as const;

const STAIR_HOUSE = { x: 112, z: 24, w: 22, d: 18 } as const;

const LANTERNS = [74, 85] as const;

// Every third voxel rather than the villa's second: each baluster is four quads the mesher cannot
// merge, and eighteen runs at the villa's pitch cost more triangles than all earlier buildings together.
const PITCH = 3;

export default defineModel({
  id: 'hotel',
  label: 'Hotel',
  category: 'lodging',
  tiles: { x: 10, z: 5 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  lights: LANTERNS.map((x) => ({
    x,
    y: 11,
    z: FRONT + 2,
    color: LANTERN,
    intensity: 100,
    distance: 58,
  })),
  venue: {
    role: 'lodging',
    capacity: 40,
    beds: 40,
    dwellSeconds: { min: 25_200, max: 32_400 },
    doors: [{ x: ARCHES[1] + 2, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: STOREYS });
    // No parapet: a roof somebody swims on is edged like a terrace, so the pool shows from the street.
    const deck = flatRoof(b, { ...BODY, y: eaves, parapet: 0, cover: PALETTE.stone });

    const cornice = arcade(b, {
      x: LOGGIA.x,
      z: LOGGIA.z,
      w: LOGGIA.w,
      d: LOGGIA.d,
      y: ground,
      along: 'x',
      bays: ARCHES.length,
      pier: 4,
      height: 8,
    });
    const terrace = cornice + 1;
    const brink = LOGGIA.z + LOGGIA.d - 1;
    b.box(
      LOGGIA.x - 2,
      LOGGIA.x + LOGGIA.w + 1,
      cornice,
      cornice,
      FRONT + 1,
      brink + 1,
      PALETTE.terracotta.deep,
    );
    b.box(
      LOGGIA.x - 1,
      LOGGIA.x + LOGGIA.w,
      terrace,
      terrace,
      FRONT + 1,
      brink,
      PALETTE.stone.base,
    );

    const floors = Array.from(
      { length: STOREYS - 1 },
      (_, i) => ground + (i + 1) * STOREY_VOXELS + 1,
    );

    for (const [storey, floor] of floors.entries()) {
      const rail = floor + 1;
      for (const x of storey === 0 ? FIRST_FLOOR : BALCONIES) {
        b.box(x - 1, x + BALCONY_W, floor, floor, FRONT + 1, FRONT + 5, PALETTE.terracotta.deep);
        b.box(x, x + BALCONY_W - 1, floor, floor, FRONT + 1, FRONT + 4, PALETTE.stone.base);
        balustrade(b, { x, z: FRONT + 4, y: rail, w: BALCONY_W, along: 'x', pitch: PITCH });
        for (const edge of [x, x + BALCONY_W - 1]) {
          balustrade(b, { x: edge, z: FRONT + 1, y: rail, w: 4, along: 'z', pitch: PITCH });
        }
        doorway(b, { face: 'z+', at: FRONT, along: x + 4, y: rail, w: 4, h: 8 });
      }
    }

    balustrade(b, { x: LOGGIA.x, z: brink, y: terrace + 1, w: LOGGIA.w, along: 'x', pitch: PITCH });
    for (const edge of [LOGGIA.x, LOGGIA.x + LOGGIA.w - 1]) {
      balustrade(b, {
        x: edge,
        z: FRONT + 1,
        y: terrace + 1,
        w: brink - FRONT,
        along: 'z',
        pitch: PITCH,
      });
    }
    for (const along of ARCHES) {
      doorway(b, { face: 'z+', at: FRONT, along, y: terrace + 1, w: 5, h: 8 });
    }

    doorway(b, { face: 'z+', at: FRONT, along: ARCHES[1], y: ground, w: 6, h: 10 });
    steps(b, { x: ARCHES[1], z: FRONT + 1, w: 6, y: ground, treads: 1, descends: 'z+' });
    for (const along of [ARCHES[0], ARCHES[2]]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4, shutters: false });
    }
    for (const x of LANTERNS) {
      b.box(x, x + 1, ground + 6, ground + 9, FRONT + 1, FRONT + 1, PALETTE.metal.deep);
      b.box(x, x + 1, ground + 7, ground + 8, FRONT + 1, FRONT + 1, LANTERN);
    }

    for (let storey = 0; storey < STOREYS; storey++) {
      const sill = ground + 3 + storey * STOREY_VOXELS;
      for (const along of [16, 28, 40, 52]) {
        shutteredWindow(b, { face: 'x-', at: LEFT, along, y: sill, w: 4 });
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y: sill, w: 4 });
      }
      for (let along = 12; along <= 144; along += 12) {
        shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: sill, w: 4 });
      }
    }
    for (const along of [12, 24, 36, 48, 108, 120, 132, 144]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4 });
    }

    for (const z of [BODY.z - 1, FRONT + 1]) {
      balustrade(b, { x: BODY.x - 1, z, y: deck, w: BODY.w + 2, along: 'x', pitch: PITCH });
    }
    for (const x of [BODY.x - 1, RIGHT + 1]) {
      balustrade(b, { x, z: BODY.z - 1, y: deck, w: BODY.d + 2, along: 'z', pitch: PITCH });
    }
    const poolX = POOL.x + POOL.w - 1;
    const poolZ = POOL.z + POOL.d - 1;
    for (let x = POOL.x; x <= poolX; x++) {
      for (let z = POOL.z; z <= poolZ; z++) {
        if (x === POOL.x || x === poolX || z === POOL.z || z === poolZ) {
          b.box(x, x, eaves, eaves + 1, z, z, PALETTE.stone.light);
          continue;
        }
        b.del(x, eaves, z);
        b.set(x, eaves - 1, z, PALETTE.water.base);
      }
    }

    const lid = stuccoWall(b, { ...STAIR_HOUSE, y: deck, storeys: 1, skirting: 0 });
    flatRoof(b, { ...STAIR_HOUSE, y: lid, parapet: 1 });
    doorway(b, { face: 'x-', at: STAIR_HOUSE.x, along: STAIR_HOUSE.z + 7, y: deck, w: 4, h: 9 });

    for (const x of [LOGGIA.x - 5, LOGGIA.x + LOGGIA.w + 3]) {
      pottedPlant(b, { x, z: brink + 1, y: ground });
    }
    for (const x of [LOGGIA.x - 12, LOGGIA.x + LOGGIA.w + 8]) {
      flowerBox(b, { x, z: brink + 1, y: ground, w: 6, along: 'x' });
    }
  },
});
