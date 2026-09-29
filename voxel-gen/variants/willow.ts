import { noise } from '../models/foliage.ts';
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 31;
const MID = 15.5;
const FLOOR = 23;

type Point = readonly [number, number, number];

const clamp = (value: number): number => Math.min(EDGE, Math.max(0, Math.round(value)));

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

function bough(b: VoxelBuilder, from: Point, to: Point, size: number, color: Color): void {
  const span = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const steps = Math.max(1, Math.round(span));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(from[0] + (to[0] - from[0]) * t - size / 2);
    const y = Math.round(from[1] + (to[1] - from[1]) * t);
    const z = Math.round(from[2] + (to[2] - from[2]) * t - size / 2);
    b.box(x, x + size - 1, y, y, z, z + size - 1, color);
  }
}

// Strands a voxel apart, each one colour and one length, so a strand meshes as one
// long column. A second row sits a voxel further in and fills the gaps from behind,
// which gives a lock depth without dithering a face.
function lock(
  b: VoxelBuilder,
  turn: number,
  reach: number,
  top: number,
  hem: number,
  colors: readonly [Color, Color],
): void {
  for (let j = -4; j <= 4; j++) {
    const row = Math.abs(j) % 2;
    const r = reach - row;
    const along = turn + j / reach;
    const x = clamp(MID + Math.cos(along) * r - 0.5);
    const z = clamp(MID + Math.sin(along) * r - 0.5);
    const bottom = hem + row * 2 + Math.abs(j) + Math.floor(noise(j, top, hem, 5) * 3);
    b.box(x, x, bottom, top, z, z, colors[row]!);
  }
}

// Rotated off the axes so no lock lines up with a tile edge and the tree reads round.
const LOBES = [0.3, 1.2, 2.1, 3.0, 3.9, 4.75, 5.55].map((turn, i) => ({
  turn,
  hem: 8 + Math.floor(noise(i, 0, 0, 31) * 4),
}));

export default defineModel({
  id: 'willow-b',
  label: 'Willow B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const { grass, sand, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32, height: 2, stone: sand });
    b.box(10, 21, ground - 1, ground - 1, 10, 21, teak.deep);

    b.box(13, 18, ground, ground + 1, 13, 18, teak.shade);
    b.box(14, 17, ground, 11, 14, 17, teak.shade);
    const fork: Point = [16, 11, 16];
    for (const to of [
      [9, FLOOR, 10],
      [23, FLOOR, 11],
      [21, FLOOR, 23],
      [9, FLOOR, 21],
    ] as const) {
      bough(b, fork, to, 2, teak.shade);
    }

    // Each rim lobe and the lock under it share a colour, so they read as one
    // drooping branch; the hem stays above 1.5 m, so people walk through the
    // curtain rather than into it, as under the original.
    clump(b, [MID, 28, MID], 11, 6, grass.base);
    clump(b, [12, 32, 13], 6, 3, grass.base);
    clump(b, [20, 31, 19], 6, 3, grass.base);
    for (const [i, { turn, hem }] of LOBES.entries()) {
      const leaf = i % 2 === 0 ? grass.light : grass.base;
      const at: Point = [MID + Math.cos(turn) * 9, 26, MID + Math.sin(turn) * 9];
      clump(b, at, 6, 3.5, leaf);
      lock(b, turn, 13.5, 26, hem, [leaf, grass.shade]);
      lock(b, turn + 0.45, 10.5, FLOOR, hem + 6, [grass.shade, grass.base]);
    }
  },
});
