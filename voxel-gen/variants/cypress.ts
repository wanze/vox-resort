import { noise } from '../models/foliage.ts';
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 15;

// Set on the diagonal the camera looks across, so both spires show side by side.
const SPIRES = [
  { x: 5, z: 5, top: 48, reach: 3.0, salt: 3 },
  { x: 10, z: 10, top: 36, reach: 2.5, salt: 11 },
] as const;

function spire(
  b: VoxelBuilder,
  cx: number,
  cz: number,
  foot: number,
  top: number,
  reach: number,
  salt: number,
): void {
  const { foliage } = PALETTE;
  for (let y = foot; y <= top; y++) {
    const t = (y - foot) / (top - foot);
    // Swells low and draws to a point, the flame shape of an Italian cypress.
    const r = reach * Math.min(1, 0.45 + t * 5) * (1 - t) ** 0.5;
    const k = Math.ceil(r);
    for (let dz = -k; dz <= k; dz++) {
      for (let dx = -k; dx <= k; dx++) {
        const grain = noise(cx + dx, y, cz + dz, salt);
        if (Math.hypot(dx, dz) > r + (grain - 0.5) * 0.6) continue;
        // Tufts of the lighter green only on the rim, and only in runs of a few
        // courses, so the mesher still merges the face into strips.
        const band = noise(cx + dx, Math.floor(y / 3), cz + dz, salt + 5);
        const rim = Math.hypot(dx, dz) > r - 1;
        const leaf = rim && band < 0.3 ? foliage.base : foliage.shade;
        b.set(Math.min(EDGE, Math.max(0, cx + dx)), y, Math.min(EDGE, Math.max(0, cz + dz)), leaf);
      }
    }
  }
}

export default defineModel({
  id: 'cypress-b',
  label: 'Cypress B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { sand, stone, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2, stone: sand });

    b.box(2, 13, ground, ground, 2, 13, stone.base);
    b.box(3, 12, ground, ground, 3, 12, teak.deep);

    for (const { x, z, top, reach, salt } of SPIRES) {
      b.box(x, x, ground + 1, ground + 2, z, z, teak.shade);
      spire(b, x, z, ground + 2, top, reach, salt);
    }
  },
});
