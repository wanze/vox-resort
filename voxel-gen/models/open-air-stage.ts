import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { planter, pottedPlant, pottedTree } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import {
  DECK_TOP,
  FLIGHT_W,
  FLIGHTS,
  FLOOR,
  fourTops,
  GROUND,
  LAMP,
  lampPost,
  LIP,
  PLAZA_VENUE,
  POST_Z,
  STAGE,
  STAGE_RIGHT,
  TABLE_SEATS,
  X,
  Z,
} from './stage-plaza.ts';

const TRUSS = 26;

// Mirrored about the deck's middle, with the widest gap over the animator.
const LAMP_HEADS = [34, 42, 50, 58, 68, 76, 84, 92] as const;
const LAMP_POSTS = [3, 58, 70, 124] as const;

const SPEAKERS = [18, 102] as const;

// Each pot's corner; the crowns overhang by two, from eight courses up, so no chair or spot
// is under one where it counts.
const TREES = [
  [4, 6],
  [X - 8, 6],
  [11, 17],
  [X - 15, 17],
  [8, 33],
  [X - 12, 33],
  [53, 64],
  [X - 57, 64],
] as const;

// Along the front between the doors and the lamps, and along the foot of the stage.
const FRONT_PLANTERS = [
  [6, 7],
  [24, 31],
  [75, 29],
  [115, 4],
] as const;

export default defineModel({
  id: 'open-air-stage',
  label: 'Open-Air Stage',
  category: 'leisure',
  tiles: { x: 8, z: 6 },
  // Derived from the voxels, the flat paving prices it well under what the rig is worth.
  cost: 3_500,
  placement: { perResort: { min: 1, max: 2 } },
  emissive: [LAMP],
  lights: [
    // Over what each lights, not at the fittings: the bake has only points.
    { x: 46, y: 22, z: 14, color: LAMP, intensity: 110, distance: 60 },
    { x: 82, y: 22, z: 14, color: LAMP, intensity: 110, distance: 60 },
    { x: 40, y: 18, z: 39, color: LAMP, intensity: 90, distance: 52 },
    { x: 88, y: 18, z: 39, color: LAMP, intensity: 90, distance: 52 },
    { x: 28, y: 16, z: 75, color: LAMP, intensity: 80, distance: 48 },
    { x: 100, y: 16, z: 75, color: LAMP, intensity: 80, distance: 48 },
    { x: 58, y: 17, z: POST_Z, color: LAMP, intensity: 90, distance: 46 },
    { x: 70, y: 17, z: POST_Z, color: LAMP, intensity: 90, distance: 46 },
  ],
  seats: TABLE_SEATS,
  venue: {
    ...PLAZA_VENUE,
    names: [
      'Sunset Stage',
      'The Bandstand',
      'Piazza del Sole',
      'Starlight Stage',
      'The Shell Stage',
      'Palco del Mare',
      'Lantern Square',
      'The Promenade Stage',
      'Golden Hour Stage',
      'Piazza Marina',
      'The Moonrise Stage',
      'Seabreeze Stage',
      'The Open Air',
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, metal, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: X, d: Z, height: 2, stone: terracotta });
    const paving = ground - 1;
    // One flat field inside the border: a dithered plaza defeats the coplanar merge.
    box(3, X - 4, paving, paving, 3, Z - 4, stone.light);
    box(FLOOR.x, FLOOR.x + FLOOR.w - 1, paving, paving, FLOOR.z, FLOOR.z + FLOOR.d - 1, teak.light);

    const top = plinth(b, { ...STAGE, y: ground, height: 4, stone: teak });
    if (ground !== GROUND || top !== DECK_TOP) {
      throw new Error('The plaza, the deck and their places must agree on the surfaces');
    }
    box(STAGE.x, STAGE_RIGHT, ground, top - 2, LIP, LIP, teak.deep);
    for (const x of FLIGHTS) {
      steps(b, { x, z: LIP + 1, w: FLIGHT_W, y: top - 1, treads: 4, descends: 'z+' });
    }

    box(STAGE.x + 2, STAGE_RIGHT - 2, top, top + 14, STAGE.z, STAGE.z + 1, stucco.light);
    box(STAGE.x + 2, STAGE_RIGHT - 2, top + 9, top + 10, STAGE.z, STAGE.z + 1, bloom.base);

    for (const x of [STAGE.x, STAGE_RIGHT - 1]) {
      for (const z of [STAGE.z, LIP - 1]) box(x, x + 1, top, TRUSS + 1, z, z + 1, metal.base);
      box(x, x + 1, TRUSS, TRUSS + 1, STAGE.z, LIP, metal.base);
    }
    box(STAGE.x, STAGE_RIGHT, TRUSS, TRUSS + 1, LIP - 1, LIP, metal.base);
    box(STAGE.x, STAGE_RIGHT, TRUSS + 2, TRUSS + 2, STAGE.z, STAGE.z + 9, metal.shade);
    for (const x of LAMP_HEADS) {
      box(x, x + 1, TRUSS - 1, TRUSS - 1, LIP - 1, LIP - 1, metal.deep);
      box(x, x + 1, TRUSS - 3, TRUSS - 2, LIP - 1, LIP, LAMP);
    }

    for (const x of SPEAKERS) {
      box(x, x + 7, ground, ground + 9, 16, 22, metal.deep);
      box(x, x + 7, ground + 5, ground + 6, 22, 22, metal.light);
    }

    const footlights = { x: FLIGHTS[0] + FLIGHT_W + 1, w: FLIGHTS[1] - FLIGHTS[0] - FLIGHT_W - 2 };
    planter(b, { ...footlights, z: LIP + 1, y: ground, d: 2, box: teak, blooms: [bloom.base] });
    for (const [x, w] of FRONT_PLANTERS) {
      planter(b, { x, w, z: POST_Z + 1, y: ground, d: 2, blooms: [bloom.base, amber.base] });
    }
    for (const [x, z] of TREES) pottedTree(b, { x, z, y: ground });
    for (const x of [FLOOR.x - 6, FLOOR.x + FLOOR.w + 3]) {
      pottedPlant(b, { x, z: FLOOR.z + FLOOR.d - 3, y: ground, size: 3 });
    }

    fourTops(b, { top: teak.light, leg: teak.shade, seat: teak.base, rail: teak.base });

    for (const x of LAMP_POSTS) lampPost(b, x, stone.shade);
  },
});
