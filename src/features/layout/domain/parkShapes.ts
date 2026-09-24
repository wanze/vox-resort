import { tileKey, type Tile } from './resortLayout';

export interface TileRect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface ParkRun {
  readonly from: Tile;
  readonly to: Tile;
}

export interface ParkTree {
  readonly tile: Tile;
  readonly species: 0 | 1;
}

export interface Wobble {
  readonly lobes: number;
  readonly lean: number;
}

export const NO_WOBBLE: Wobble = { lobes: 0, lean: 0 };

// Beyond this a pond starts to come apart.
export const WOBBLE_LIMIT = 0.15;

export function rectTiles(rect: TileRect): Tile[] {
  const tiles: Tile[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) tiles.push({ x, z });
  }
  return tiles;
}

export function runTiles(run: ParkRun): Tile[] {
  const tiles: Tile[] = [];
  for (let z = Math.min(run.from.z, run.to.z); z <= Math.max(run.from.z, run.to.z); z++) {
    for (let x = Math.min(run.from.x, run.to.x); x <= Math.max(run.from.x, run.to.x); x++) {
      tiles.push({ x, z });
    }
  }
  return tiles;
}

export function mirrorRun(run: ParkRun, axis: number): ParkRun {
  return {
    from: { x: 2 * axis - run.from.x, z: run.from.z },
    to: { x: 2 * axis - run.to.x, z: run.to.z },
  };
}

// Harmonics even about the vertical axis, computed from dx^2 and dz alone, so a tile
// and its mirror always agree. Star-shaped, so a path through the centre needs one bridge.
export function blobTiles(box: TileRect, wobble: Wobble): Tile[] {
  const lobes = clampWobble(wobble.lobes);
  const lean = clampWobble(wobble.lean);
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const rx = (box.x1 - box.x0 + 1) / 2;
  const rz = (box.z1 - box.z0 + 1) / 2;
  const scale = 1 + Math.abs(lobes) + Math.abs(lean);
  return rectTiles(box).filter((tile) => {
    const across = ((tile.x - cx) / rx) ** 2;
    const down = (tile.z - cz) / rz;
    const squared = across + down * down;
    if (squared === 0) return true;
    const cos2 = (across - down * down) / squared;
    const sin = down / Math.sqrt(squared);
    const sin3 = 3 * sin - 4 * sin ** 3;
    const reach = (1 + lobes * cos2 + lean * sin3) / scale;
    return squared <= reach * reach;
  });
}

const clampWobble = (value: number): number =>
  Math.min(WOBBLE_LIMIT, Math.max(-WOBBLE_LIMIT, value));

const TREE_PITCH = 3;

function clearOf(blocked: ReadonlySet<string>, tile: Tile, reach: number): boolean {
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (blocked.has(tileKey(tile.x + dx, tile.z + dz))) return false;
    }
  }
  return true;
}

// A tree whose mirror image cannot stand is left out with it, keeping the planting symmetric.
export function plantGrid(parts: {
  readonly rect: TileRect;
  readonly axis: number;
  readonly anchorZ: number;
  readonly blocked: ReadonlySet<string>;
}): ParkTree[] {
  const { rect, axis, anchorZ, blocked } = parts;
  const reach = Math.min(axis - rect.x0, rect.x1 - axis);
  const trees: ParkTree[] = [];
  const lowRow = Math.ceil((rect.z0 - anchorZ) / TREE_PITCH);
  const highRow = Math.floor((rect.z1 - anchorZ) / TREE_PITCH);
  for (let row = lowRow; row <= highRow; row++) {
    for (let column = -Math.floor(reach / TREE_PITCH); column * TREE_PITCH <= reach; column++) {
      const tile = { x: axis + column * TREE_PITCH, z: anchorZ + row * TREE_PITCH };
      const mirror = { x: 2 * axis - tile.x, z: tile.z };
      if (!clearOf(blocked, tile, 1) || !clearOf(blocked, mirror, 1)) continue;
      trees.push({ tile, species: ((Math.abs(column) + Math.abs(row)) % 2) as 0 | 1 });
    }
  }
  return trees;
}

const TABLES_PER_SIDE = 2;

const TABLE_SPACING = 4;

// tile is the north-west tile; rotation 1 stands the table two tiles along z.
export interface TableSpot {
  readonly tile: Tile;
  readonly rotation: 0 | 1;
}

export function tableTiles(spot: TableSpot): Tile[] {
  const { x, z } = spot.tile;
  return spot.rotation === 0
    ? [
        { x, z },
        { x: x + 1, z },
      ]
    : [
        { x, z },
        { x, z: z + 1 },
      ];
}

const mirrorSpot = (spot: TableSpot, axis: number): TableSpot => ({
  tile: { x: 2 * axis - spot.tile.x - (spot.rotation === 0 ? 1 : 0), z: spot.tile.z },
  rotation: spot.rotation,
});

interface TableGround {
  readonly rect: TileRect;
  readonly axis: number;
  readonly paved: ReadonlySet<string>;
  readonly water: ReadonlySet<string>;
  readonly taken: ReadonlySet<string>;
}

// Tables stand against a path so they need no spur of their own, and are taken
// with their mirror image or not at all.
export function tableSpots(ground: TableGround): TableSpot[] {
  const { rect, axis } = ground;
  const chosen: TableSpot[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x < axis; x++) {
      for (const rotation of [0, 1] as const) {
        if (chosen.length >= TABLES_PER_SIDE) return withMirrors(chosen, axis);
        const spot = { tile: { x, z }, rotation };
        if (takesTable(ground, chosen, spot)) chosen.push(spot);
      }
    }
  }
  return withMirrors(chosen, axis);
}

function takesTable(ground: TableGround, chosen: readonly TableSpot[], spot: TableSpot): boolean {
  const { axis } = ground;
  const onWest = tableTiles(spot).every((tile) => tile.x < axis);
  const spaced = chosen.every(
    (other) =>
      Math.max(Math.abs(other.tile.x - spot.tile.x), Math.abs(other.tile.z - spot.tile.z)) >=
      TABLE_SPACING,
  );
  return onWest && spaced && tableFits(ground, spot) && tableFits(ground, mirrorSpot(spot, axis));
}

const withMirrors = (spots: readonly TableSpot[], axis: number): TableSpot[] =>
  spots.flatMap((spot) => [spot, mirrorSpot(spot, axis)]);

function tableFits(ground: TableGround, spot: TableSpot): boolean {
  const { rect, paved, water, taken } = ground;
  const tiles = tableTiles(spot);
  const inside = tiles.every(
    (tile) => tile.x >= rect.x0 && tile.x <= rect.x1 && tile.z >= rect.z0 && tile.z <= rect.z1,
  );
  const free = tiles.every((tile) => {
    const key = tileKey(tile.x, tile.z);
    return !paved.has(key) && !taken.has(key) && !water.has(key);
  });
  // Along a path rather than at its end, and on dry ground rather than a bridge.
  const sides =
    spot.rotation === 0
      ? [
          [0, -1],
          [0, 1],
        ]
      : [
          [-1, 0],
          [1, 0],
        ];
  const alongside = sides.some(([dx, dz]) =>
    tiles.every((tile) => {
      const key = tileKey(tile.x + dx!, tile.z + dz!);
      return paved.has(key) && !water.has(key);
    }),
  );
  return inside && free && alongside;
}
