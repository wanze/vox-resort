import type { TileRect } from './parkShapes';
import { createRandom } from './random';
import type { Tile, TurnedTile } from './resortLayout';
import type { Rotation } from './rotation';
import { tileKey } from './tileKey';

export interface BorderGround {
  readonly isPaved: (tileX: number, tileZ: number) => boolean;
  readonly canPlant: (tileX: number, tileZ: number) => boolean;
  readonly favoursStone: (tileX: number, tileZ: number) => boolean;
}

export interface Borders {
  readonly hedges: readonly TurnedTile[];
  readonly walls: readonly TurnedTile[];
}

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

// A district walls a few of its borders in stone and hedges the rest; up a hill or by the sea,
// where a hedge struggles, most of them.
export const STONE_CHANCE = { inland: 0.2, favoured: 0.5 } as const;

const STONE_SALT = 0x5703e;

// Unturned a border lies along x, the way a path beside it to the north or south runs.
function alongPath(ground: BorderGround, tile: Tile): Rotation | null {
  const paved = SIDES.filter(([dx, dz]) => ground.isPaved(tile.x + dx, tile.z + dz));
  if (paved.length !== 1) return null;
  return paved[0]![1] === 0 ? 1 : 0;
}

// Inside a bend the corner has the path on two sides and its arms run off the far sides; outside
// one the path only touches it at a diagonal, and its arms run towards that.
function armsOfCorner(ground: BorderGround, tile: Tile): readonly [Tile, Tile] | null {
  const paved = (dx: number, dz: number): boolean => ground.isPaved(tile.x + dx, tile.z + dz);
  for (const [dx, dz] of DIAGONALS) {
    const inner = paved(dx, 0) && paved(0, dz) && !paved(-dx, 0) && !paved(0, -dz);
    const outer = paved(dx, dz) && SIDES.every(([sx, sz]) => !paved(sx, sz));
    if (inner)
      return [
        { x: tile.x - dx, z: tile.z },
        { x: tile.x, z: tile.z - dz },
      ];
    if (outer)
      return [
        { x: tile.x + dx, z: tile.z },
        { x: tile.x, z: tile.z + dz },
      ];
  }
  return null;
}

function turnsCorner(
  ground: BorderGround,
  straights: ReadonlyMap<string, TurnedTile>,
  tile: Tile,
): boolean {
  if (!ground.canPlant(tile.x, tile.z)) return false;
  const arms = armsOfCorner(ground, tile);
  if (!arms) return false;
  const [alongX, alongZ] = arms.map((arm) => straights.get(tileKey(arm.x, arm.z)));
  return alongX?.rotation === 0 && alongZ?.rotation === 1;
}

function cornersOf(ground: BorderGround, straights: ReadonlyMap<string, TurnedTile>): Tile[] {
  const corners = new Map<string, Tile>();
  for (const { tile } of straights.values()) {
    for (const [dx, dz] of SIDES) {
      const next = { x: tile.x + dx, z: tile.z + dz };
      const key = tileKey(next.x, next.z);
      if (corners.has(key) || straights.has(key)) continue;
      if (turnsCorner(ground, straights, next)) corners.set(key, next);
    }
  }
  return [...corners.values()];
}

function runsOf(tiles: readonly TurnedTile[]): TurnedTile[][] {
  const byKey = new Map(tiles.map((each) => [tileKey(each.tile.x, each.tile.z), each]));
  const runs: TurnedTile[][] = [];
  for (const start of tiles) {
    if (!byKey.delete(tileKey(start.tile.x, start.tile.z))) continue;
    const run = [start];
    for (let head = 0; head < run.length; head++) {
      const { x, z } = run[head]!.tile;
      for (const [dx, dz] of SIDES) {
        const next = byKey.get(tileKey(x + dx, z + dz));
        if (!next) continue;
        byKey.delete(tileKey(x + dx, z + dz));
        run.push(next);
      }
    }
    runs.push(run);
  }
  return runs;
}

// Rolled per district rather than per run, so a street is walled in stone along its whole length
// rather than switching at every lamp that breaks its hedge.
function rollOf(run: readonly TurnedTile[], districts: readonly TileRect[]): number {
  const { x, z } = run[0]!.tile;
  const index = districts.findIndex(
    (rect) => x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1,
  );
  const seed = index >= 0 ? index : Math.imul(x, 73856093) ^ Math.imul(z, 19349663);
  return createRandom(STONE_SALT + seed)();
}

export function bordersFor(
  ring: readonly Tile[],
  ground: BorderGround,
  districts: readonly TileRect[],
): Borders {
  const straights = new Map<string, TurnedTile>();
  for (const tile of ring) {
    if (!ground.canPlant(tile.x, tile.z)) continue;
    const rotation = alongPath(ground, tile);
    if (rotation !== null) straights.set(tileKey(tile.x, tile.z), { tile, rotation });
  }
  const laid = [
    ...straights.values(),
    ...cornersOf(ground, straights).map((tile) => ({ tile, rotation: 0 as Rotation })),
  ];
  const hedges: TurnedTile[] = [];
  const walls: TurnedTile[] = [];
  for (const run of runsOf(laid)) {
    if (run.length < 2) continue;
    const favoured = run.some(({ tile }) => ground.favoursStone(tile.x, tile.z));
    const chance = favoured ? STONE_CHANCE.favoured : STONE_CHANCE.inland;
    (rollOf(run, districts) < chance ? walls : hedges).push(...run);
  }
  return { hedges, walls };
}
