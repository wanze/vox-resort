import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 31;
const FLOOR = 24;

type Point = readonly [number, number, number];

const clamp = (value: number): number => Math.min(EDGE, Math.max(0, Math.round(value)));

// Smooth, one colour and no noise: each clump then meshes as a few stepped rings
// instead of hundreds of loose faces.
function clump(b: VoxelBuilder, [cx, cy, cz]: Point, r: number, ry: number, color: Color): void {
  for (let y = Math.max(FLOOR, Math.ceil(cy - ry)); y <= Math.floor(cy + ry); y++) {
    const ring = r * Math.sqrt(Math.max(0, 1 - ((y + 0.5 - cy) / ry) ** 2));
    for (let z = clamp(cz - ring); z <= clamp(cz + ring); z++) {
      for (let x = clamp(cx - ring); x <= clamp(cx + ring); x++) {
        if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= ring * ring) b.set(x, y, z, color);
      }
    }
  }
}

function bough(
  b: VoxelBuilder,
  from: Point,
  to: Point,
  thick: number,
  thin: number,
  color: Color,
): void {
  const span = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const steps = Math.max(1, Math.round(span));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const size = Math.round(thick + (thin - thick) * t);
    const x = Math.round(from[0] + (to[0] - from[0]) * t - size / 2);
    const y = Math.round(from[1] + (to[1] - from[1]) * t);
    const z = Math.round(from[2] + (to[2] - from[2]) * t - size / 2);
    b.box(x, x + size - 1, y, y, z, z + size - 1, color);
  }
}

const { foliage } = PALETTE;

// A holm oak: a low, broad dome of clumps, each on its own limb. Flat
// undersides at 5 m keep the ring walkable and read as the shade it casts.
const CLUMPS = [
  { at: [7, 28, 8], r: 7.5, ry: 5, leaf: foliage.deep },
  { at: [24, 27, 7], r: 7.5, ry: 4.5, leaf: foliage.shade },
  { at: [25, 28, 24], r: 7.5, ry: 5, leaf: foliage.deep },
  { at: [7, 27, 24], r: 7.5, ry: 4.5, leaf: foliage.shade },
  { at: [16, 31, 16], r: 11, ry: 6, leaf: foliage.shade },
  { at: [11, 34, 12], r: 6.5, ry: 4, leaf: foliage.base },
  { at: [21, 34, 20], r: 6.5, ry: 4, leaf: foliage.base },
] as const;

export default defineModel({
  id: 'oak-b',
  label: 'Oak B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const { sand, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32, height: 2, stone: sand });
    b.box(10, 21, ground - 1, ground - 1, 10, 21, teak.deep);

    b.box(13, 18, ground, ground + 1, 13, 18, teak.shade);
    b.box(14, 17, ground, 13, 14, 17, teak.shade);
    const fork: Point = [16, 13, 16];
    for (const { at } of CLUMPS.slice(0, 4)) {
      bough(b, fork, [at[0], FLOOR, at[2]], 3, 2, teak.shade);
    }
    bough(b, fork, [16, FLOOR, 16], 3, 3, teak.shade);

    for (const { at, r, ry, leaf } of CLUMPS) clump(b, at, r, ry, leaf);
  },
});
