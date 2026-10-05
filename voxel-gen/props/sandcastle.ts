import { PALETTE } from '../palette.ts';
import { FIGURE_SCALE } from '../people/figure.ts';
import { defineModel, type VoxelBuilder, type VoxelModelSource } from '../voxelgen.ts';

const SIDE = 10;
const LAST = SIDE - 1;
const WALL_TOP = 3;
const TOWER_TOP = 5;
const KEEP_TOP = 7;

function mound(b: VoxelBuilder): void {
  const { sand } = PALETTE;
  b.box(1, LAST - 1, 0, 0, 1, LAST - 1, sand.shade);
  b.box(2, LAST - 2, 1, 1, 2, LAST - 2, sand.base);
  b.box(3, LAST - 3, 2, 2, 3, LAST - 3, sand.light);
}

function crenels(b: VoxelBuilder, from: number, to: number, y: number): void {
  const { sand } = PALETTE;
  for (let at = from; at <= to; at += 2) {
    b.set(at, y, from, sand.light);
    b.set(at, y, to, sand.light);
    b.set(from, y, at, sand.light);
    b.set(to, y, at, sand.light);
  }
}

function walls(b: VoxelBuilder): void {
  const { sand } = PALETTE;
  b.box(0, LAST, 0, 0, 0, LAST, sand.shade);
  b.box(1, LAST - 1, 1, WALL_TOP - 1, 1, LAST - 1, sand.base);
  crenels(b, 1, LAST - 1, WALL_TOP);
  b.box(2, LAST - 2, WALL_TOP - 1, WALL_TOP - 1, 2, LAST - 2, sand.shade);
}

function towers(b: VoxelBuilder): void {
  const { sand } = PALETTE;
  for (const x of [0, LAST - 2]) {
    for (const z of [0, LAST - 2]) {
      b.box(x, x + 2, 1, TOWER_TOP - 1, z, z + 2, sand.base);
      b.set(x, TOWER_TOP, z, sand.light);
      b.set(x + 2, TOWER_TOP, z + 2, sand.light);
      b.set(x + 2, TOWER_TOP, z, sand.light);
      b.set(x, TOWER_TOP, z + 2, sand.light);
    }
  }
  // In the seaward wall: +z is the sea everywhere.
  b.box(4, 5, 1, 2, LAST - 1, LAST - 1, sand.deep);
}

function keep(b: VoxelBuilder): void {
  const { bloom, sand, teak } = PALETTE;
  b.box(3, 6, WALL_TOP, KEEP_TOP - 1, 3, 6, sand.base);
  crenels(b, 3, 6, KEEP_TOP);
  b.box(4, 4, KEEP_TOP, KEEP_TOP + 3, 4, 4, teak.base);
  b.box(5, 6, KEEP_TOP + 2, KEEP_TOP + 3, 4, 4, bloom.base);
}

const stage = (id: string, label: string, ...steps: ((b: VoxelBuilder) => void)[]) =>
  defineModel({
    id,
    label,
    category: 'props',
    tiles: { x: 1, z: 1 },
    // So a tower can be thinner than a world voxel.
    scale: FIGURE_SCALE,
    build: (b: VoxelBuilder) => {
      for (const step of steps) step(b);
    },
  });

export const SANDCASTLE_SOURCES: readonly VoxelModelSource[] = [
  stage('sandcastle-mound', 'Sand Heap', mound),
  stage('sandcastle-walls', 'Sand Walls', walls),
  stage('sandcastle-towers', 'Sand Towers', walls, towers),
  stage('sandcastle-keep', 'Sand Castle', walls, towers, keep),
];

// Smallest first: a stage is drawn by its index in this list.
export const SANDCASTLE_IDS: readonly string[] = SANDCASTLE_SOURCES.map((source) => source.id);
