// Water is flush with its bank rather than dug: paving stands at levelOf, so a sunken river would
// carry a sunken bridge and climbAt would read the bank as a flight of stairs into the water.

import type { Elevation, ElevationPlan, TerraceSpec } from './elevation';
import { elevationFor, maxLevelOf, stepStartZ } from './elevation';
import type { Ground } from './ground';
import type { Shore } from './shoreline';
import { shoreFor, waterStartZ } from './shoreline';

export type { Ground };

// Two levels above the tallest crest the generator grows: a ceiling on the tool, not the terrain.
export const MAX_TERRAIN_LEVEL = 8;

// One plot's width all round: an island at the far edge reads as out in the bay, and the renderer's
// box (three times the extent either side) still draws every tile of it.
const APRON = 1;

function apronOf(tiles: number): number {
  return Math.round(tiles * APRON);
}

// Shared: the mesher asks about every tile of a box many times the plot's area on every rebuild.
const SEA: TerrainTile = { level: 0, surface: 'water' };
const BEACH: TerrainTile = { level: 0, surface: 'sand' };
const PLAIN: TerrainTile = { level: 0, surface: 'grass' };

const NO_TERRACES: readonly TerraceSpec[] = [];

export interface TerrainTile {
  readonly level: number;
  readonly surface: Ground;
}

export interface TerrainEdit extends TerrainTile {
  readonly tileX: number;
  readonly tileZ: number;
}

export interface TerrainPlan extends ElevationPlan {
  readonly terrain?: readonly TerrainEdit[];
}

export interface Terrain {
  readonly tilesX: number;
  readonly tilesZ: number;
  tileAt(tileX: number, tileZ: number): TerrainTile;
  levelOf(tileX: number, tileZ: number): number;
  surfaceOf(tileX: number, tileZ: number): Ground;
  // A fact about the base, so a raised island knows it stands in the bay and lowering it gives it back.
  isSea(tileX: number, tileZ: number): boolean;
  holds(tileX: number, tileZ: number): boolean;
  // Never falls: lowering the highest tile costs the pick one empty crossing, but saves walking the
  // plot on every pointer move.
  readonly maxLevel: number;
  readonly edits: readonly TerrainEdit[];
  // An edit that comes back to the base tile is dropped, so the plot keeps no edits that say nothing.
  set(tileX: number, tileZ: number, tile: TerrainTile): void;
}

// Solved once per column: the renderer asks about some hundred thousand tiles per rebuild, and they
// fall in a few hundred columns.
interface ColumnLines {
  readonly water: number;
  readonly steps: readonly number[];
}

function linesAt(shore: Shore | null, elevation: Elevation | null, tileX: number): ColumnLines {
  return {
    water: shore ? waterStartZ(shore, tileX) : Number.POSITIVE_INFINITY,
    steps: elevation
      ? elevation.spec.terraces.map((_, index) => stepStartZ(elevation, index, tileX))
      : [],
  };
}

export interface TerrainParts {
  readonly shore: Shore | null;
  readonly elevation: Elevation | null;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly edits?: readonly TerrainEdit[];
}

export function createTerrain(parts: TerrainParts): Terrain {
  const { shore, elevation, tilesX, tilesZ } = parts;
  const lines = new Map<number, ColumnLines>();
  // Keyed by index: a string key would be an allocation per ask.
  const overrides = new Map<number, TerrainTile>();
  const order: number[] = [];
  let ceiling = maxLevelOf(elevation);

  const apron = {
    minX: -apronOf(tilesX),
    minZ: -apronOf(tilesZ),
    tilesX: tilesX + 2 * apronOf(tilesX),
    tilesZ: tilesZ + 2 * apronOf(tilesZ),
  };

  const holds = (tileX: number, tileZ: number): boolean =>
    tileX >= apron.minX &&
    tileX < apron.minX + apron.tilesX &&
    tileZ >= apron.minZ &&
    tileZ < apron.minZ + apron.tilesZ;

  const cellOf = (tileX: number, tileZ: number): number =>
    (tileZ - apron.minZ) * apron.tilesX + (tileX - apron.minX);

  const linesOf = (tileX: number): ColumnLines => {
    const known = lines.get(tileX);
    if (known) return known;
    const solved = linesAt(shore, elevation, tileX);
    lines.set(tileX, solved);
    return solved;
  };

  const baseAt = (tileX: number, tileZ: number): TerrainTile => {
    const column = linesOf(tileX);
    if (tileZ >= column.water) return SEA;
    // Steps never cross, so the walk stops at the first step the tile is not behind. An indexed loop,
    // because an iterator's garbage per terrace per tile is a collection in the middle of a drag.
    const terraces = elevation?.spec.terraces ?? NO_TERRACES;
    let level = 0;
    let surface: Ground = 'grass';
    let standing = false;
    for (let index = 0; index < terraces.length; index++) {
      if (tileZ >= column.steps[index]!) break;
      const terrace = terraces[index]!;
      level = terrace.level;
      surface = terrace.surface ?? 'grass';
      standing = true;
    }
    if (standing) return { level, surface };
    return shore !== null && tileZ >= column.water - shore.spec.beach ? BEACH : PLAIN;
  };

  const tileAt = (tileX: number, tileZ: number): TerrainTile => {
    if (!holds(tileX, tileZ)) return baseAt(tileX, tileZ);
    return overrides.get(cellOf(tileX, tileZ)) ?? baseAt(tileX, tileZ);
  };

  const terrain: Terrain = {
    tilesX,
    tilesZ,
    tileAt,
    holds,
    levelOf: (tileX, tileZ) => tileAt(tileX, tileZ).level,
    surfaceOf: (tileX, tileZ) => tileAt(tileX, tileZ).surface,
    isSea: (tileX, tileZ) => baseAt(tileX, tileZ).surface === 'water',
    get maxLevel() {
      return ceiling;
    },
    get edits() {
      return order.map((cell) => {
        const row = Math.floor(cell / apron.tilesX);
        const tileZ = row + apron.minZ;
        const tileX = cell - row * apron.tilesX + apron.minX;
        return { tileX, tileZ, ...overrides.get(cell)! };
      });
    },
    set(tileX, tileZ, tile) {
      if (!holds(tileX, tileZ)) return;
      const cell = cellOf(tileX, tileZ);
      const base = baseAt(tileX, tileZ);
      if (tile.level === base.level && tile.surface === base.surface) {
        if (overrides.delete(cell)) order.splice(order.indexOf(cell), 1);
        return;
      }
      if (!overrides.has(cell)) order.push(cell);
      overrides.set(cell, tile);
      ceiling = Math.max(ceiling, tile.level);
    },
  };

  for (const edit of parts.edits ?? []) {
    terrain.set(edit.tileX, edit.tileZ, { level: edit.level, surface: edit.surface });
  }
  return terrain;
}

const AROUND: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function overlooksDrop(terrain: Terrain, tileX: number, tileZ: number): boolean {
  const level = terrain.levelOf(tileX, tileZ);
  return AROUND.some(([dx, dz]) => terrain.levelOf(tileX + dx, tileZ + dz) < level);
}

export function terrainFor(plan: TerrainPlan): Terrain {
  const shore = shoreFor(plan);
  const elevation = elevationFor(plan);
  return createTerrain({
    shore,
    elevation,
    tilesX: plan.tilesX,
    tilesZ: plan.tilesZ,
    ...(plan.terrain ? { edits: plan.terrain } : {}),
  });
}
