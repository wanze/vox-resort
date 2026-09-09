/**
 * Paved path tile: a thin slab of running-bond flagstones with grout lines that
 * fills the whole footprint so tiles butt together seamlessly (no raised lip).
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * The flagstones are deliberately large. Paths are by far the most repeated
 * object on a plot — a 160-tile resort lays about 5 200 of them — so whatever
 * one tile costs is multiplied harder than anything else in the catalogue, and a
 * paver every few voxels is precisely the pattern the greedy mesher cannot
 * merge: each stone is its own rectangle, in its own colour, with a grout line
 * between. At two-voxel pavers the tile came to 276 triangles and paths alone
 * were 30% of every triangle submitted. Eight-by-four pavers cost 96, for a
 * bond that still reads as paving from the height the ground is ever seen at.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Flagstone size in voxels, grout line included. One tile is 16 across. */
const PAVER = { width: 8, depth: 4 } as const;

export default defineModel({
  id: 'path',
  label: 'Path',
  category: 'grounds',
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
        const band = Math.floor(z / PAVER.depth);
        const offset = (band % 2) * (PAVER.width / 2);
        const isGrout = z % PAVER.depth === 0 || (x + offset) % PAVER.width === 0;
        if (isGrout) {
          set(x, 1, z, C.grout);
          continue;
        }
        const stone = Math.floor((x + offset) / PAVER.width) + band;
        set(x, 1, z, pavers[stone % pavers.length]!);
      }
  },
});
