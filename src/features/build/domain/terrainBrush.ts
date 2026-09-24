import { MAX_TERRAIN_LEVEL, type Terrain, type TerrainTile } from '../../layout/domain/terrain';
import type { Tile } from '../../layout/domain/resortLayout';
import { CLIMBS } from '../../layout/domain/stairs';

export type TerrainBrush = 'raise' | 'lower' | 'grass' | 'sand' | 'water';

export const TERRAIN_BRUSHES: readonly {
  readonly id: TerrainBrush;
  readonly label: string;
  readonly hint: string;
  readonly glyph: string;
}[] = [
  { id: 'raise', label: 'Raise', hint: 'A level up, feathered off its neighbours', glyph: '▲' },
  { id: 'lower', label: 'Lower', hint: 'A level down, no further than sea level', glyph: '▼' },
  { id: 'grass', label: 'Grass', hint: 'Turf the ground over', glyph: '▩' },
  { id: 'sand', label: 'Sand', hint: 'Lay sand, wherever the ground is', glyph: '▨' },
  { id: 'water', label: 'Water', hint: 'Flood the tile: a river or a lake', glyph: '≈' },
];

export interface TerrainRules {
  readonly terrain: Terrain;
  // Enough on its own: a handrail stands on the paving it guards, so a railed tile is a paved tile.
  readonly isClear: (tileX: number, tileZ: number) => boolean;
}

export interface TerrainChange {
  readonly tile: Tile;
  // Null without `blocked` is a stroke passing over ground it already did, not a refusal.
  readonly next: TerrainTile | null;
  readonly blocked: boolean;
}

const refused = (tile: Tile): TerrainChange => ({ tile, next: null, blocked: true });
const unchanged = (tile: Tile): TerrainChange => ({ tile, next: null, blocked: false });

function besideRange(
  terrain: Terrain,
  tile: Tile,
): { readonly low: number; readonly high: number } {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const { dx, dz } of CLIMBS) {
    const level = terrain.levelOf(tile.x + dx, tile.z + dz);
    low = Math.min(low, level);
    high = Math.max(high, level);
  }
  return { low, high };
}

// Raised water comes up as sand, a sandbank. Sea ground lowered back to sea level
// is sea again, so an island taken apart leaves the coast as it was found.
function surfaceAfter(terrain: Terrain, tile: Tile, level: number): TerrainTile['surface'] {
  const standing = terrain.tileAt(tile.x, tile.z);
  if (level === 0 && terrain.isSea(tile.x, tile.z)) return 'water';
  if (level > standing.level && standing.surface === 'water') return 'sand';
  return standing.surface;
}

function stepped(brush: 'raise' | 'lower', tile: Tile, rules: TerrainRules): TerrainChange {
  const { terrain } = rules;
  const level = terrain.levelOf(tile.x, tile.z);
  const next = brush === 'raise' ? level + 1 : level - 1;
  if (next < 0 || next > MAX_TERRAIN_LEVEL) return refused(tile);
  const beside = besideRange(terrain, tile);
  if (next - beside.low > 1 || beside.high - next > 1) return refused(tile);
  return {
    tile,
    next: { level: next, surface: surfaceAfter(terrain, tile, next) },
    blocked: false,
  };
}

function surfaced(surface: TerrainTile['surface'], tile: Tile, rules: TerrainRules): TerrainChange {
  const { terrain } = rules;
  // Asked of base and level together: a sea tile raised into an island is ordinary land.
  if (terrain.isSea(tile.x, tile.z) && terrain.levelOf(tile.x, tile.z) === 0) return refused(tile);
  const standing = terrain.tileAt(tile.x, tile.z);
  if (standing.surface === surface) return unchanged(tile);
  return { tile, next: { level: standing.level, surface }, blocked: false };
}

// Built even when refused, since the cursor draws refused tiles too. Occupied tiles are
// refused because paving's kind is decided off the ground under it as it is laid.
export function terrainChangeAt(
  brush: TerrainBrush,
  tile: Tile,
  rules: TerrainRules,
): TerrainChange {
  if (!rules.terrain.holds(tile.x, tile.z)) return refused(tile);
  if (!rules.isClear(tile.x, tile.z)) return refused(tile);
  if (brush === 'raise' || brush === 'lower') return stepped(brush, tile, rules);
  return surfaced(brush, tile, rules);
}
