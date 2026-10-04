import { PALETTE } from '../../palette.ts';
import type { Color } from '../../voxelgen.ts';
import { inside, type MosaicStyle } from '../pieces.ts';

// Portuguese calçada, its waves wound into a pinwheel so a turned piece shows the same field.
function quadrant(x: number, z: number): Color | null {
  const arm =
    (inside(x, 2, 5) && inside(z, 2, 3)) ||
    (inside(x, 4, 7) && inside(z, 4, 5)) ||
    (inside(x, 6, 7) && inside(z, 6, 7));
  return arm ? PALETTE.metal.shade : null;
}

export const calcada: MosaicStyle = {
  id: 'mosaic-calcada',
  label: 'Calçada Mosaic',
  quadrant,
  field: PALETTE.stucco.light,
  border: PALETTE.metal.shade,
  bed: PALETTE.stucco.shade,
};
