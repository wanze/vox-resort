import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'icecream',
  label: 'Ice Cream Cart',
  category: 'amenities',
  tiles: { x: 1, z: 1 },
  venue: {
    shelter: 'open',
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 0.25 },
      { need: 'fun', amount: 0.15 },
    ],
    capacity: 4,
    dwellSeconds: { min: 120, max: 300 },
    doors: [{ x: 8, z: 12, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wheel: 0x2f2a26,
      hub: 0xb0b4ba,
      body: 0xf3d7e0,
      bodyTrim: 0xd98aa2,
      counter: 0xe9e4d8,
      cooler: 0x6cc4d8,
      board: 0x3a3330,
      poleA: 0xe0473f,
      poleB: 0xf0ead9,
      scoopA: 0xf6b3c2,
      scoopB: 0xf2d24e,
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

    for (const [x, z] of [
      [3, 4],
      [3, 10],
      [12, 4],
      [12, 10],
    ] as const) {
      box(x, x, 2, 4, z, z + 1, C.wheel);
      set(x, 3, z, C.hub);
    }

    box(3, 12, 4, 7, 4, 11, C.body);
    box(3, 12, 5, 5, 4, 11, C.bodyTrim);
    box(3, 12, 8, 8, 4, 12, C.counter);

    box(4, 6, 9, 10, 5, 8, C.cooler);
    box(9, 12, 9, 11, 10, 10, C.board);

    box(7, 8, 8, 11, 7, 8, C.poleB);
    for (let r = 3; r >= 1; r--) {
      const y = 12 + (3 - r);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++)
          if (Math.abs(dx) + Math.abs(dz) <= r + 1)
            set(7 + dx, y, 7 + dz, (dx + dz) % 2 === 0 ? C.poleA : C.poleB);
    }
    set(5, 9, 12, C.scoopA);
    set(10, 9, 12, C.scoopB);
  },
});
