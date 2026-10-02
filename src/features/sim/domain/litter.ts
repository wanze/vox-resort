import type { TileRect } from '../../layout/domain/parkShapes';
// Like dirt, litter never fades on its own: the answer to it is a cleaner walking to it.

export interface Litter {
  readonly tilesX: number;
  readonly tilesZ: number;
  // 0 clean, 1 as fouled as a tile gets; row-major like the scenery field.
  readonly level: Float32Array;
  // Bumped on every change, so a drawing can tell whether to redraw.
  version: number;
}

export interface Carrying {
  // Nodes left before the guest gives up on finding a bin; 0 is empty-handed.
  readonly nodes: Int8Array;
}

export interface BinSite {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly reach: number;
}

// About a tile and a half past a bin's reach of 3: a bin beside the snack bar catches most
// of it, and what is dropped lands near where it was bought, which shows where a bin is missing.
export const CARRY_NODES = 6;

export const PIECE = 0.25;

// Two pieces: a single wrapper is not worth an advisor's warning.
export const FOULED_AT = 0.5;

// About one beach stay in seven leaves something behind: a full beach fouls over a day rather
// than an hour, so a cleaner keeps up and a bin by the sand is worth placing.
export const BEACH_LITTER = 0.15;

// A fouled tile costs more than the prettiest tile gives: guests notice mess before flowers.
export const LITTER_WEIGHT = 1;

export function createLitter(tilesX: number, tilesZ: number): Litter {
  const x = Math.max(0, tilesX);
  const z = Math.max(0, tilesZ);
  return { tilesX: x, tilesZ: z, level: new Float32Array(x * z), version: 0 };
}

export function createCarrying(people: number): Carrying {
  return { nodes: new Int8Array(Math.max(0, people)) };
}

const gapTo = (tile: number, start: number, size: number): number =>
  tile < start ? start - tile : tile >= start + size ? tile - (start + size - 1) : 0;

export function binCoverFor(bins: readonly BinSite[], tilesX: number, tilesZ: number): Uint8Array {
  const cover = new Uint8Array(Math.max(0, tilesX) * Math.max(0, tilesZ));
  for (const bin of bins) {
    const x0 = Math.max(0, bin.tileX - bin.reach);
    const x1 = Math.min(tilesX - 1, bin.tileX + bin.tilesX - 1 + bin.reach);
    const z0 = Math.max(0, bin.tileZ - bin.reach);
    const z1 = Math.min(tilesZ - 1, bin.tileZ + bin.tilesZ - 1 + bin.reach);
    for (let z = z0; z <= z1; z++) {
      const dz = gapTo(z, bin.tileZ, bin.tilesZ);
      for (let x = x0; x <= x1; x++) {
        if (Math.max(dz, gapTo(x, bin.tileX, bin.tilesX)) <= bin.reach) cover[z * tilesX + x] = 1;
      }
    }
  }
  return cover;
}

export function pickUp(carrying: Carrying, person: number, chance: number, draw: number): void {
  if (person < 0 || person >= carrying.nodes.length) return;
  if (draw < chance) carrying.nodes[person] = CARRY_NODES;
}

const inGrid = (litter: Litter, tileX: number, tileZ: number): boolean =>
  tileX >= 0 && tileZ >= 0 && tileX < litter.tilesX && tileZ < litter.tilesZ;

// Allocates nothing: it runs on every node a guest reaches.
export function stepWith(
  litter: Litter,
  carrying: Carrying,
  cover: Uint8Array,
  person: number,
  tileX: number,
  tileZ: number,
): void {
  const left = carrying.nodes[person];
  if (left === undefined || left <= 0) return;
  if (!inGrid(litter, tileX, tileZ)) return;
  const tile = tileZ * litter.tilesX + tileX;
  if (cover[tile] === 1) {
    carrying.nodes[person] = 0;
    return;
  }
  carrying.nodes[person] = left - 1;
  if (left === 1) dropAt(litter, cover, tileX, tileZ);
}

