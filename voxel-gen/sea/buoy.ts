// Drawn twice real height: to scale it would be a handful of pixels fifty metres out.

import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const LAMP = PALETTE.amber.light;

const DRUM = 4;
const MAST = 6;

export default defineModel({
  id: 'buoy',
  label: 'Marker Buoy',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  emissive: [LAMP],
  // Brighter than a bridge lantern: the water it lights is ten voxels below. At the voxel's middle
  // because the buoy is hung on its own middle.
  lights: [{ x: 0.5, y: DRUM + MAST + 0.5, z: 0.5, color: LAMP, intensity: 40, distance: 32 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, metal } = PALETTE;

    box(-1, 1, 0, 0, -1, 1, amber.shade);
    box(-2, 2, 1, DRUM - 1, -2, 2, amber.base);
    box(-2, 2, 2, 2, -2, 2, bloom.base);
    box(-1, 1, DRUM, DRUM, -1, 1, amber.light);

    const head = DRUM + MAST;
    box(0, 0, DRUM + 1, head - 1, 0, 0, metal.light);
    box(-1, 1, head - 2, head - 2, 0, 0, bloom.base);
    box(0, 0, head - 2, head - 2, -1, 1, bloom.base);

    b.set(0, head, 0, LAMP);
  },
});
