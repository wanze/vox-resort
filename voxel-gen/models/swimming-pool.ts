/**
 * Rectangular swimming pool: recessed clear-blue water with a stone floor + tiled
 * walls, light-stone coping, a flat stone-paved deck, a side ladder, and two rows
 * of loungers. Flat slab, 64x48 (16x12 m deck around a 12x6 m pool), a 4x3 tile.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'swimming-pool',
  label: 'Swimming Pool',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  // Submerged pool lights: no voxel emits them, the water is simply lit at night.
  lights: [
    { x: 20, y: 9, z: 24, color: 0x7fd8ee, intensity: 130, distance: 70 },
    { x: 44, y: 9, z: 24, color: 0x7fd8ee, intensity: 130, distance: 70 },
  ],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const del = b.del.bind(b);

    const C = {
      stone: 0xc9c2b4,
      stoneDark: 0xb3a992, // base slab sides
      paveA: 0xb8b2a4,
      paveB: 0xa6a091, // stone-paved deck (2-tone tiles)
      coping: 0xd8d2c4, // light stone pool rim
      tile: 0xcadee2, // pool liner walls
      floorStone: 0x8b8578,
      floorStoneD: 0x7a7568, // stone pool floor
      water: 0x33a6ce,
      waterHi: 0x62c6de, // clear blue water + ripples
      metal: 0xc8cdd2, // ladder
      frame: 0xe8e8e0,
      cushion: 0x2fa0a8, // loungers
    };

    const X = 63;
    const Z = 47; // footprint 64 x 48 (4:3)
    const PX0 = 8;
    const PX1 = 55;
    const PZ0 = 12;
    const PZ1 = 35; // pool rectangle: 12 x 6 m of water

    // low platform base (2 layers) + darker lip
    box(0, X, 0, 1, 0, Z, C.stone);
    for (let x = 0; x <= X; x++) {
      set(x, 1, 0, C.stoneDark);
      set(x, 1, Z, C.stoneDark);
    }
    for (let z = 0; z <= Z; z++) {
      set(0, 1, z, C.stoneDark);
      set(X, 1, z, C.stoneDark);
    }

    // flat stone-paved deck slab (y2..5) with a 3x3 tile checker on top
    box(0, X, 2, 5, 0, Z, C.paveB);
    for (let x = 0; x <= X; x++)
      for (let z = 0; z <= Z; z++)
        set(x, 5, z, (Math.floor(x / 3) + Math.floor(z / 3)) % 2 === 0 ? C.paveA : C.paveB);

    // recessed pool basin: tile liner walls, stone floor, water 1 below deck
    for (let x = PX0; x <= PX1; x++)
      for (let z = PZ0; z <= PZ1; z++) {
        for (let y = 2; y <= 5; y++) del(x, y, z);
        const border = x === PX0 || x === PX1 || z === PZ0 || z === PZ1;
        if (border) {
          box(x, x, 2, 5, z, z, C.tile);
          continue;
        }
        set(x, 2, z, (x + z) % 2 === 0 ? C.floorStone : C.floorStoneD);
        set(x, 3, z, C.water);
        set(x, 4, z, (x * 7 + z * 3) % 11 < 2 ? C.waterHi : C.water);
        // y5 left open -> water sits recessed below deck top
      }

    // light-stone coping framing the water (pool border top + one deck ring out)
    for (let x = PX0 - 1; x <= PX1 + 1; x++)
      for (let z = PZ0 - 1; z <= PZ1 + 1; z++) {
        if (x < 0 || x > X || z < 0 || z > Z) continue;
        const inPool = x >= PX0 && x <= PX1 && z >= PZ0 && z <= PZ1;
        const onBorder = inPool && (x === PX0 || x === PX1 || z === PZ0 || z === PZ1);
        if (onBorder || !inPool) set(x, 5, z, C.coping);
      }

    // ladder on the pool's left wall (x = PX0), clear of the lounger rows
    for (const rz of [22, 25]) {
      box(PX0, PX0, 3, 8, rz, rz, C.metal);
      set(PX0 - 1, 8, rz, C.metal); // handrail hooking over the deck
    }
    for (const y of [3, 4, 5]) {
      set(PX0, y, 23, C.metal);
      set(PX0, y, 24, C.metal); // rungs
    }

    // sun loungers. headHighZ picks which end the backrest sits on.
    const lounger = (ox: number, oz: number, headHighZ: boolean) => {
      for (const [lx, lz] of [
        [ox, oz],
        [ox + 3, oz],
        [ox, oz + 5],
        [ox + 3, oz + 5],
      ] as const)
        set(lx, 6, lz, C.frame); // legs
      const pad0 = headHighZ ? oz : oz + 1;
      const hz = headHighZ ? oz + 5 : oz;
      for (let z = pad0; z <= pad0 + 4; z++)
        box(ox, ox + 3, 7, 7, z, z, z % 2 === 0 ? C.cushion : C.frame); // striped pad
      box(ox, ox + 3, 8, 9, hz, hz, C.cushion); // reclined backrest
      box(ox, ox + 3, 10, 10, hz, hz, C.frame); // white headrest pillow
    };
    // two evenly-spaced rows of four, both facing the pool (backrest on deck side)
    for (const ox of [6, 21, 36, 51]) lounger(ox, 39, true); // front deck row
    for (const ox of [6, 21, 36, 51]) lounger(ox, 2, false); // back deck row
  },
});
