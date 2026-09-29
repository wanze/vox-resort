import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { poolWater } from '../parts/pool.ts';
import { flatRoof, gableRoof, hipRoof } from '../parts/roof.ts';
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
const WINGS = [
  { x: 4, z: 14, w: 48, d: 48 },
  { x: 108, z: 14, w: 48, d: 48 },
] as const;
const WING_FRONT = 61;
const WING_STOREYS = 4;
const ARCADE_DEPTH = 4;

const CENTRE = { x: 52, z: 8, w: 56, d: 46 } as const;
const FRONT = CENTRE.z + CENTRE.d - 1;
const CENTRE_RIGHT = CENTRE.x + CENTRE.w - 1;
// Two storeys above the wings, or their hipped ridges would reach its roof terrace.
const CENTRE_STOREYS = 6;
const BAYS = [58, 68, 78, 88, 98] as const;

const PORCH = { x: 65, z: FRONT + 1, w: 30, d: 12 } as const;
const PORCH_FRONT = PORCH.z + PORCH.d - 1;
const DOOR = 77;

const POOL = { x: 58, z: 14, w: 30, d: 14 } as const;
const STAIR_HOUSE = { x: 94, z: 12, w: 12, d: 12 } as const;

const LANTERNS = [75, 84] as const;

// Every third voxel: each baluster is four quads the mesher cannot merge.
const PITCH = 3;

