/**
 * Resort street lamp: a slim dark post on a stone foot carrying a four-sided
 * lantern with a warm glowing pane and a little pyramid cap. 16x16x21
 * (4x4x5.25 m), a 1x1 tile, so it drops onto any tile beside a path.
 *
 * The lantern pane is emissive and the model declares the point light it casts,
 * which is what the night lighting picks up.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const GLOW = 0xffe3a3;

export default defineModel({
  id: 'street-lamp',
  label: 'Street Lamp',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  emissive: [GLOW],
  // The bulb sits inside the lantern, a touch below its middle.
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      stone: 0x8f8a80,
      stoneDark: 0x777268,
      post: 0x3a4048,
      postDark: 0x2b3037,
      trim: 0x5a6270,
      glow: GLOW,
    };

    const N = 15;

    // low base + darker lip, the shared prop plinth
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    const cx = 7;
    const cz = 7;

    // round stone foot
    for (let x = 4; x <= 11; x++)
      for (let z = 4; z <= 11; z++) {
        const d = Math.hypot(x + 0.5 - (cx + 0.5), z + 0.5 - (cz + 0.5));
        if (d <= 3.4) box(x, x, 2, 3, z, z, d > 2.5 ? C.stoneDark : C.stone);
      }
    box(cx - 1, cx + 2, 4, 4, cz - 1, cz + 2, C.trim);

    // the post, with a shaded side so it reads as round
    box(cx, cx + 1, 5, 15, cz, cz + 1, C.post);
    for (let y = 5; y <= 15; y++) {
      set(cx + 1, y, cz + 1, C.postDark);
    }

    // lantern: a glowing core inside an open four-post frame
    box(cx - 1, cx + 2, 16, 16, cz - 1, cz + 2, C.trim);
    box(cx, cx + 1, 17, 18, cz, cz + 1, C.glow);
    for (const [x, z] of [
      [cx - 1, cz - 1],
      [cx + 2, cz - 1],
      [cx - 1, cz + 2],
      [cx + 2, cz + 2],
    ] as const) {
      box(x, x, 17, 18, z, z, C.postDark);
    }
    // glass panes between the corner posts
    for (const [x, z] of [
      [cx, cz - 1],
      [cx + 1, cz - 1],
      [cx, cz + 2],
      [cx + 1, cz + 2],
      [cx - 1, cz],
      [cx - 1, cz + 1],
      [cx + 2, cz],
      [cx + 2, cz + 1],
    ] as const) {
      box(x, x, 17, 18, z, z, C.glow);
    }

    // cap: a two-step pyramid
    box(cx - 1, cx + 2, 19, 19, cz - 1, cz + 2, C.trim);
    box(cx, cx + 1, 20, 20, cz, cz + 1, C.postDark);
  },
});
