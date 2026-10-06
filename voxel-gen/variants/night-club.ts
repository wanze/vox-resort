import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type ModelSpot, type VoxelBuilder } from '../voxelgen.ts';

const NEON_PINK = PALETTE.bloom.base;
const NEON_CYAN = PALETTE.water.base;

const PLOT = { x: 64, z: 48 } as const;

// Five up, as the original: a banquette this high is out of a passer-by's reach from the
// paving (walkNetwork's SEAT_RISE), so nobody sits in the club while it is shut.
const GROUND = 5;
const APRON = { z: 40, top: 2 } as const;

const WALLS = { x: 2, x1: 61, z: 2, z1: 37 } as const;
const EAVES = GROUND + 10;

// Only the bandshell over the booth is roofed: no roof is cut away for the camera, and a
// dance floor under one would be danced on unseen.
const SHELL_Z1 = 12;
const CROWN = { x: 18, x1: 45 } as const;

// The side walls step down towards the street, so the camera looks over them into the club.
const FLANKS = [
  { z: WALLS.z, z1: SHELL_Z1, top: EAVES },
  { z: SHELL_Z1 + 1, z1: 24, top: GROUND + 7 },
  { z: 25, z1: WALLS.z1, top: GROUND + 4 },
] as const;

const OPENING = { x: 26, x1: 37 } as const;
const FLIGHT = { x: 28, w: 8 } as const;
const PANEL = { x: 21, x1: 42, y: GROUND + 8, y1: GROUND + 14 } as const;

const FLOOR = { x: 20, z: 14, w: 24, d: 16, y: GROUND } as const;
const FLOOR_TILE = 4;

const BOOTH = { x: 26, x1: 37, z: 7, z1: 9 } as const;
const DJ_SPOT: ModelSpot = { x: 32, y: GROUND, z: 5, facing: 0, for: 'animator' };

const BAR = { x: 7, x1: 9, z: 12, z1: 35 } as const;
const SHELF_X = WALLS.x + 2;
const STOOL_X = BAR.x1 + 3;
const STOOLS = Array.from({ length: 8 }, (_, stool) => BAR.z + 1 + stool * 3);
const STOOL_HIPS = GROUND + 3;

const BOOTHS = { x: 49, x1: 59, z: [13, 24] } as const;
const BOOTH_SEATS = [51, 54, 57] as const;
const SOFA_HIPS = GROUND + 2;

const STANDING: readonly ModelSpot[] = [
  ...[18, 21, 24, 27, 30, 33, 36, 39, 42, 45].map((x) => ({ x, z: FLOOR.z + FLOOR.d + 1 })),
  ...[15, 18, 21, 24, 27].flatMap((z) => [
    { x: FLOOR.x - 3, z },
    { x: FLOOR.x + FLOOR.w + 2, z },
  ]),
].map(({ x, z }) => ({ x, y: GROUND, z, facing: 2 }));

const LINE: readonly ModelSpot[] = [4, 8, 12, 16, 20, 24, 39, 43, 47, 51, 55, 59].map((x) => ({
  x,
  y: APRON.top,
  z: 44,
  facing: 2,
  for: 'watcher',
}));

const CLEANER_SPOT: ModelSpot = { x: SHELF_X + 1, y: GROUND, z: 24, facing: 1, for: 'staff' };

// Three wide and five high, one voxel between them: the panel over the gate reads DISCO.
const LETTERS = [
  ['##.', '#.#', '#.#', '#.#', '##.'],
  ['###', '.#.', '.#.', '.#.', '###'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '#..', '#..', '###'],
  ['###', '#.#', '#.#', '#.#', '###'],
] as const;

