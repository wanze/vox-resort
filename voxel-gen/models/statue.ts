import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'statue',
  label: 'Statue',
  category: 'grounds',
  scenery: 0.8,
  tiles: { x: 1, z: 1 },
  onTerrain: true,
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      plinth: 0xbdb6a6,
      plinthDark: 0xa49d8c,
      marble: 0xecebe4,
      marbleShade: 0xd6d5cc,
    };

    box(4, 11, 2, 6, 4, 11, C.plinth);
    for (let x = 4; x <= 11; x++) {
      set(x, 6, 4, C.plinthDark);
      set(x, 6, 11, C.plinthDark);
    }
    for (let z = 4; z <= 11; z++) {
      set(4, 6, z, C.plinthDark);
      set(11, 6, z, C.plinthDark);
    }

    const cx = 7;
    const cz = 7;
    box(cx, cx + 1, 7, 12, cz, cz + 1, C.marble);
    box(cx - 1, cx + 2, 12, 18, cz, cz + 1, C.marble);
    box(cx - 2, cx - 1, 13, 17, cz, cz + 1, C.marbleShade);
    box(cx + 2, cx + 3, 14, 18, cz, cz + 1, C.marbleShade);
    box(cx, cx + 1, 19, 21, cz, cz + 1, C.marble);
    box(cx - 1, cx + 2, 12, 16, cz + 1, cz + 1, C.marbleShade);
  },
});
