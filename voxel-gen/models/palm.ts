/**
 * Tropical palm tree: a curved cylindrical trunk with a radial crown of broad
 * green fronds spreading on all sides, plus a few coconuts, on a low square base.
 * 16x16 footprint, fits a 1x1 tile (tall).
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'palm',
  label: 'Palm',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      soil: 0x6f5636,
      trunk: 0x8a6a3f,
      trunkDark: 0x6f5330,
      frondA: 0x2f7d45,
      frondB: 0x49a05e,
      frondTip: 0x62b56f,
      coconut: 0x5a3f26,
    };

    const N = 15;

    // low square base + darker lip, with a soil patch
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }
    box(5, 10, 1, 1, 5, 10, C.soil);

    // curved cylindrical trunk (2x2) leaning gently as it rises
    const topY = 40;
    let tx = 7;
    let tz = 7;
    for (let y = 2; y <= topY; y++) {
      tx = 7 + Math.round(Math.sin((y - 2) / 26) * 2);
      tz = 7 + Math.round(Math.sin((y - 2) / 34) * 1);
      box(tx, tx + 1, y, y, tz, tz + 1, (y - 2) % 3 === 0 ? C.trunkDark : C.trunk);
    }
    const cx = tx;
    const cz = tz;

    // coconut cluster just under the crown
    for (const [dx, dz] of [
      [-1, 0],
      [2, 1],
      [0, 2],
    ] as const)
      set(cx + dx, topY - 1, cz + dz, C.coconut);

    // radial crown of broad fronds, drooping toward their tips
    const cardinals: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const diagonals: [number, number][] = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const frond = (dx: number, dz: number, len: number) => {
      for (let i = 1; i <= len; i++) {
        const fy = topY + 2 - Math.max(0, i - 2) - (i >= len - 1 ? 1 : 0);
        const fx = cx + dx * i;
        const fz = cz + dz * i;
        set(fx, fy, fz, i >= len - 1 ? C.frondTip : C.frondA);
        if (i <= 3) {
          // broaden the frond near the crown
          set(fx + (dz !== 0 ? 1 : 0), fy, fz + (dx !== 0 ? 1 : 0), C.frondB);
          set(fx - (dz !== 0 ? 1 : 0), fy, fz - (dx !== 0 ? 1 : 0), C.frondB);
        }
      }
    };
    for (const [dx, dz] of cardinals) frond(dx, dz, 6);
    for (const [dx, dz] of diagonals) frond(dx, dz, 4);
    // crown centre
    box(cx, cx + 1, topY + 2, topY + 3, cz, cz + 1, C.frondB);
    set(cx, topY + 4, cz, C.frondTip);
  },
});
