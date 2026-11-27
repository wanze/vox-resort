import type { TileRect } from './parkShapes';
import type { Tile } from './resortLayout';
import type { Rotation } from './rotation';
import { tileKey } from './tileKey';

export interface BinGround {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly isStreet: (tileX: number, tileZ: number) => boolean;
  readonly canStand: (tileX: number, tileZ: number) => boolean;
  // Ground the layout may later run a spur across to reach a door.
  readonly isRouted: (tileX: number, tileZ: number) => boolean;
}

export interface Standing {
  readonly rect: TileRect;
  // The layout grows it a spur from the paths.
  readonly reached: boolean;
  // Turned as it stands, in the turn order: +z, +x, -z, -x.
  readonly doorSides: readonly Rotation[];
}

export interface BinSiting {
  readonly stalls: readonly TileRect[];
  readonly standing: readonly Standing[];
  readonly bins: readonly TileRect[];
  readonly reach: number;
  readonly ground: BinGround;
}

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// Two rings out still leaves a bin within its reach of the stall.
const RINGS = 2;

const gapBetween = (a: TileRect, b: TileRect): number =>
  Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.z0 - b.z1, b.z0 - a.z1);

const grown = ({ x0, x1, z0, z1 }: TileRect, by: number): TileRect => ({
  x0: x0 - by,
  x1: x1 + by,
  z0: z0 - by,
  z1: z1 + by,
});

function cornersOf({ x0, x1, z0, z1 }: TileRect): Tile[] {
  return [
    { x: x0 - 1, z: z0 - 1 },
    { x: x1 + 1, z: z0 - 1 },
    { x: x0 - 1, z: z1 + 1 },
    { x: x1 + 1, z: z1 + 1 },
  ];
}

function bordersOf({ x0, x1, z0, z1 }: TileRect): Tile[] {
  const sides: Tile[] = [];
  for (let x = x0; x <= x1; x++) sides.push({ x, z: z0 - 1 }, { x, z: z1 + 1 });
  for (let z = z0; z <= z1; z++) sides.push({ x: x0 - 1, z }, { x: x1 + 1, z });
  return sides;
}

const byStreet = (ground: BinGround, tile: Tile): boolean =>
  SIDES.some(([dx, dz]) => ground.isStreet(tile.x + dx, tile.z + dz));

// Steps from each routed tile to one beside a street, the way the layout's spur search walks.
function stepsToStreet(ground: BinGround, blocked: ReadonlySet<string>): Int32Array {
  const { tilesX, tilesZ } = ground;
  const steps = new Int32Array(tilesX * tilesZ).fill(-1);
  const open = (x: number, z: number): boolean =>
    x >= 0 &&
    z >= 0 &&
    x < tilesX &&
    z < tilesZ &&
    ground.isRouted(x, z) &&
    !ground.isStreet(x, z) &&
    !blocked.has(tileKey(x, z));
  const queue: number[] = [];
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      if (!open(x, z) || !byStreet(ground, { x, z })) continue;
      steps[z * tilesX + x] = 0;
      queue.push(z * tilesX + x);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    const x = at % tilesX;
    const z = (at - x) / tilesX;
    for (const [dx, dz] of SIDES) {
      const next = (z + dz) * tilesX + x + dx;
      if (!open(x + dx, z + dz) || steps[next] !== -1) continue;
      steps[next] = steps[at]! + 1;
      queue.push(next);
    }
  }
  return steps;
}

// A spur that would run through a bin is at most this long: every door stands near a street.
const SPUR_REACH = 8;

const besideOf = (tile: Tile): Tile[] =>
  SIDES.map(([dx, dz]) => ({ x: tile.x + dx, z: tile.z + dz }));

function reachesStreetWithin(
  from: Tile,
  limit: number,
  open: (tile: Tile) => boolean,
  stepsAt: (tileX: number, tileZ: number) => number,
): boolean {
  const seen = new Set([tileKey(from.x, from.z)]);
  const unseen = (tile: Tile): boolean => {
    const key = tileKey(tile.x, tile.z);
    if (seen.has(key) || !open(tile)) return false;
    seen.add(key);
    return true;
  };
  let ring = [from];
  for (let depth = 0; depth <= limit && ring.length > 0; depth++) {
    if (ring.some((tile) => stepsAt(tile.x, tile.z) === 0)) return true;
    ring = ring.flatMap(besideOf).filter(unseen);
  }
  return false;
}

