import { PALETTE } from '../../palette.ts';
import type { Color } from '../../voxelgen.ts';
import { inside, type MosaicStyle } from '../pieces.ts';

// Mediterranean quarry tiles: four to a tile, blue inserts where their corners meet.
function quadrant(x: number, z: number): Color | null {
  if (x === 7 && z === 7) return PALETTE.water.shade;
  if (x === 0 && z === 0) return PALETTE.water.shade;
  if (inside(x, 2, 5) && inside(z, 2, 5)) return PALETTE.terracotta.light;
  return null;
}

export const terracotta: MosaicStyle = {
  id: 'mosaic',
  label: 'Mosaic',
  quadrant,
  field: PALETTE.terracotta.base,
  border: PALETTE.terracotta.deep,
  bed: PALETTE.terracotta.deep,
};
