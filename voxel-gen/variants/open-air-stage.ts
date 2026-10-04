import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { clippedCypress, planter, pottedTree } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import {
  ANIMATOR_X,
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
} from '../models/stage-plaza.ts';

// A lawn round the paving: the line waits on it at the edges, outside the paving.
const LAWN = 8;
const FIELD = { x0: LAWN, x1: X - 1 - LAWN, z0: 2, z1: Z - 5 } as const;

const WALL_TOP = STAGE.z + 17;
const BEAM = WALL_TOP + 1;
// Mirrored about the deck's middle, as the lanterns are.
const RAFTERS = Array.from({ length: 10 }, (_, at) => Math.round(30 + (at * 67) / 9));
const PERGOLA_POSTS = [STAGE.x, 46, 80, STAGE_RIGHT - 1] as const;
const LANTERNS = [37, 53, 73, 89] as const;

// Strung over the dance floor from poles off either end, clear of the floor and the line.
const FESTOONS = [FLOOR.z - 1, FLOOR.z + FLOOR.d] as const;
const FESTOON_Y = 18;
const POLES = [FLOOR.x - 6, FLOOR.x + FLOOR.w + 4] as const;

const LAMP_POSTS = [58, 70] as const;

// Paved runs from each door across the lawn, so a door never opens onto a flower bed.
const FRONT_PATHS = [ANIMATOR_X - 4, 14, 105] as const;
const SIDE_PATH = { z0: 72, z1: 78 } as const;
const FRONT_BEDS = [
  [2, 12],
  [24, 58],
  [70, 103],
  [115, X - 3],
] as const;

const CYPRESSES = [
  [3, 3],
  [X - 7, 3],
  [14, 6],
  [20, 6],
  [X - 24, 6],
  [X - 18, 6],
] as const;

const LEMONS = [
  [53, 64],
  [X - 57, 64],
  [9, 26],
  [X - 13, 26],
] as const;

