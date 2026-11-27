import { PALETTE } from '../../palette.ts';
import { TILE_VOXELS, type VoxelBuilder } from '../../voxelgen.ts';
import type { Footprint, RunStyle } from '../pieces.ts';

// About 1.6 m once the foot sinks into the terrain: a trimmed hedge is taller than it is deep.
const COURSES = 7;

const LAST = TILE_VOXELS - 1;

const widened = (from: number, by: number): number => Math.min(LAST, Math.max(0, from + by));

// Deliberately plain: hedges are placed about a thousand times a plot, and whole boxes keep each
// flank one rectangle for the mesher.
function paint(b: VoxelBuilder, { x0, x1, z0, z1 }: Footprint): void {
  const { foliage, teak } = PALETTE;
  const top = COURSES - 1;
  b.box(widened(x0, -1), widened(x1, 1), 0, 0, widened(z0, -1), widened(z1, 1), teak.deep);
  b.box(x0, x1, 1, top - 1, z0, z1, foliage.shade);
  b.box(x0, x1, top, top, z0, z1, foliage.base);
}

// Four voxels, 1 m: the narrowest that still sits centred on 16.
export const hedge: RunStyle = {
  id: 'hedge',
  label: 'Hedge',
  cost: 20,
  scenery: 0.3,
  span: { lo: 6, hi: 9 },
  paint,
};
