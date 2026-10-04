import { PALETTE } from '../../palette.ts';
import type { Color } from '../../voxelgen.ts';
import { inside, type MosaicStyle } from '../pieces.ts';

// Venetian terrazzo: marble chips set in pale stone, kept to 2 x 2 so the mesher merges them.
function quadrant(x: number, z: number): Color | null {
  if (x === 7 && z === 7) return PALETTE.slate.base;
  if (inside(x, 2, 3) && inside(z, 5, 6)) return PALETTE.terracotta.light;
  if (inside(x, 5, 6) && inside(z, 2, 3)) return PALETTE.slate.base;
  if (inside(x, 4, 5) && inside(z, 4, 5)) return PALETTE.amber.light;
  return null;
}

export const terrazzo: MosaicStyle = {
  id: 'mosaic-terrazzo',
  label: 'Terrazzo Mosaic',
  quadrant,
  field: PALETTE.stone.light,
  border: PALETTE.stone.shade,
  bed: PALETTE.stone.shade,
};
