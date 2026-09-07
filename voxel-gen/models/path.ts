/**
 * Paved path tile: a thin slab of running-bond flagstones with grout lines that
 * fills the whole footprint so tiles butt together seamlessly (no raised lip).
 * 16x16 footprint, fits a 1x1 ground tile.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "path",
  label: "Path",
  category: "grounds",
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      grout: 0x9a8a6a,
      paverA: 0xc3b189,
      paverB: 0xb6a379,
      paverC: 0xcdbc95,
    };
    const pavers = [C.paverA, C.paverB, C.paverC];

    const N = 15;

    // solid grout underlayer spanning the full tile
    box(0, N, 0, 1, 0, N, C.grout);

    // running-bond pavers on top; grout lines between them
    for (let x = 0; x <= N; x++)
      for (let z = 0; z <= N; z++) {
        const row = Math.floor(z / 2);
        const offset = (row % 2) * 2;
        const isGrout = z % 2 === 0 || (x + offset) % 4 === 0;
        if (isGrout) {
          set(x, 1, z, C.grout);
          continue;
        }
        const stone = Math.floor((x + offset) / 4) + row;
        set(x, 1, z, pavers[stone % pavers.length]!);
      }
  },
});
