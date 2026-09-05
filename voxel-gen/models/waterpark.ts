/**
 * Tall water slide: a blue-and-yellow tower with a curving flume wrapping around
 * it, a splash pool at the base and a climbing stair, on a low platform.
 * 80x80x56 (20x20 m, a 14 m tower), a 5x5 tile.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "waterpark",
  label: "Waterpark",
  tiles: { x: 5, z: 5 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      deck: 0xc9c2b4,
      deckDark: 0xb3a992,
      water: 0x37abd2,
      waterHi: 0x69c9e0,
      towerBlue: 0x2f8fd0,
      towerYellow: 0xf2c24c,
      platform: 0xdfe3e8,
      rail: 0xf4efe4,
      flume: 0xf2a03c,
      flumeWall: 0x2f6fd0,
      support: 0x9aa0a6,
      stair: 0xd0d4d8,
    };

    const N = 79;
    const cx = 39.5;
    const cz = 39.5;

    // low platform base (3 layers) + darker top lip
    box(0, N, 0, 2, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 2, 0, C.baseDark);
      set(x, 2, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 2, z, C.baseDark);
      set(N, 2, z, C.baseDark);
    }

    // deck + rounded splash pool
    for (let x = 2; x <= 77; x++)
      for (let z = 2; z <= 77; z++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d <= 32) set(x, 3, z, (x * 3 + z) % 7 === 0 ? C.waterHi : C.water);
        else set(x, 3, z, (x + z) % 2 === 0 ? C.deck : C.deckDark);
      }
    // pool rim
    for (let x = 2; x <= 77; x++)
      for (let z = 2; z <= 77; z++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > 30.5 && d <= 32.6) set(x, 4, z, C.deckDark);
      }

    // banded central tower
    for (let y = 3; y <= 52; y++) {
      const band = Math.floor((y - 3) / 4) % 2 === 0 ? C.towerBlue : C.towerYellow;
      box(31, 48, y, y, 31, 48, band);
    }
    // top platform + railing
    box(25, 54, 53, 53, 25, 54, C.platform);
    for (let x = 25; x <= 54; x++) {
      set(x, 54, 25, C.rail);
      set(x, 54, 54, C.rail);
    }
    for (let z = 25; z <= 54; z++) {
      set(25, 54, z, C.rail);
      set(54, 54, z, C.rail);
    }

    // helical flume wrapping the tower down into the pool. Dense sampling so the
    // chute reads as one continuous curving tube (floor + inner + outer wall).
    for (let t = 0; t <= 900; t++) {
      const ang = t * 0.017;
      const r = 29 - t * 0.02;
      const y = Math.round(52 - t * 0.052);
      if (y < 5 || r < 11) break;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (const dr of [-1, 0, 1]) {
        const px = Math.round(cx + (r + dr) * ca);
        const pz = Math.round(cz + (r + dr) * sa);
        set(px, y, pz, C.flume); // chute floor
        set(px, y + 1, pz, Math.abs(dr) === 1 ? C.flumeWall : C.flume); // raised lips
      }
    }
    // a few support columns under the lower, widest part of the flume
    for (const ang of [0.6, 2.0, 3.4, 4.8]) {
      const sx = Math.round(cx + 26 * Math.cos(ang));
      const sz = Math.round(cz + 26 * Math.sin(ang));
      box(sx, sx + 1, 4, 22, sz, sz + 1, C.support);
    }

    // climbing stair access on the -x side of the tower
    for (let i = 0; i <= 48; i++) {
      const y = 4 + i;
      if (y > 52) break;
      const step = 28 - (i % 3) * 2;
      box(step, step + 1, y, y, 36, 43, C.stair);
    }
    box(23, 24, 4, 52, 36, 36, C.support); // stair stringer
    box(23, 24, 4, 52, 43, 43, C.support);
  },
});
