import { PALETTE } from '../../palette.ts';
import { TILE_VOXELS, type Color, type VoxelBuilder } from '../../voxelgen.ts';
import type { Footprint, RunStyle } from '../pieces.ts';

const { sand, stone } = PALETTE;

type Course = readonly (readonly [length: number, color: Color])[];

// Each course reads the same from either end of a tile, so a piece turned or mirrored onto its
// neighbour still meets it; the end stones are halves that join the next tile's into one. Every
// course mixes close tones, since a course of one colour reads as a stripe, not as stones.
const COURSES: readonly Course[] = [
  [
    [2, stone.base],
    [4, sand.light],
    [4, stone.shade],
    [4, sand.light],
    [2, stone.base],
  ],
  [
    [3, stone.shade],
    [4, stone.base],
    [2, sand.light],
    [4, stone.base],
    [3, stone.shade],
  ],
  [
    [2, sand.light],
    [4, stone.shade],
    [4, stone.base],
    [4, stone.shade],
    [2, sand.light],
  ],
];

// Lighter than any course, so the top reads as a coping laid on the wall.
const COPING: Course = [
  [2, stone.light],
  [4, sand.light],
  [4, stone.light],
  [4, sand.light],
  [2, stone.light],
];

function colorAt(course: Course, along: number): Color {
  let end = 0;
  for (const [length, color] of course) {
    end += length;
    if (along < end) return color;
  }
  throw new Error(`A course must span the ${TILE_VOXELS} voxels of a tile`);
}

function lay(b: VoxelBuilder, course: Course, y: number, footprint: Footprint): void {
  const { x0, x1, z0, z1 } = footprint;
  const runsAlongX = x1 - x0 >= z1 - z0;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) b.set(x, y, z, colorAt(course, runsAlongX ? x : z));
  }
}

function paint(b: VoxelBuilder, footprint: Footprint): void {
  const { x0, x1, z0, z1 } = footprint;
  b.box(x0, x1, 0, 0, z0, z1, stone.deep);
  COURSES.forEach((course, index) => lay(b, course, index + 1, footprint));
  lay(b, COPING, COURSES.length + 1, footprint);
}

// As thick as the hedge so the two read as one family of borders, and lower: about 1.1 m.
export const stoneWall: RunStyle = {
  id: 'stone-wall',
  label: 'Stone Wall',
  cost: 30,
  scenery: 0.2,
  span: { lo: 6, hi: 9 },
  paint,
};
