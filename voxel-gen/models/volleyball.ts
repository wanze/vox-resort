import { PALETTE } from '../palette.ts';
import { parasol } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { x1: 95, z1: 63 } as const;

const COURT = { x0: 16, x1: 79, z0: 16, z1: 47 } as const;

const SURFACE = 0;
const GROUND = SURFACE + 1;

const POST = { x: 47, x1: 48 } as const;

const POST_HEIGHT = 11;
const POST_TOP = GROUND + POST_HEIGHT - 1;
const TAPE = POST_TOP - 1;

const NET_HEIGHT = 4;

const game = 'volleyball' as const;

const FRONT = 8;
const BACK = 22;
const LANES = [COURT.z0 + 5, (COURT.z0 + COURT.z1 + 1) / 2, COURT.z1 - 5] as const;

// Each place is filled on both sides of the net at once; the back corners first, so four
// guests make a game of two against two.
const ROLES = [
  { d: BACK, z: LANES[0] },
  { d: BACK, z: LANES[2] },
  { d: FRONT, z: LANES[1] },
  { d: BACK, z: LANES[1] },
  { d: FRONT, z: LANES[0] },
  { d: FRONT, z: LANES[2] },
] as const;

const PLAYERS = ROLES.flatMap(({ d, z }) => [
  { x: POST.x - d, y: GROUND, z, facing: 1 as const, game, side: 0 as const },
  {
    x: POST.x1 + d,
    y: GROUND,
    z: COURT.z0 + COURT.z1 - z,
    facing: 3 as const,
    game,
    side: 1 as const,
  },
]);

const BENCH = { x0: 86, x1: 87, z0: 22, z1: 33, plank: GROUND + 2 } as const;

const SIDELINES = [
  { z: COURT.z0 - 3, facing: 0 },
  { z: COURT.z1 + 3, facing: 2 },
] as const;
const WATCHERS_X = [POST.x - 23, POST.x - 11, POST.x1 + 11, POST.x1 + 23] as const;

export default defineModel({
  id: 'volleyball',
  label: 'Volleyball Court',
  category: 'leisure',
  placement: { ground: 'beach', perResort: { min: 1, max: 3 } },
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ],
    capacity: 12,
    dwellSeconds: { min: 1200, max: 2700 },
    spots: [
      ...PLAYERS,
      // Beside the north net post, facing it.
      { x: POST.x - 2, y: GROUND, z: COURT.z0 - 5, facing: 1, for: 'staff' },
      // Spots, not seats: a seat joins the walk network, and a passer-by sitting down on it
      // would move every seeded replay.
      ...Array.from({ length: 4 }, (_, i) => ({
        x: BENCH.x1,
        y: BENCH.plank + 1,
        z: BENCH.z0 + 1 + 3 * i,
        facing: 3 as const,
        pose: 'sit' as const,
        for: 'watcher' as const,
      })),
      ...SIDELINES.flatMap(({ z, facing }) =>
        WATCHERS_X.map((x) => ({
          x,
          y: GROUND,
          z,
          facing,
          for: 'watcher' as const,
        })),
      ),
    ],
    // Played over the head, set and spiked from there.
    ball: { model: 'ball-volley', y: GROUND + 7 },
    court: { ...COURT, net: { x: POST.x, top: TAPE } },
  },
  tiles: { x: 6, z: 4 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, sand, stucco, teak } = PALETTE;

    // One course with no lip, so the court reads as flush with the beach. Not zero courses:
    // blob shadows rely on the object's own ground plate to hide the half under it.
    box(0, PLOT.x1, SURFACE, SURFACE, 0, PLOT.z1, sand.base);

    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z0, stucco.light);
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z1, COURT.z1, stucco.light);
    box(COURT.x0, COURT.x0, SURFACE, SURFACE, COURT.z0, COURT.z1, stucco.light);
    box(COURT.x1, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, stucco.light);

    for (const z of [COURT.z0 - 5, COURT.z1 + 4]) {
      box(POST.x, POST.x1, GROUND, POST_TOP, z, z + 1, teak.base);
    }

    // A net of strands would be a dither costing more triangles than a hotel, so it is a
    // solid band, kept thin and dark or it reads as a wall across the court.
    const tape = TAPE;
    const netZ0 = COURT.z0 - 3;
    const netZ1 = COURT.z1 + 3;
    box(POST.x, POST.x, tape - NET_HEIGHT + 1, tape - 1, netZ0, netZ1, stucco.shade);
    box(POST.x, POST.x, tape, tape, netZ0, netZ1, stucco.light);

    box(28, 29, GROUND, GROUND + 1, 30, 31, stucco.light);
    box(28, 29, GROUND, GROUND + 1, 30, 30, bloom.base);

    for (const z of [BENCH.z0, BENCH.z1]) {
      box(BENCH.x0, BENCH.x1, GROUND, BENCH.plank - 1, z, z, teak.shade);
    }
    box(BENCH.x0, BENCH.x1, BENCH.plank, BENCH.plank, BENCH.z0, BENCH.z1, teak.base);
    parasol(b, { x: 90, z: 42, y: GROUND, reach: 3 });
    box(88, 89, GROUND, GROUND + 1, 44, 45, bloom.base);
  },
});
