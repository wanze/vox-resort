import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';
import { scatter, slab, speckle } from './ground.ts';

const TRACKS = [3, 12];

// On the land tool's sand, as the brushes stand on theirs, so the toolbar reads as one set of tiles.
export default defineModel({
  id: 'tool-bulldozer',
  label: 'Bulldozer',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const body = PALETTE.amber;
    const metal = PALETTE.metal;
    slab(b, PALETTE.sand, PALETTE.sand.shade);

    for (const z of TRACKS) {
      for (let x = 5; x <= 13; x++) {
        b.box(x, x, 3, 4, z, z + 1, x % 2 === 0 ? metal.deep : metal.shade);
      }
    }
    b.box(6, 12, 5, 6, 4, 11, body.base);
    b.box(6, 12, 6, 6, 4, 11, body.light);
    b.box(6, 12, 5, 5, 4, 4, body.shade);
    b.box(9, 12, 7, 9, 5, 10, body.shade);
    b.box(9, 9, 8, 8, 6, 9, PALETTE.glass.base);
    b.box(10, 11, 8, 8, 5, 5, PALETTE.glass.base);
    b.box(8, 12, 10, 10, 5, 10, body.light);

    for (const z of TRACKS) b.box(3, 5, 4, 4, z + 1, z + 1, metal.base);
    b.box(2, 2, 3, 6, 2, 13, metal.base);
    b.box(2, 2, 6, 6, 2, 13, metal.light);

    // The heap it pushes says what the tool does, as the stakes say it for land.
    for (let z = 3; z <= 12; z++) {
      const rise = 3 - Math.ceil(Math.abs(z - 7.5) / 2);
      for (let y = 3; y < 3 + rise; y++) {
        for (let x = 0; x <= 1; x++) b.set(x, y, z, speckle(PALETTE.teak, x + y, z));
      }
      if (scatter(z, 0) < 4) b.set(0, 3, z, PALETTE.sand.shade);
    }
  },
});
