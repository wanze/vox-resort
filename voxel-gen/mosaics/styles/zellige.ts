import { PALETTE } from '../../palette.ts';
import type { Color } from '../../voxelgen.ts';
import { inside, type MosaicStyle } from '../pieces.ts';

// Moroccan zellige: an eight-point star, a square crossed with a stepped diamond.
function quadrant(x: number, z: number): Color | null {
  if (inside(x, 6, 7) && inside(z, 6, 7)) return PALETTE.amber.base;
  const square = inside(x, 4, 7) && inside(z, 4, 7);
  const points = (inside(x, 6, 7) && inside(z, 2, 3)) || (inside(x, 2, 3) && inside(z, 6, 7));
  return square || points ? PALETTE.water.shade : null;
}

export const zellige: MosaicStyle = {
  id: 'mosaic-zellige',
  label: 'Zellige Mosaic',
  quadrant,
  field: PALETTE.stucco.light,
  border: PALETTE.water.deep,
  bed: PALETTE.stucco.shade,
};
