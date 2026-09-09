/**
 * Arcade game hall: a flat-roofed building with glowing neon strips and large
 * windows revealing arcade cabinets, on a low platform. 48x48x25 (12x12 m plot,
 * an 11x9 m hall 5.5 m tall), a 3x3 tile. Glass front faces +z.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'game-hall',
  label: 'Game Hall',
  category: 'leisure',
  tiles: { x: 3, z: 3 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0x3a3550,
      wallShade: 0x2e2a40,
      roof: 0x24202f,
      roofEdge: 0x4a4460,
      glass: 0x13324a,
      mullion: 0x2a2740,
      neonA: 0xff3ca0,
      neonB: 0x3cf0ff,
      neonC: 0x9b5de5,
      screenA: 0xff5db0,
      screenB: 0x54e0ff,
      screenC: 0x74f06a,
      cabinet: 0x1a1728,
      door: 0x101020,
      apron: 0x2a2740,
    };

    const NX = 47;
    const NZ = 47;

    // low platform base (3 layers) + darker top lip
    box(0, NX, 0, 2, 0, NZ, C.base);
    for (let x = 0; x <= NX; x++) {
      set(x, 2, 0, C.baseDark);
      set(x, 2, NZ, C.baseDark);
    }
    for (let z = 0; z <= NZ; z++) {
      set(0, 2, z, C.baseDark);
      set(NX, 2, z, C.baseDark);
    }

    // building body, 11 x 9 m, set back to leave a forecourt on +z
    box(2, 45, 3, 22, 3, 38, C.wall);
    for (let z = 3; z <= 38; z++) box(2, 2, 3, 22, z, z, C.wallShade); // -x side base tone
    // flat roof with a lit edge
    box(1, 46, 23, 24, 2, 39, C.roof);
    for (let x = 1; x <= 46; x++) set(x, 23, 39, C.roofEdge);

    // front window band + glass (z=38)
    box(4, 43, 7, 18, 38, 38, C.glass);
    for (let x = 4; x <= 43; x += 5) box(x, x, 7, 18, 38, 38, C.mullion); // mullions
    // arcade cabinets glowing behind the glass (z=37)
    const screens = [C.screenA, C.screenB, C.screenC];
    for (let i = 0; i < 8; i++) {
      const x = 5 + i * 5;
      box(x, x + 2, 4, 14, 37, 37, C.cabinet);
      box(x, x + 2, 10, 13, 38, 38, screens[i % 3]!);
    }

    // central entrance doors
    box(21, 26, 3, 10, 38, 38, C.door);

    // neon strips: a bright band along the front + one down the -x front corner
    for (let x = 3; x <= 44; x++) set(x, 20, 38, [C.neonA, C.neonB, C.neonC][x % 3]!);
    for (let y = 7; y <= 20; y++) set(2, y, 38, C.neonB);
    for (let z = 6; z <= 36; z++) set(2, 20, z, C.neonA);

    // dark paved forecourt with neon bollards flanking the doors
    for (let x = 2; x <= 45; x++)
      for (let z = 39; z <= 45; z++) if ((x + z) % 2 === 0) set(x, 2, z, C.apron);
    for (const bx of [16, 31]) {
      box(bx, bx + 1, 3, 6, 42, 43, C.cabinet);
      box(bx, bx + 1, 7, 7, 42, 43, C.neonB);
    }
  },
});
