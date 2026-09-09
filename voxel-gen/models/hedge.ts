/**
 * Neatly trimmed rectangular green hedge: a plain block of foliage with a flat
 * top and even sides, on a low base. 16x16x8 (4x2 m), a 1x1 tile.
 *
 * Deliberately plain. Hedges line every path the layout draws — a 160-tile
 * resort plants around 1 100 of them — so the model is repeated hard enough that
 * its triangle count shows up in the frame, and every attempt at detail so far
 * has cost more than it was worth: a stippled top and diagonally striped flanks
 * came to 452 triangles for texture invisible past a few metres, and a crown of
 * raised leaf clumps to 156 for a shape that read as studs. A bare block is 44,
 * and looks like what it is until something better is drawn.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "hedge",
  label: "Hedge",
  category: "grounds",
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      leaf: 0x3f8a48,
    };

    const N = 15;

    // low base + darker lip
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    // clipped block, 2 m of hedge above the base
    box(2, 13, 2, 7, 2, 13, C.leaf);
  },
});
