import { PALETTE } from '../palette.ts';
import type { Color, ModelSeat, ModelSpot, ModelVenue, VoxelBuilder } from '../voxelgen.ts';

export const X = 128;
export const Z = 96;

// Duplicated from what the plinths in `build` return, because the declarations cannot read a
// local; each style's `build` checks the two agree.
export const GROUND = 2;
export const DECK_TOP = 6;

// At the back, so the 30-degree camera sees it over the crowd and it hides nothing.
export const STAGE = { x: 28, z: 4, w: 72, d: 20 } as const;
export const LIP = STAGE.z + STAGE.d - 1;
export const STAGE_RIGHT = STAGE.x + STAGE.w - 1;

export const FLIGHTS = [30, 92] as const;
export const FLIGHT_W = 6;

// The only lit amber in either style, so the lamps read as lit.
export const LAMP = PALETTE.amber.light;
export const POST_Z = 90;

export const FLOOR = { x: 16, z: 33, w: 96, d: 12, y: GROUND } as const;

const ROWS = [48, 52, 56, 60] as const;

const SPECTATORS: readonly ModelSpot[] = ROWS.flatMap((z, row) =>
  Array.from(
    { length: 8 },
    (_, at) => ({ x: 36 + (row % 2) * 4 + at * 8, y: GROUND, z, facing: 2 }) as const,
  ),
);

// Turned a quarter from the coffee shop's table, so nobody sits with their back to the stage.
const TABLE_ROWS = [66, 78] as const;
const TABLES = [8, 26, 44, 80, 98, 116] as const;
const west = (x0: number): number => x0 - 3;
const east = (x0: number): number => x0 + 5;
const CHAIRS = [1, 5] as const;

export const TABLE_SEATS: readonly ModelSeat[] = TABLE_ROWS.flatMap((top) =>
  TABLES.flatMap((x0) =>
    CHAIRS.flatMap((dz) => [
      { x: west(x0), y: GROUND + 2, z: top + dz, facing: 1 as const },
      { x: east(x0), y: GROUND + 2, z: top + dz, facing: 3 as const },
    ]),
  ),
);

// The plaza's line watches from its edges, outside the floor and in front of the tables.
const LINE_X = [5, X - 6] as const;
const LINE: readonly ModelSpot[] = LINE_X.flatMap((x) =>
  [40, 44, 48, 52, 56, 60].map((z) => ({ x, y: GROUND, z, facing: 2, for: 'watcher' }) as const),
);

export const ANIMATOR_X = 64;
const CLEANER_X = 120;

// Every style's, so a style is only a look and stands in for the original wherever it is built.
export const PLAZA_VENUE = {
  role: 'activity',
  shelter: 'open',
  sign: 'stage',
  stage: true,
  satisfies: [{ need: 'fun', amount: 0.6 }],
  capacity: 80,
  dwellSeconds: { min: 1800, max: 5400 },
  spots: [
    ...SPECTATORS,
    ...LINE,
    { x: ANIMATOR_X, y: DECK_TOP, z: 18, facing: 0, for: 'animator' },
    { x: CLEANER_X, y: GROUND, z: POST_Z, facing: 2, for: 'staff' },
  ],
  // Seated first: the dancers of a show come from the chairs.
  order: ['seats', 'spots'],
  floor: FLOOR,
  // The middle one first: the sign stands over doors[0].
  doors: [
    { x: ANIMATOR_X, z: Z - 1, facing: 0 },
    { x: 18, z: Z - 1, facing: 0 },
    { x: 109, z: Z - 1, facing: 0 },
    { x: 0, z: 75, facing: 3 },
    { x: X - 1, z: 75, facing: 1 },
  ],
} as const satisfies Omit<ModelVenue, 'names'>;

export interface TableLook {
  readonly top: Color;
  readonly leg: Color;
  readonly seat: Color;
  readonly rail: Color;
}

// The coffee shop's chair turned a quarter: the seat course at ground + 1 puts the hips on
// ground + 2, which is what the seats declare.
export function fourTops(b: VoxelBuilder, look: TableLook): void {
  const chair = (x: number, z: number, rail: number): void => {
    b.box(x, x + 1, GROUND, GROUND + 1, z - 1, z + 1, look.seat);
    b.box(rail, rail, GROUND + 2, GROUND + 3, z - 1, z + 1, look.rail);
  };
  for (const z0 of TABLE_ROWS) {
    for (const x0 of TABLES) {
      for (const dz of CHAIRS) {
        b.box(x0 + 1, x0 + 2, GROUND, GROUND + 2, z0 + dz, z0 + dz + 1, look.leg);
        chair(west(x0), z0 + dz, west(x0) - 1);
        chair(east(x0), z0 + dz, east(x0) + 2);
      }
      b.box(x0, x0 + 3, GROUND + 3, GROUND + 3, z0, z0 + 6, look.top);
    }
  }
}

// Like a street lamp: the head is the model's lit colour, at y + 15 and y + 16.
export function lampPost(b: VoxelBuilder, x: number, foot: Color): void {
  const { metal } = PALETTE;
  b.box(x, x + 1, GROUND, GROUND, POST_Z, POST_Z + 1, foot);
  b.box(x, x + 1, GROUND + 1, GROUND + 14, POST_Z, POST_Z + 1, metal.base);
  b.box(x, x + 1, GROUND + 15, GROUND + 16, POST_Z, POST_Z + 1, LAMP);
  b.box(x, x + 1, GROUND + 17, GROUND + 17, POST_Z, POST_Z + 1, metal.deep);
}
