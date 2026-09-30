import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { x1: 95, z1: 63 } as const;

// 16 x 8 m, pushed to the front so the benches and the umpire get the back margin,
// where they stand behind the play instead of in front of it.
const COURT = { x0: 16, x1: 79, z0: 20, z1: 51 } as const;

const SURFACE = 0;
const GROUND = SURFACE + 1;

const NET_X = 47;
const POST_TOP = GROUND + 10;
const POSTS_Z = [COURT.z0 - 4, COURT.z1 + 3] as const;

const CHAIR = { x0: 45, x1: 50, z0: 8, z1: 12, deck: GROUND + 7 } as const;

const DUGOUTS = [22, 59] as const;
const DUGOUT = { w: 15, back: 3, front: 9, eaves: GROUND + 10 } as const;
const BENCH = GROUND + 1;
// Where along each dugout's bench a towel lies, one course deep; who sits there sits on it.
const TOWELS = [3, 8] as const;
const SITTERS = [1, 5, 9, 13] as const;

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
  { x: NET_X - d, y: GROUND, z, facing: 1 as const },
  { x: NET_X + 1 + d, y: GROUND, z: COURT.z0 + COURT.z1 - z, facing: 3 as const },
]);

// The dugouts seat eight; the rest watch from the front sideline, clear of the umpire.
const WATCHERS_X = [NET_X - 23, NET_X - 11, NET_X + 12, NET_X + 24] as const;

export default defineModel({
  id: 'volleyball-b',
  label: 'Volleyball Court B',
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
      // Spots, not seats: a seat joins the walk network, and a passer-by sitting down on it
      // would move every seeded replay.
      ...DUGOUTS.flatMap((x0, i) =>
        SITTERS.map((along) => {
          const onTowel = along >= TOWELS[i]! && along <= TOWELS[i]! + 2;
          return {
            x: x0 + along,
            y: BENCH + (onTowel ? 2 : 1),
            z: DUGOUT.back + 1,
            facing: 0 as const,
            pose: 'sit' as const,
            for: 'watcher' as const,
          };
        }),
      ),
      ...WATCHERS_X.map((x) => ({
        x,
        y: GROUND,
        z: COURT.z1 + 3,
        facing: 2 as const,
        for: 'watcher' as const,
      })),
    ],
  },
  tiles: { x: 6, z: 4 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, metal, sand, stucco, teak, thatch, water } = PALETTE;

    // One course, flush with the beach: blob shadows need the model's own ground plate.
    box(0, PLOT.x1, SURFACE, SURFACE, 0, PLOT.z1, sand.base);
    // Raked playing sand is a different material from the beach round it.
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, sand.light);
    // Blue tape, as tournaments lay it, so this court does not read as a repaint of the white one.
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z0, water.light);
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z1, COURT.z1, water.light);
    box(COURT.x0, COURT.x0, SURFACE, SURFACE, COURT.z0, COURT.z1, water.light);
    box(COURT.x1, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, water.light);

    for (const z of POSTS_Z) box(NET_X, NET_X + 1, GROUND, POST_TOP, z, z + 1, bloom.base);
    const tape = POST_TOP - 1;
    box(NET_X, NET_X, tape - 3, tape - 1, POSTS_Z[0] + 2, POSTS_Z[1] - 1, metal.light);
    box(NET_X, NET_X, tape, tape, POSTS_Z[0] + 2, POSTS_Z[1] - 1, stucco.light);
    for (const z of [COURT.z0, COURT.z1]) box(NET_X, NET_X, tape + 1, tape + 4, z, z, stucco.light);

    for (const x of [CHAIR.x0, CHAIR.x1]) {
      box(x, x, GROUND, CHAIR.deck - 1, CHAIR.z0, CHAIR.z1, teak.base);
    }
    box(CHAIR.x0, CHAIR.x1, CHAIR.deck, CHAIR.deck, CHAIR.z0, CHAIR.z1, teak.shade);
    box(CHAIR.x0 + 1, CHAIR.x1 - 1, CHAIR.deck + 1, CHAIR.deck + 4, CHAIR.z0, CHAIR.z0, teak.base);
    box(CHAIR.x0, CHAIR.x1, CHAIR.deck + 1, CHAIR.deck + 2, CHAIR.z1, CHAIR.z1, stucco.light);

    // The reed screen carries the roof on its own, a lean-to rather than a pavilion: each post
    // would be a hole the mesher splits the sand plate and the thatch round.
    for (const x0 of DUGOUTS) {
      const x1 = x0 + DUGOUT.w - 1;
      box(x0, x1, GROUND, DUGOUT.eaves - 1, DUGOUT.back, DUGOUT.back, thatch.shade);
      box(x0 + 1, x1 - 1, GROUND, BENCH, DUGOUT.back + 1, DUGOUT.back + 2, teak.light);
      box(x0 - 1, x1 + 1, DUGOUT.eaves, DUGOUT.eaves, DUGOUT.back - 1, DUGOUT.front, thatch.base);
    }
    const towel = BENCH + 1;
    for (const [i, color] of [stucco.light, bloom.base].entries()) {
      const x0 = DUGOUTS[i]! + TOWELS[i]!;
      box(x0, x0 + 2, towel, towel, DUGOUT.back + 1, DUGOUT.back + 2, color);
    }
    const cooler = DUGOUTS[1] + DUGOUT.w + 1;
    box(cooler, cooler + 2, GROUND, GROUND + 1, 6, 8, water.light);
    box(cooler, cooler + 2, GROUND + 2, GROUND + 2, 6, 8, stucco.light);

    box(60, 61, GROUND, GROUND, 38, 39, water.light);
    box(60, 61, GROUND + 1, GROUND + 1, 38, 39, amber.base);
  },
});
