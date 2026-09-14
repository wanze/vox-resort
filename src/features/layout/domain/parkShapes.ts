/**
 * The geometry a park is drawn from: organic ponds, straight runs of path, a
 * mirrored grid of trees, and the spots on a lawn a picnic table fits.
 *
 * Every shape here is **mirror-symmetric about one column**, the park's axis,
 * and exactly so — computed from even functions of the distance to the axis
 * rather than mirrored after the fact in floating point — which is what lets a
 * seeded wobble still read as designed rather than as a puddle.
 */

import { tileKey, type Tile } from './resortLayout';

/** An inclusive rectangle of tiles. */
export interface TileRect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** A straight run of footpath, end tiles included. */
export interface ParkRun {
  readonly from: Tile;
  readonly to: Tile;
}

/** A tree of a park, and which of the park's two species it is. */
export interface ParkTree {
  readonly tile: Tile;
  readonly species: 0 | 1;
}

/**
 * How far a pond's edge strays from an ellipse: `lobes` swells it at the ends
 * and pinches it at the waist (or the other way round when negative), `lean`
 * makes it pear-shaped, heavier to the north or the south.
 */
export interface Wobble {
  readonly lobes: number;
  readonly lean: number;
}

export const NO_WOBBLE: Wobble = { lobes: 0, lean: 0 };

/** The furthest either wobble term goes; beyond it a pond starts to come apart. */
export const WOBBLE_LIMIT = 0.15;

export function rectTiles(rect: TileRect): Tile[] {
  const tiles: Tile[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) tiles.push({ x, z });
  }
  return tiles;
}

/** The tiles a straight run covers, end tiles included. */
export function runTiles(run: ParkRun): Tile[] {
  const tiles: Tile[] = [];
  for (let z = Math.min(run.from.z, run.to.z); z <= Math.max(run.from.z, run.to.z); z++) {
    for (let x = Math.min(run.from.x, run.to.x); x <= Math.max(run.from.x, run.to.x); x++) {
      tiles.push({ x, z });
    }
  }
  return tiles;
}

/** A run reflected about a column. */
export function mirrorRun(run: ParkRun, axis: number): ParkRun {
  return {
    from: { x: 2 * axis - run.from.x, z: run.from.z },
    to: { x: 2 * axis - run.to.x, z: run.to.z },
  };
}

/**
 * The tiles of an organic pond filling a box, symmetric about the box's middle.
 *
 * An ellipse whose radius is modulated by `cos 2θ` and `sin 3θ` — the two
 * low harmonics that are even about the vertical axis — and scaled back so the
 * swollen parts never leave the box. Both are computed from `dx²` and `dz`
 * alone, so a tile and its mirror image always get the same answer.
 *
 * The pond is star-shaped about its centre, so any straight path through the
 * centre crosses one unbroken run of water: one bridge, never two.
 */
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

/** Tiles between one tree of a park's grid and the next, both ways. */
const TREE_PITCH = 3;

/** Whether nothing in a set of tiles is within `reach` tiles of this one, diagonals included. */
function clearOf(blocked: ReadonlySet<string>, tile: Tile, reach: number): boolean {
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (blocked.has(tileKey(tile.x + dx, tile.z + dz))) return false;
    }
  }
  return true;
}

/**
 * Plants a lawn on a grid mirrored about the axis, two species in a
 * checkerboard, with every tree a tile clear of everything in `blocked`. A tree
 * whose mirror image cannot stand is left out with it, so the planting stays
 * symmetric.
 */
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

/** Tables to a side of a park's axis, at most. */
const TABLES_PER_SIDE = 2;

/** Tiles between one picnic table and the next, measured corner to corner. */
const TABLE_SPACING = 4;

/**
 * A picnic table's spot: its north-west tile, and whether it is turned a quarter
 * to stand two tiles along z beside a path running north to south.
 */
export interface TableSpot {
  readonly tile: Tile;
  readonly rotation: 0 | 1;
}

/** The two tiles a table covers. */
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

/** A table's spot reflected about a column. */
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

/**
 * Where a park's picnic tables stand: two-tile spots on the lawn with a path
 * running the length of them, in mirrored pairs.
 *
 * Standing against a path is the point — a table is walked to, and one that
 * touches a path needs no spur of its own. The western half is searched row by
 * row, and each spot is taken with its mirror image or not at all.
 */
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

/** Whether a spot on the western half takes a table, given the ones already chosen. */
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
  // Along a path rather than at its end: both tiles have it on the same side,
  // and on dry ground rather than on a bridge.
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
