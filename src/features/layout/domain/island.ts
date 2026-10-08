// Raised out of the sea as the terrain brush raises it, so the island is ordinary land on a sea base
// and taking it apart with the spade gives the bay back.

import { createRandom } from './random';
import { waterStartZ, type Shore } from './shoreline';
import { AROUND, type TerrainEdit } from './terrain';
import { tileKey } from './tileKey';

// The buoys moor three rows out and boats keep two rows beyond them, so nine leaves a channel
// a boat can pass through between the swimmers and the island.
const COAST_CLEAR = 9;

const OFFING = 2;

const SIDE_MARGIN = 2;

// Under a quarter of the radius, or a lobe can pinch the rim through to the sea.
const WOBBLE = 0.12;

const BEACH_DEPTH = 2;

// Four rows in from the rim at the least, so the knoll never stands a level above the sea beside it.
const KNOLL_DEPTH = 4;

const ISLAND_SALT = 0x2e1;

interface IslandSize {
  readonly x: number;
  readonly z: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

// Radii, in tiles. Longer along the coast than out to sea: the bay is shallow and the plot is wide.
export function islandSizeFor(tilesX: number, tilesZ: number): IslandSize {
  return {
    x: clamp(Math.round(tilesX * 0.1), 5, 24),
    z: clamp(Math.round(tilesZ * 0.04), 3, 8),
  };
}

// Measured against the coast at its furthest out, with a row of slack for its rounding.
export function islandBayInset(size: IslandSize, wave: number): number {
  return wave + 1 + COAST_CLEAR + OFFING + 2 * size.z;
}

export interface IslandParts {
  readonly shore: Shore;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly seed: number;
}

interface Outline {
  readonly centre: { readonly x: number; readonly z: number };
  readonly size: IslandSize;
  readonly phase: number;
}

function outlineFor(parts: IslandParts): Outline | null {
  const size = islandSizeFor(parts.tilesX, parts.tilesZ);
  const span = parts.tilesX - 2 * (size.x + SIDE_MARGIN);
  if (span <= 0) return null;
  const random = createRandom(parts.seed + ISLAND_SALT);
  const x = size.x + SIDE_MARGIN + Math.floor(random() * span);
  let top = Number.NEGATIVE_INFINITY;
  for (let tileX = x - size.x; tileX <= x + size.x; tileX++) {
    top = Math.max(top, waterStartZ(parts.shore, tileX) + COAST_CLEAR);
  }
  const bottom = parts.tilesZ - 1 - OFFING;
  if (bottom - top < 2 * size.z) return null;
  return { centre: { x, z: Math.floor((top + bottom) / 2) }, size, phase: random() * Math.PI * 2 };
}

function landOf(outline: Outline): { x: number; z: number }[] {
  const { centre, size, phase } = outline;
  const tiles: { x: number; z: number }[] = [];
  for (let z = centre.z - size.z; z <= centre.z + size.z; z++) {
    for (let x = centre.x - size.x; x <= centre.x + size.x; x++) {
      const across = (x - centre.x) / size.x;
      const out = (z - centre.z) / size.z;
      const edge = 1 - WOBBLE + WOBBLE * Math.sin(3 * Math.atan2(out, across) + phase);
      if (Math.hypot(across, out) <= edge) tiles.push({ x, z });
    }
  }
  return tiles;
}

// Rings in from the rim, counting diagonals, since the level rule counts them too.
function depthsOf(tiles: readonly { x: number; z: number }[]): Map<string, number> {
  const land = new Set(tiles.map((tile) => tileKey(tile.x, tile.z)));
  const depths = new Map<string, number>();
  let ring = tiles.filter((tile) =>
    AROUND.some(([dx, dz]) => !land.has(tileKey(tile.x + dx, tile.z + dz))),
  );
  for (const tile of ring) depths.set(tileKey(tile.x, tile.z), 1);
  for (let depth = 2; ring.length > 0; depth++) {
    const next: { x: number; z: number }[] = [];
    for (const tile of ring) {
      for (const [dx, dz] of AROUND) {
        const key = tileKey(tile.x + dx, tile.z + dz);
        if (!land.has(key) || depths.has(key)) continue;
        depths.set(key, depth);
        next.push({ x: tile.x + dx, z: tile.z + dz });
      }
    }
    ring = next;
  }
  return depths;
}

export function islandEditsFor(parts: IslandParts): TerrainEdit[] {
  const outline = outlineFor(parts);
  if (!outline) return [];
  const tiles = landOf(outline);
  const depths = depthsOf(tiles);
  return tiles.map((tile): TerrainEdit => {
    const depth = depths.get(tileKey(tile.x, tile.z)) ?? 1;
    return {
      tileX: tile.x,
      tileZ: tile.z,
      level: depth >= KNOLL_DEPTH ? 2 : 1,
      surface: depth <= BEACH_DEPTH ? 'sand' : 'grass',
    };
  });
}