// Only where a spur starts matters: a bin may stand on any other tile so long as each of those
// near it still reaches a street in as few steps. Bins already stood are walls to that search.
function lengthensNoSpur(
  tile: Tile,
  stepsAt: (tileX: number, tileZ: number) => number,
  doorSteps: ReadonlySet<string>,
  taken: ReadonlySet<string>,
): boolean {
  const here = stepsAt(tile.x, tile.z);
  if (here < 0) return true;
  const open = (step: Tile): boolean =>
    (step.x !== tile.x || step.z !== tile.z) &&
    !taken.has(tileKey(step.x, step.z)) &&
    stepsAt(step.x, step.z) >= 0;
  for (let dx = -SPUR_REACH; dx <= SPUR_REACH; dx++) {
    for (let dz = -SPUR_REACH; dz <= SPUR_REACH; dz++) {
      const door = { x: tile.x + dx, z: tile.z + dz };
      if (!doorSteps.has(tileKey(door.x, door.z))) continue;
      const away = stepsAt(door.x, door.z);
      if (away < here + Math.abs(dx) + Math.abs(dz)) continue;
      if (!reachesStreetWithin(door, away, open, stepsAt)) return false;
    }
  }
  return true;
}

function sideOf({ x0, x1, z0, z1 }: TileRect, side: Rotation): Tile[] {
  const tiles: Tile[] = [];
  if (side % 2 === 0) {
    const z = side === 0 ? z1 + 1 : z0 - 1;
    for (let x = x0; x <= x1; x++) tiles.push({ x, z });
  } else {
    const x = side === 1 ? x1 + 1 : x0 - 1;
    for (let z = z0; z <= z1; z++) tiles.push({ x, z });
  }
  return tiles;
}

function nearestBorderOf(
  rect: TileRect,
  stepsAt: (tileX: number, tileZ: number) => number,
): Tile[] {
  const border = bordersOf(rect).filter((tile) => stepsAt(tile.x, tile.z) >= 0);
  const nearest = Math.min(...border.map((tile) => stepsAt(tile.x, tile.z)));
  return border.filter((tile) => stepsAt(tile.x, tile.z) === nearest);
}

// A spur leaves from a door step, anywhere along the side the door is on since a style may move
// it; without a door, from the border tiles nearest the paths.
function spurStartsOf(
  standing: readonly Standing[],
  stepsAt: (tileX: number, tileZ: number) => number,
): Set<string> {
  const starts = new Set<string>();
  for (const { rect, reached, doorSides } of standing) {
    if (!reached) continue;
    const tiles =
      doorSides.length > 0
        ? doorSides.flatMap((side) => sideOf(rect, side))
        : nearestBorderOf(rect, stepsAt);
    for (const tile of tiles) starts.add(tileKey(tile.x, tile.z));
  }
  return starts;
}

// A bin one tile short of its reach from a stall still catches everything bought there, so two
// stalls side by side share one rather than standing a pair.
export function binTilesFor({ stalls, standing, bins, reach, ground }: BinSiting): Tile[] {
  const taken = new Set<string>();
  for (const { rect } of standing) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      for (let z = rect.z0; z <= rect.z1; z++) taken.add(tileKey(x, z));
    }
  }
  const steps = stepsToStreet(ground, taken);
  const stepsAt = (x: number, z: number): number =>
    x >= 0 && z >= 0 && x < ground.tilesX && z < ground.tilesZ ? steps[z * ground.tilesX + x]! : -1;
  const starts = spurStartsOf(standing, stepsAt);
  const sited = [...bins];
  const placed: Tile[] = [];
  const free = (tile: Tile): boolean => {
    const key = tileKey(tile.x, tile.z);
    if (taken.has(key) || starts.has(key) || ground.isStreet(tile.x, tile.z)) return false;
    if (!ground.canStand(tile.x, tile.z)) return false;
    return lengthensNoSpur(tile, stepsAt, starts, taken);
  };
  for (const stall of stalls) {
    if (sited.some((bin) => gapBetween(bin, stall) < reach)) continue;
    const around = Array.from({ length: RINGS }, (_, ring) => grown(stall, ring)).flatMap((rect) =>
      cornersOf(rect).concat(bordersOf(rect)),
    );
    // By a street if it can, where the guests walking off with their food pass it.
    const tile = around.find((each) => free(each) && byStreet(ground, each)) ?? around.find(free);
    if (!tile) continue;
    placed.push(tile);
    taken.add(tileKey(tile.x, tile.z));
    sited.push({ x0: tile.x, x1: tile.x, z0: tile.z, z1: tile.z });
  }
  return placed;
}