export default defineModel({
  id: 'night-club-b',
  label: 'Night Club B',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  placement: { perResort: { min: 1, max: 1 } },
  emissive: [NEON_PINK, NEON_CYAN],
  seats: [
    ...STOOLS.map((z) => ({ x: STOOL_X, y: STOOL_HIPS, z, facing: 3 }) as const),
    ...BOOTHS.z.flatMap((z0) =>
      BOOTH_SEATS.flatMap(
        (x) =>
          [
            { x, y: SOFA_HIPS, z: z0 + 1, facing: 0 },
            { x, y: SOFA_HIPS, z: z0 + 8, facing: 2 },
          ] as const,
      ),
    ),
  ],
  lights: [
    { x: 32, y: 14, z: 22, color: NEON_PINK, intensity: 90, distance: 56 },
    { x: 11, y: 13, z: 24, color: NEON_CYAN, intensity: 70, distance: 40 },
    { x: 32, y: 11, z: 42, color: NEON_CYAN, intensity: 70, distance: 40 },
  ],
  venue: {
    role: 'activity',
    sign: 'nightclub',
    names: [
      'Disco Riviera',
      'Club Mirage',
      'The Palm Room',
      'Discoteca Stella',
      'The Starlight',
      'Copacabana',
      'Club Flamingo',
      'The Silver Ball',
      'Sala Azzurra',
      'Discoteca Faro',
      'The Lido Club',
      'Club Paradiso',
    ],
    hours: { opens: 20 * 60, closes: 2 * 60 },
    dj: true,
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'thirst', amount: 0.3 },
      { need: 'energy', amount: -0.2 },
    ],
    capacity: 40,
    dwellSeconds: { min: 2700, max: 7200 },
    price: 8,
    litter: 0.04,
    reliability: 60,
    floor: FLOOR,
    order: ['seats', 'spots'],
    spots: [...STANDING, ...LINE, DJ_SPOT, CLEANER_SPOT],
    doors: [{ x: 32, z: PLOT.z - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, stone, stucco, teak, terracotta } = PALETTE;

    const top = plinth(b, { x: 0, z: 0, w: PLOT.x, d: APRON.z, height: GROUND, stone });
    if (top !== GROUND) throw new Error('The podium and the seats must agree on its surface');
    const apron = plinth(b, {
      x: 0,
      z: APRON.z,
      w: PLOT.x,
      d: PLOT.z - APRON.z,
      height: 2,
      stone,
    });
    if (apron !== APRON.top) throw new Error('The apron and the line must agree on its surface');
    steps(b, { ...FLIGHT, z: APRON.z, y: GROUND - 1, treads: 3, descends: 'z+' });

    const floor = GROUND - 1;
    box(WALLS.x + 2, WALLS.x1 - 2, floor, floor, WALLS.z + 2, WALLS.z1 - 2, stone.shade);
    box(FLOOR.x - 1, FLOOR.x + FLOOR.w, floor, floor, FLOOR.z - 1, FLOOR.z + FLOOR.d, metal.base);
    for (let i = 0; i < FLOOR.w / FLOOR_TILE; i++) {
      for (let j = 0; j < FLOOR.d / FLOOR_TILE; j++) {
        const lit = (i + j) % 2 === 1;
        const color = !lit ? stone.light : j % 2 === 0 ? NEON_PINK : NEON_CYAN;
        const x = FLOOR.x + i * FLOOR_TILE;
        const z = FLOOR.z + j * FLOOR_TILE;
        box(x, x + FLOOR_TILE - 1, floor, floor, z, z + FLOOR_TILE - 1, color);
      }
    }

    const wall = stucco.light;
    box(WALLS.x, WALLS.x1, GROUND, EAVES, WALLS.z, WALLS.z + 1, wall);
    for (const x of [WALLS.x, WALLS.x1 - 1]) {
      for (const flank of FLANKS) {
        box(x, x + 1, GROUND, flank.top - 1, flank.z, flank.z1, wall);
        box(x, x + 1, flank.top, flank.top, flank.z, flank.z1, terracotta.base);
      }
    }
    for (const x of [WALLS.x - 1, WALLS.x1 + 1]) {
      for (const flank of FLANKS.slice(0, -1)) {
        box(x, x, GROUND, flank.top, flank.z1 - 1, flank.z1, stucco.base);
        box(x, x, flank.top + 1, flank.top + 1, flank.z1 - 1, flank.z1, terracotta.deep);
      }
    }

    for (const [x0, x1] of [
      [WALLS.x, OPENING.x - 3],
      [OPENING.x1 + 3, WALLS.x1],
    ] as const) {
      box(x0, x1, GROUND, GROUND + 2, WALLS.z1 - 1, WALLS.z1, wall);
      box(x0, x1, GROUND + 3, GROUND + 3, WALLS.z1 - 1, WALLS.z1, terracotta.base);
    }

    // A deco proscenium: the shell's mouth steps up towards the middle, outlined in pink.
    box(WALLS.x, WALLS.x1, EAVES + 1, EAVES + 1, WALLS.z, SHELL_Z1, terracotta.base);
    box(WALLS.x, WALLS.x1, EAVES + 1, EAVES + 1, SHELL_Z1, SHELL_Z1, terracotta.deep);
    box(CROWN.x, CROWN.x1, EAVES + 2, EAVES + 2, WALLS.z, SHELL_Z1 - 1, terracotta.light);
    box(CROWN.x, CROWN.x1, EAVES + 2, EAVES + 2, SHELL_Z1 - 1, SHELL_Z1 - 1, NEON_CYAN);
    for (const [x0, x1, drop] of [
      [WALLS.x + 2, CROWN.x - 7, 3],
      [CROWN.x - 6, CROWN.x - 1, 2],
      [CROWN.x1 + 1, CROWN.x1 + 6, 2],
      [CROWN.x1 + 7, WALLS.x1 - 2, 3],
      [CROWN.x, CROWN.x1, 1],
    ] as const) {
      box(x0, x1, EAVES - drop + 1, EAVES, SHELL_Z1, SHELL_Z1, wall);
      box(x0, x1, EAVES - drop, EAVES - drop, SHELL_Z1, SHELL_Z1, NEON_PINK);
    }
    const ball = { x: 31, y: EAVES - 5 } as const;
    box(ball.x, ball.x + 1, ball.y + 2, EAVES - 2, SHELL_Z1, SHELL_Z1, metal.base);
    box(ball.x, ball.x + 1, ball.y, ball.y + 1, SHELL_Z1, SHELL_Z1 + 1, glass.light);

    for (const x of [OPENING.x - 2, OPENING.x1 + 1]) {
      box(x, x + 1, GROUND, PANEL.y - 1, WALLS.z1 - 1, WALLS.z1, wall);
      box(x, x, GROUND + 1, PANEL.y - 1, WALLS.z1 + 1, WALLS.z1 + 1, NEON_CYAN);
    }
    box(PANEL.x, PANEL.x1, PANEL.y, PANEL.y1, WALLS.z1 - 1, WALLS.z1, metal.deep);
    for (const y of [PANEL.y, PANEL.y1]) {
      box(PANEL.x, PANEL.x1, y, y, WALLS.z1, WALLS.z1, NEON_CYAN);
    }
    box(PANEL.x + 4, PANEL.x1 - 4, PANEL.y1 + 1, PANEL.y1 + 1, WALLS.z1 - 1, WALLS.z1, wall);
    box(PANEL.x + 8, PANEL.x1 - 8, PANEL.y1 + 2, PANEL.y1 + 2, WALLS.z1 - 1, WALLS.z1, wall);
    for (const [index, letter] of LETTERS.entries()) {
      const x0 = PANEL.x + 2 + index * 4;
      for (const [row, line] of letter.entries()) {
        for (const [column, mark] of [...line].entries()) {
          if (mark === '#') b.set(x0 + column, PANEL.y1 - 2 - row, WALLS.z1, NEON_PINK);
        }
      }
    }

    box(BOOTH.x, BOOTH.x1, GROUND, GROUND + 1, BOOTH.z, BOOTH.z1, stucco.base);
    box(BOOTH.x, BOOTH.x1, GROUND + 2, GROUND + 2, BOOTH.z, BOOTH.z1, terracotta.deep);
    box(BOOTH.x, BOOTH.x1, GROUND + 1, GROUND + 1, BOOTH.z1, BOOTH.z1, NEON_PINK);
    for (const x of [BOOTH.x + 2, BOOTH.x1 - 4]) {
      box(x, x + 2, GROUND + 3, GROUND + 3, BOOTH.z, BOOTH.z + 1, metal.deep);
    }
    for (const x of [BOOTH.x - 6, BOOTH.x1 + 4]) {
      box(x, x + 2, GROUND, GROUND + 6, WALLS.z + 2, WALLS.z + 4, metal.deep);
      box(x + 1, x + 1, GROUND + 2, GROUND + 4, WALLS.z + 5, WALLS.z + 5, metal.base);
      box(x, x + 2, GROUND + 7, GROUND + 7, WALLS.z + 2, WALLS.z + 4, NEON_CYAN);
    }

    box(BAR.x, BAR.x1, GROUND, GROUND + 2, BAR.z, BAR.z1, stucco.base);
    box(BAR.x1, BAR.x1, GROUND + 1, GROUND + 1, BAR.z, BAR.z1, NEON_CYAN);
    box(BAR.x, BAR.x1, GROUND + 3, GROUND + 3, BAR.z, BAR.z1, teak.light);
    box(SHELF_X, SHELF_X, GROUND + 4, GROUND + 4, BAR.z + 2, BAR.z1 - 2, teak.shade);
    const BOTTLES = [foliage.base, amber.base, glass.base] as const;
    for (let bottle = 0; bottle < 7; bottle++) {
      const z = BAR.z + 3 + bottle * 3;
      box(SHELF_X, SHELF_X, GROUND + 5, GROUND + 6, z, z, BOTTLES[bottle % BOTTLES.length]!);
    }
    for (const z of STOOLS) {
      box(STOOL_X - 1, STOOL_X, GROUND, GROUND + 1, z, z + 1, metal.base);
      box(STOOL_X - 1, STOOL_X, GROUND + 2, GROUND + 2, z, z + 1, bloom.deep);
    }

    for (const z0 of BOOTHS.z) {
      for (const [back, cushion] of [
        [z0, [z0 + 1, z0 + 2]],
        [z0 + 9, [z0 + 7, z0 + 8]],
      ] as const) {
        box(BOOTHS.x, BOOTHS.x1, GROUND, GROUND + 3, back, back, teak.deep);
        box(BOOTHS.x, BOOTHS.x1, GROUND, GROUND, cushion[0], cushion[1], teak.deep);
        box(BOOTHS.x, BOOTHS.x1, GROUND + 1, GROUND + 1, cushion[0], cushion[1], bloom.deep);
      }
      box(BOOTHS.x1, BOOTHS.x1, GROUND, GROUND + 3, z0 + 1, z0 + 8, teak.deep);
      box(BOOTHS.x + 1, BOOTHS.x1 - 2, GROUND, GROUND, z0 + 4, z0 + 5, metal.base);
      box(BOOTHS.x + 1, BOOTHS.x1 - 2, GROUND + 1, GROUND + 1, z0 + 4, z0 + 5, stone.light);
      b.set(54, GROUND + 2, z0 + 4, amber.light);
    }

    for (const x of [FLIGHT.x - 3, FLIGHT.x + FLIGHT.w + 1]) {
      pottedPlant(b, { x, z: APRON.z + 1, y: APRON.top });
    }
  },
});