export default defineModel({
  id: 'open-air-stage-b',
  label: 'Open-Air Stage B',
  category: 'leisure',
  tiles: { x: 8, z: 6 },
  placement: { perResort: { min: 1, max: 2 } },
  emissive: [LAMP],
  lights: [
    // Under the pergola and over the floor and tables, not at each bulb: the bake has only points.
    { x: 46, y: 18, z: 14, color: LAMP, intensity: 100, distance: 56 },
    { x: 82, y: 18, z: 14, color: LAMP, intensity: 100, distance: 56 },
    { x: 40, y: FESTOON_Y - 2, z: 39, color: LAMP, intensity: 90, distance: 52 },
    { x: 88, y: FESTOON_Y - 2, z: 39, color: LAMP, intensity: 90, distance: 52 },
    { x: 28, y: 16, z: 75, color: LAMP, intensity: 80, distance: 48 },
    { x: 100, y: 16, z: 75, color: LAMP, intensity: 80, distance: 48 },
    { x: 58, y: 17, z: POST_Z, color: LAMP, intensity: 90, distance: 46 },
    { x: 70, y: 17, z: POST_Z, color: LAMP, intensity: 90, distance: 46 },
  ],
  seats: TABLE_SEATS,
  venue: {
    ...PLAZA_VENUE,
    names: [
      'The Pergola',
      'Teatro del Giardino',
      'Lemon Grove Stage',
      'Cypress Court',
      'Piazza Verde',
      'The Garden Stage',
      'Vine Terrace Stage',
      'The Orangery Stage',
      'Corte dei Fiori',
      'The Ivy Stage',
      'Giardino delle Stelle',
      'The Festoon Garden',
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, metal, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: X, d: Z, height: 2, stone: grass });
    const lawn = ground - 1;
    box(FIELD.x0, FIELD.x1, lawn, lawn, FIELD.z0, FIELD.z1, stone.base);
    for (const x of FRONT_PATHS) box(x, x + 8, lawn, lawn, FIELD.z1, Z - 1, stone.base);
    for (const [x0, x1] of [
      [0, FIELD.x0],
      [FIELD.x1, X - 1],
    ] as const) {
      box(x0, x1, lawn, lawn, SIDE_PATH.z0, SIDE_PATH.z1, stone.base);
    }
    box(
      FLOOR.x,
      FLOOR.x + FLOOR.w - 1,
      lawn,
      lawn,
      FLOOR.z,
      FLOOR.z + FLOOR.d - 1,
      terracotta.light,
    );

    const top = plinth(b, { ...STAGE, y: ground, height: 4, stone });
    if (ground !== GROUND || top !== DECK_TOP) {
      throw new Error('The plaza, the deck and their places must agree on the surfaces');
    }
    box(STAGE.x, STAGE_RIGHT, ground, top - 2, LIP, LIP, stone.shade);
    for (const x of FLIGHTS) {
      steps(b, { x, z: LIP + 1, w: FLIGHT_W, y: top - 1, treads: 4, descends: 'z+' });
    }

    box(STAGE.x, STAGE_RIGHT, top, WALL_TOP, STAGE.z, STAGE.z + 1, stucco.base);
    box(
      STAGE.x - 1,
      STAGE_RIGHT + 1,
      WALL_TOP,
      WALL_TOP,
      STAGE.z - 1,
      STAGE.z + 2,
      terracotta.base,
    );
    // Ivy up the wall in two big sheets: single leaves would cost a quad each.
    for (const x of [STAGE.x + 2, STAGE_RIGHT - 9]) {
      box(x, x + 7, top, WALL_TOP - 2, STAGE.z + 2, STAGE.z + 2, foliage.base);
      box(x + 2, x + 5, WALL_TOP - 1, WALL_TOP - 1, STAGE.z + 2, STAGE.z + 2, foliage.light);
    }

    for (const x of PERGOLA_POSTS) {
      box(x, x + 1, top, BEAM - 1, LIP - 1, LIP, teak.shade);
      const ivy = [Math.max(x - 1, STAGE.x), Math.min(x + 2, STAGE_RIGHT)] as const;
      box(ivy[0], ivy[1], top, top + 9, LIP - 2, LIP, foliage.base);
    }
    box(STAGE.x, STAGE_RIGHT, BEAM, BEAM + 1, LIP - 1, LIP, teak.base);
    for (const x of RAFTERS) box(x, x, BEAM + 2, BEAM + 2, STAGE.z - 1, LIP + 2, teak.shade);
    for (const [x0, x1, z0, z1] of [
      [STAGE.x + 1, STAGE.x + 16, STAGE.z, STAGE.z + 9],
      [56, 72, STAGE.z + 2, STAGE.z + 7],
      [STAGE_RIGHT - 18, STAGE_RIGHT - 1, STAGE.z + 4, LIP - 3],
    ] as const) {
      box(x0, x1, BEAM + 3, BEAM + 3, z0, z1, foliage.base);
      box(x0 + 2, x1 - 2, BEAM + 4, BEAM + 4, z0 + 2, z1 - 2, foliage.light);
    }
    for (const x of LANTERNS) {
      box(x, x, BEAM - 1, BEAM - 1, LIP - 1, LIP - 1, metal.deep);
      box(x, x + 1, BEAM - 3, BEAM - 2, LIP - 1, LIP, LAMP);
    }

    for (const x of POLES) {
      for (const z of FESTOONS) box(x, x, ground, FESTOON_Y + 1, z, z, teak.shade);
    }
    for (const z of FESTOONS) {
      box(POLES[0] + 1, POLES[1] - 1, FESTOON_Y + 1, FESTOON_Y + 1, z, z, stone.shade);
      for (let x = POLES[0] + 4; x < POLES[1] - 1; x += 4) b.set(x, FESTOON_Y, z, LAMP);
    }

    for (const [x, z] of CYPRESSES) clippedCypress(b, { x, z, y: ground });
    for (const [x, z] of LEMONS) pottedTree(b, { x, z, y: ground, pot: stucco, fruit: amber.base });
    planter(b, {
      x: FLIGHTS[0] + FLIGHT_W + 1,
      w: FLIGHTS[1] - FLIGHTS[0] - FLIGHT_W - 2,
      z: LIP + 1,
      y: ground,
      d: 2,
      box: stone,
      blooms: [bloom.light, stucco.light],
    });

    // Beside the stage only: further forward the outer chairs stand on the lawn.
    for (const x of [1, X - 7]) {
      planter(b, { x, z: 12, y: ground, w: 6, d: 23, box: grass, blooms: [bloom.base] });
    }
    for (const [x0, x1] of FRONT_BEDS) {
      planter(b, { x: x0, z: Z - 3, y: ground, w: x1 - x0 + 1, d: 2, box: grass });
    }

    fourTops(b, { top: stucco.light, leg: metal.deep, seat: bloom.base, rail: bloom.shade });

    for (const x of LAMP_POSTS) lampPost(b, x, stone.shade);
  },
});
