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
      box(x0 + 1, x1 - 1, GROUND, GROUND + 1, DUGOUT.back + 1, DUGOUT.back + 2, teak.light);
      box(x0 - 1, x1 + 1, DUGOUT.eaves, DUGOUT.eaves, DUGOUT.back - 1, DUGOUT.front, thatch.base);
    }
    const seat = GROUND + 2;
    box(DUGOUTS[0] + 3, DUGOUTS[0] + 5, seat, seat, DUGOUT.back + 1, DUGOUT.back + 2, stucco.light);
    box(DUGOUTS[1] + 8, DUGOUTS[1] + 10, seat, seat, DUGOUT.back + 1, DUGOUT.back + 2, bloom.base);
    const cooler = DUGOUTS[1] + DUGOUT.w + 1;
    box(cooler, cooler + 2, GROUND, GROUND + 1, 6, 8, water.light);
    box(cooler, cooler + 2, GROUND + 2, GROUND + 2, 6, 8, stucco.light);

    box(60, 61, GROUND, GROUND, 38, 39, water.light);
    box(60, 61, GROUND + 1, GROUND + 1, 38, 39, amber.base);
  },
});