// Allocates nothing, for the reason stepWith does.
export function dropAt(litter: Litter, cover: Uint8Array, tileX: number, tileZ: number): boolean {
  if (!inGrid(litter, tileX, tileZ)) return false;
  const tile = tileZ * litter.tilesX + tileX;
  if (cover[tile] === 1) return false;
  const fouled = litter.level[tile]! + PIECE;
  litter.level[tile] = fouled > 1 ? 1 : fouled;
  litter.version++;
  return true;
}

export function litterAt(litter: Litter, tileX: number, tileZ: number): number {
  if (!inGrid(litter, tileX, tileZ)) return 0;
  return litter.level[tileZ * litter.tilesX + tileX]!;
}

export function sweep(litter: Litter, tileX: number, tileZ: number): void {
  if (!inGrid(litter, tileX, tileZ)) return;
  litter.level[tileZ * litter.tilesX + tileX] = 0;
  litter.version++;
}

// Ties break towards the lower index so two runs of the same plot agree.
// Litter only lands where guests go, which is land owned, so a window round it finds every dirty
// tile in a fraction of a big world. Clipped to the grid; the whole grid when left out.
export function windowOf(grid: Pick<Litter, 'tilesX' | 'tilesZ'>, window?: TileRect): TileRect {
  const whole = window ?? { x0: 0, x1: grid.tilesX - 1, z0: 0, z1: grid.tilesZ - 1 };
  return {
    x0: Math.max(0, whole.x0),
    x1: Math.min(grid.tilesX - 1, whole.x1),
    z0: Math.max(0, whole.z0),
    z1: Math.min(grid.tilesZ - 1, whole.z1),
  };
}

// Row by row, in index order as the whole grid would be, so a window never changes who wins a tie.
export function mostLittered(
  litter: Litter,
  eligible: (tile: number) => boolean,
  threshold: number,
  window?: TileRect,
): number {
  const { x0, x1, z0, z1 } = windowOf(litter, window);
  let worst = -1;
  let worstLevel = threshold;
  for (let z = z0; z <= z1; z++) {
    for (let tile = z * litter.tilesX + x0; tile <= z * litter.tilesX + x1; tile++) {
      const level = litter.level[tile]!;
      if (level <= 0 || level < worstLevel || (worst >= 0 && level === worstLevel)) continue;
      if (!eligible(tile)) continue;
      worst = tile;
      worstLevel = level;
    }
  }
  return worst;
}

export interface LitterSummary {
  readonly worst: { readonly tileX: number; readonly tileZ: number } | null;
  readonly worstLevel: number;
  readonly fouled: number;
}

export function litterSummary(litter: Litter, window?: TileRect): LitterSummary {
  const { x0, x1, z0, z1 } = windowOf(litter, window);
  let worst = -1;
  let worstLevel = 0;
  let fouled = 0;
  for (let z = z0; z <= z1; z++) {
    for (let tile = z * litter.tilesX + x0; tile <= z * litter.tilesX + x1; tile++) {
      const level = litter.level[tile]!;
      if (level >= FOULED_AT) fouled++;
      if (level <= worstLevel) continue;
      worst = tile;
      worstLevel = level;
    }
  }
  const at =
    worst < 0 ? null : { tileX: worst % litter.tilesX, tileZ: Math.floor(worst / litter.tilesX) };
  return { worst: at, worstLevel, fouled };
}

// After an edit, litter on a tile no cleaner can stand on any more would never be swept.
export function pruneLitter(
  litter: Litter,
  keeps: (tileX: number, tileZ: number) => boolean,
): void {
  let changed = false;
  for (let z = 0; z < litter.tilesZ; z++) {
    for (let x = 0; x < litter.tilesX; x++) {
      const tile = z * litter.tilesX + x;
      if (litter.level[tile] === 0 || keeps(x, z)) continue;
      litter.level[tile] = 0;
      changed = true;
    }
  }
  if (changed) litter.version++;
}
