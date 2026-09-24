import { PALETTE } from '../palette.ts';
import { parasol } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { x1: 95, z1: 63 } as const;

const COURT = { x0: 16, x1: 79, z0: 16, z1: 47 } as const;

const SURFACE = 0;
const GROUND = SURFACE + 1;

const POST = { x: 47, x1: 48 } as const;

const POST_HEIGHT = 11;

const NET_HEIGHT = 4;

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

    const top = GROUND + POST_HEIGHT - 1;
    for (const z of [COURT.z0 - 5, COURT.z1 + 4]) {
      box(POST.x, POST.x1, GROUND, top, z, z + 1, teak.base);
    }

    // A net of strands would be a dither costing more triangles than a hotel, so it is a
    // solid band, kept thin and dark or it reads as a wall across the court.
    const tape = top - 1;
    const netZ0 = COURT.z0 - 3;
    const netZ1 = COURT.z1 + 3;
    box(POST.x, POST.x, tape - NET_HEIGHT + 1, tape - 1, netZ0, netZ1, stucco.shade);
    box(POST.x, POST.x, tape, tape, netZ0, netZ1, stucco.light);

    box(28, 29, GROUND, GROUND + 1, 30, 31, stucco.light);
    box(28, 29, GROUND, GROUND + 1, 30, 30, bloom.base);

    box(86, 87, GROUND, GROUND + 1, 22, 22, teak.shade);
    box(86, 87, GROUND, GROUND + 1, 33, 33, teak.shade);
    box(86, 87, GROUND + 2, GROUND + 2, 22, 33, teak.base);
    parasol(b, { x: 90, z: 42, y: GROUND, reach: 3 });
    box(88, 89, GROUND, GROUND + 1, 44, 45, bloom.base);
  },
});
