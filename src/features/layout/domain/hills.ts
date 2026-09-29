// Raised as terrain edits on the grass rather than as terraces: a terrace is a line across the whole
// plot, and these are knolls standing on their own.

import { createRandom } from './random';
import type { Terrain, TerrainEdit } from './terrain';

// Rows of level grass kept between a hill and the sand, the water or the plot's edge.
const CLEAR = 3;

const MAX_RISE = 6;

// One hill per plot stands out from the rest, so the land has a high point to build up to.
const PEAK = { rise: { min: 6, max: 10 }, radius: 26, spread: 2, tries: 16 } as const;

// Tiles per level at the least, so a flank is a walkable run of terraces rather than a cliff.
const TILES_PER_LEVEL = 3;

// Under a quarter of the radius, or a lobe can pinch a hill in two.
const WOBBLE = 0.15;

const HILLS_SALT = 0x3c5;

const AREA_PER_HILL = 3000;

export interface HillParts {
  // The ground the hills stand on, river included, so they keep clear of the water.
  readonly terrain: Terrain;
  // The level of the grass they rise from.
  readonly level: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly seed: number;
}

interface Knoll {
  readonly x: number;
  readonly z: number;
  readonly rx: number;
  readonly rz: number;
  readonly rise: number;
  readonly phase: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function knollOf(
  random: () => number,
  centre: { readonly x: number; readonly z: number },
  radius: number,
  rise: { readonly min: number; readonly max: number },
): Knoll {
  const rx = radius * (0.7 + random() * 0.6);
  const rz = radius * (0.7 + random() * 0.6);
  return {
    ...centre,
    rx,
    rz,
    rise: clamp(Math.floor(Math.min(rx, rz) / TILES_PER_LEVEL), rise.min, rise.max),
    phase: random() * Math.PI * 2,
  };
}

// The peak takes the roomiest of a few draws: dropped anywhere, the river or the plot's edge could
// cut it down to the height of the rest.
function peakCentre(parts: HillParts, room: Int32Array, random: () => number) {
  let best = { x: parts.tilesX / 2, z: parts.tilesZ / 2, room: -1 };
  for (let tried = 0; tried < PEAK.tries; tried++) {
    const x = random() * parts.tilesX;
    const z = random() * parts.tilesZ;
    const here = room[Math.floor(z) * parts.tilesX + Math.floor(x)]!;
    if (here > best.room) best = { x, z, room: here };
  }
  return { x: best.x, z: best.z };
}

function knollsFor(parts: HillParts, room: Int32Array): Knoll[] {
  const random = createRandom(parts.seed + HILLS_SALT);
  const count = clamp(Math.round((parts.tilesX * parts.tilesZ) / AREA_PER_HILL), 2, 24);
  const spread = clamp(Math.min(parts.tilesX, parts.tilesZ) * 0.08, 4, 18);
  const peak = knollOf(
    random,
    peakCentre(parts, room, random),
    PEAK.radius + random() * spread * PEAK.spread,
    PEAK.rise,
  );
  const rest = Array.from({ length: count - 1 }, () =>
    knollOf(
      random,
      { x: random() * parts.tilesX, z: random() * parts.tilesZ },
      6 + random() * spread * 1.5,
      { min: 1, max: MAX_RISE },
    ),
  );
  return [peak, ...rest];
}

function riseAt(knoll: Knoll, x: number, z: number): number {
  const across = (x + 0.5 - knoll.x) / knoll.rx;
  const out = (z + 0.5 - knoll.z) / knoll.rz;
  const edge = 1 - WOBBLE + WOBBLE * Math.sin(3 * Math.atan2(out, across) + knoll.phase);
  const off = Math.hypot(across, out) / edge;
  return off < 1 ? Math.ceil(knoll.rise * (1 - off)) : 0;
}

const BEHIND: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
];

const levelAround = (grid: Int32Array, tilesX: number, tilesZ: number) => (x: number, z: number) =>
  x < 0 || z < 0 || x >= tilesX || z >= tilesZ ? 0 : grid[z * tilesX + x]!;

// One pass over the plot in the given direction; true if any cell came down.
function sweep(grid: Int32Array, tilesX: number, tilesZ: number, sign: 1 | -1): boolean {
  const at = levelAround(grid, tilesX, tilesZ);
  let moved = false;
  for (let step = 0; step < grid.length; step++) {
    const cell = sign > 0 ? step : grid.length - 1 - step;
    const x = cell % tilesX;
    const z = Math.floor(cell / tilesX);
    let capped = grid[cell]!;
    for (const [dx, dz] of BEHIND) capped = Math.min(capped, at(x + dx * sign, z + dz * sign) + 1);
    moved ||= capped !== grid[cell];
    grid[cell] = capped;
  }
  return moved;
}

// Sweeps both ways until nothing moves, capping every cell a level above its lowest neighbour,
// diagonals included. Off the plot counts as zero.
function settle(grid: Int32Array, tilesX: number, tilesZ: number): void {
  while (sweep(grid, tilesX, tilesZ, 1) || sweep(grid, tilesX, tilesZ, -1));
}

// Level grass counts as open; sand, water and any step already there hold a hill back.
function roomOf(parts: HillParts): Int32Array {
  const { terrain, level, tilesX, tilesZ } = parts;
  const room = new Int32Array(tilesX * tilesZ);
  const flat = (x: number, z: number): boolean =>
    terrain.surfaceOf(x, z) === 'grass' && terrain.levelOf(x, z) === level;
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) room[z * tilesX + x] = flat(x, z) ? PEAK.rise.max + CLEAR : 0;
  }
  settle(room, tilesX, tilesZ);
  for (let cell = 0; cell < room.length; cell++) room[cell] = Math.max(0, room[cell]! - CLEAR);
  return room;
}

export function hillEditsFor(parts: HillParts): TerrainEdit[] {
  const { level, tilesX, tilesZ } = parts;
  const room = roomOf(parts);
  const knolls = knollsFor(parts, room);
  const rise = new Int32Array(tilesX * tilesZ);
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      const cell = z * tilesX + x;
      let wanted = 0;
      for (const knoll of knolls) wanted = Math.max(wanted, riseAt(knoll, x, z));
      rise[cell] = Math.min(wanted, room[cell]!);
    }
  }
  settle(rise, tilesX, tilesZ);
  const edits: TerrainEdit[] = [];
  for (let cell = 0; cell < rise.length; cell++) {
    if (rise[cell] === 0) continue;
    const x = cell % tilesX;
    const z = Math.floor(cell / tilesX);
    edits.push({ tileX: x, tileZ: z, level: level + rise[cell]!, surface: 'grass' });
  }
  return edits;
}