export default defineModel({
  id: 'hotel-b',
  label: 'Hotel B',
  category: 'lodging',
  tiles: { x: 10, z: 5 },
  // The size rule counts its facade detail and would ask 22 430, nearly twice a house per bed.
  cost: 12_000,
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  water: [PALETTE.water.base],
  lights: LANTERNS.map((x) => ({
    x,
    y: 11,
    z: PORCH_FRONT + 2,
    color: LANTERN,
    intensity: 100,
    distance: 58,
  })),
  venue: {
    role: 'lodging',
    capacity: 40,
    beds: 40,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 30,
    doors: [{ x: DOOR + 3, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { bloom, foliage, grass, metal, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });

    for (const wing of WINGS) {
      const eaves = stuccoWall(b, { ...wing, y: ground, storeys: WING_STOREYS });
      const ridge = hipRoof(b, { ...wing, y: eaves });
      const x0 = wing.x;
      const x1 = wing.x + wing.w - 1;
      for (const x of [x0 + 10, x1 - 12]) {
        b.box(x, x + 2, eaves, ridge + 1, wing.z + 22, wing.z + 24, stucco.base);
        b.box(x - 1, x + 3, ridge + 2, ridge + 2, wing.z + 21, wing.z + 25, stone.light);
      }
      for (let storey = 0; storey < WING_STOREYS; storey++) {
        const sill = ground + 3 + storey * STOREY_VOXELS;
        for (let bay = 0; bay < 4; bay++) {
          const alongX = x0 + 4 + bay * 12;
          const alongZ = wing.z + 4 + bay * 12;
          shutteredWindow(b, { face: 'z-', at: wing.z, along: alongX, y: sill, w: 4 });
          shutteredWindow(b, { face: 'x-', at: x0, along: alongZ, y: sill, w: 4 });
          shutteredWindow(b, { face: 'x+', at: x1, along: alongZ, y: sill, w: 4 });
          if (storey === 0) continue;
          shutteredWindow(b, { face: 'z+', at: WING_FRONT, along: alongX, y: sill, w: 4, h: 7 });
          // Blooms of one colour, so each box stays two quads the mesher can merge.
          flowerBox(b, {
            x: alongX - 1,
            z: WING_FRONT + 1,
            y: sill - 3,
            w: 6,
            along: 'x',
            timber: PALETTE.terracotta,
            blooms: [bloom.base],
          });
        }
      }
      // The arches spring and crown so their band lands on the wall's first string course.
      const walk = WING_FRONT - ARCADE_DEPTH;
      arcade(b, {
        x: x0,
        z: walk + 1,
        w: wing.w,
        d: ARCADE_DEPTH,
        y: ground,
        along: 'x',
        bays: 5,
        pier: 3,
        height: 8,
      });
      for (let bay = 0; bay < 5; bay++) {
        const along = x0 + bay * 9 + 4;
        shutteredWindow(b, { face: 'z+', at: walk, along, y: ground + 2, w: 4, h: 6 });
      }
      b.box(x0 + 3, x1 - 3, ground - 1, ground - 1, walk + 1, WING_FRONT, stone.light);
    }

    const eaves = stuccoWall(b, { ...CENTRE, y: ground, storeys: CENTRE_STOREYS });
    const deck = flatRoof(b, { ...CENTRE, y: eaves, parapet: 0, cover: stone });

    for (let storey = 0; storey < CENTRE_STOREYS; storey++) {
      const floor = ground + storey * STOREY_VOXELS;
      for (const along of BAYS) {
        shutteredWindow(b, { face: 'z-', at: CENTRE.z, along, y: floor + 3, w: 4 });
        if (storey === 0) continue;
        const hidden = storey === 1 && along > PORCH.x && along < PORCH.x + PORCH.w;
        if (hidden) continue;
        // French windows on a Juliet balcony, so the centre reads apart from the wings' sashes.
        shutteredWindow(b, { face: 'z+', at: FRONT, along, y: floor + 2, w: 4, h: 8 });
        b.box(along - 1, along + 4, floor + 1, floor + 1, FRONT + 1, FRONT + 2, stone.light);
        balustrade(b, { x: along - 1, z: FRONT + 2, y: floor + 2, w: 6, along: 'x', pitch: PITCH });
      }
      if (storey < WING_STOREYS) continue;
      for (const along of [20, 32, 44]) {
        shutteredWindow(b, { face: 'x-', at: CENTRE.x, along, y: floor + 3, w: 4 });
        shutteredWindow(b, { face: 'x+', at: CENTRE_RIGHT, along, y: floor + 3, w: 4 });
      }
    }
    for (const along of [BAYS[0], BAYS[4]]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4, h: 6 });
    }
    for (const [wing, along] of [
      [WINGS[0], WINGS[0].x + WINGS[0].w - 1],
      [WINGS[1], WINGS[1].x],
    ] as const) {
      for (let storey = 0; storey < WING_STOREYS; storey++) {
        const face = wing.x < CENTRE.x ? 'x+' : 'x-';
        shutteredWindow(b, {
          face,
          at: along,
          along: FRONT + 3,
          y: ground + 3 + storey * STOREY_VOXELS,
        });
      }
    }

    b.box(PORCH.x, PORCH.x + PORCH.w - 1, ground, ground, PORCH.z, PORCH_FRONT, stone.light);
    const porchFloor = ground + 1;
    const arch = { y: porchFloor, pier: 3, height: 8, rise: 2 } as const;
    const lintel = arcade(b, {
      ...arch,
      x: PORCH.x,
      z: PORCH_FRONT - 1,
      w: PORCH.w,
      d: 2,
      along: 'x',
      bays: 3,
    });
    for (const x of [PORCH.x, PORCH.x + PORCH.w - 2]) {
      arcade(b, { ...arch, x, z: PORCH.z, w: 2, d: PORCH.d - 2, along: 'z', bays: 1 });
    }
    const x0 = PORCH.x + 2;
    const x1 = PORCH.x + PORCH.w - 3;
    b.box(x0, x1, lintel - 2, lintel - 2, PORCH.z, PORCH_FRONT - 2, stucco.base);
    b.box(x0, x1, lintel - 1, lintel - 1, PORCH.z, PORCH_FRONT - 2, stucco.light);
    // Starts a voxel off the wall so the roof's back course does not paint a gable onto the facade.
    gableRoof(b, { ...PORCH, z: PORCH.z + 1, d: PORCH.d - 1, y: lintel, ridge: 'z', overhang: 1 });
    // Stucco inside the raking course: a gable end of solid tile reads as a wall of roof.
    const gable = PORCH_FRONT + 1;
    for (let course = 0; ; course++) {
      const lo = PORCH.x - 1 + course * 2 + 2;
      const hi = PORCH.x + PORCH.w - course * 2 - 2;
      if (lo > hi) break;
      b.box(lo, hi, lintel + course, lintel + course, gable, gable, stucco.light);
    }

    doorway(b, { face: 'z+', at: FRONT, along: DOOR, y: porchFloor, w: 6, h: 9 });
    for (const x of LANTERNS) {
      b.box(x, x, ground + 5, ground + 8, PORCH_FRONT + 1, PORCH_FRONT + 1, metal.deep);
      b.box(x, x, ground + 6, ground + 7, PORCH_FRONT + 1, PORCH_FRONT + 1, LANTERN);
    }

    for (const z of [CENTRE.z - 1, FRONT + 1]) {
      balustrade(b, { x: CENTRE.x - 1, z, y: deck, w: CENTRE.w + 2, along: 'x', pitch: PITCH });
    }
    for (const x of [CENTRE.x - 1, CENTRE_RIGHT + 1]) {
      balustrade(b, { x, z: CENTRE.z - 1, y: deck, w: CENTRE.d + 2, along: 'z', pitch: PITCH });
    }
    poolWater(b, { ...POOL, deck: eaves });
    for (const x of [60, 67, 74, 81]) {
      const z = POOL.z + POOL.d + 3;
      b.box(x, x + 3, deck, deck, z, z + 7, teak.shade);
      b.box(x, x + 3, deck + 1, deck + 1, z + 2, z + 7, stucco.light);
      b.box(x, x + 3, deck + 1, deck + 3, z, z + 1, stucco.light);
    }

    const shade = { z0: 40, z1: 51 } as const;
    for (const x of [57, 79, 101]) {
      for (const z of [shade.z0, shade.z1 - 1])
        b.box(x, x + 1, deck, deck + 9, z, z + 1, teak.base);
    }
    for (const z of [shade.z0, shade.z1 - 1]) {
      b.box(56, 103, deck + 10, deck + 10, z, z + 1, teak.base);
    }
    for (let x = 57; x <= 102; x += 5) {
      b.box(x, x, deck + 11, deck + 11, shade.z0 - 1, shade.z1 + 1, teak.light);
    }
    for (const x of [64, 88]) {
      b.box(x, x + 5, deck, deck + 2, 44, 47, teak.shade);
      b.box(x - 1, x + 6, deck + 3, deck + 3, 43, 48, teak.light);
    }

    const lid = stuccoWall(b, { ...STAIR_HOUSE, y: deck, storeys: 1, skirting: 0 });
    hipRoof(b, { ...STAIR_HOUSE, y: lid, overhang: 1 });
    doorway(b, { face: 'x-', at: STAIR_HOUSE.x, along: STAIR_HOUSE.z + 4, y: deck, w: 4, h: 9 });

    const lawn = WING_FRONT + 3;
    const edge = PLOT.d - 2;
    for (const [lo, hi] of [
      [2, PORCH.x - 4],
      [PORCH.x + PORCH.w + 3, PLOT.w - 3],
    ] as const) {
      b.box(lo, hi, ground - 1, ground - 1, lawn, edge, grass.base);
      b.box(lo, hi, ground, ground + 1, edge - 1, edge, foliage.base);
      for (let x = lo + 5; x + 3 <= hi - 4; x += 14) {
        b.box(x, x + 3, ground, ground + 2, lawn + 4, lawn + 7, foliage.base);
        b.box(x + 1, x + 2, ground + 3, ground + 3, lawn + 5, lawn + 6, foliage.light);
        if (x + 13 <= hi - 4) b.box(x + 6, x + 11, ground, ground, lawn + 5, lawn + 6, bloom.base);
      }
    }
    for (const x of [DOOR - 8, DOOR + 8]) {
      flowerBox(b, { x, z: PORCH_FRONT + 2, y: ground, w: 6, along: 'z' });
    }
    b.box(DOOR - 1, DOOR + 6, ground - 1, ground - 1, PORCH_FRONT + 1, PLOT.d - 1, stone.light);
    for (const x of [PORCH.x - 3, PORCH.x + PORCH.w + 1]) {
      pottedPlant(b, { x, z: PORCH_FRONT - 1, y: ground });
    }
    for (const [lo, hi] of [
      [CENTRE.x + 1, PORCH.x - 2],
      [PORCH.x + PORCH.w + 1, CENTRE_RIGHT - 1],
    ] as const) {
      b.box(lo, hi, ground - 1, ground - 1, FRONT + 3, WING_FRONT - 1, grass.base);
      b.box(lo + 1, hi - 1, ground, ground + 2, FRONT + 4, FRONT + 6, foliage.base);
      b.box(lo + 2, hi - 2, ground + 3, ground + 3, FRONT + 5, FRONT + 5, bloom.base);
    }
  },
});
