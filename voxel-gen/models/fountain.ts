/**
 * Small ornate stone fountain: a radially symmetric tiered circular basin with
 * gently arcing water jets, on a low platform. 32x32x19 (8x8 m, 4.75 m tall), a
 * 2x2 tile filled edge to edge.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "fountain",
  label: "Fountain",
  tiles: { x: 2, z: 2 },
  lights: [{ x: 16, y: 8, z: 16, color: 0x9fd8f2, intensity: 120, distance: 64 }],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      stone: 0xcac3b4,
      stoneDark: 0xb0a893,
      water: 0x37abd2,
      waterHi: 0x69c9e0,
    };

    const N = 31;
    const cx = 15.5;
    const cz = 15.5;
    const rd = (x: number, z: number) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz);

    // low platform base + darker top lip
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    // lower circular basin: stone ring wall + water inside, 6.8 m across
    for (let x = 0; x <= N; x++)
      for (let z = 0; z <= N; z++) {
        const d = rd(x, z);
        if (d <= 13.6) box(x, x, 2, 4, z, z, C.stone);
        if (d >= 11.5 && d <= 13.6) set(x, 5, z, d > 12.5 ? C.stoneDark : C.stone);
        else if (d < 11.5) set(x, 5, z, (x + z) % 5 === 0 ? C.waterHi : C.water);
      }

    // slender pedestal column, flaring into a capital under the upper basin
    for (let x = 0; x <= N; x++)
      for (let z = 0; z <= N; z++) {
        const d = rd(x, z);
        if (d <= 2.6) box(x, x, 6, 13, z, z, C.stoneDark);
        if (d <= 4.2) box(x, x, 12, 13, z, z, C.stoneDark);
      }

    // upper tiered basin resting on the capital, 3 m across
    for (let x = 0; x <= N; x++)
      for (let z = 0; z <= N; z++) {
        const d = rd(x, z);
        if (d >= 3.6 && d <= 6.0) {
          box(x, x, 14, 15, z, z, C.stone);
          set(x, 15, z, d > 5.1 ? C.stoneDark : C.water);
        } else if (d < 3.6) set(x, 15, z, C.water);
      }

    // top finial + arcing jets
    box(15, 16, 14, 17, 15, 16, C.stoneDark);
    for (const [dx, dz] of [
      [0, 0],
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ] as const) {
      set(15 + dx, 18, 15 + dz, C.waterHi);
      set(15 + dx, 17, 15 + dz, C.water);
    }
  },
});
