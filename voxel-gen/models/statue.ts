import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'statue',
  label: 'Statue',
  category: 'grounds',
  scenery: 0.8,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      plinth: 0xbdb6a6,
      plinthDark: 0xa49d8c,
      marble: 0xecebe4,
      marbleShade: 0xd6d5cc,
    };

    const N = 15;

    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

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
