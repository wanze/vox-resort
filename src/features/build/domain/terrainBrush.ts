/**
 * What a terrain gesture means: what one tile would become, and whether it may.
 *
 * The counterpart of `buildPlan.ts`. That one answers "where would this object
 * stand and may it"; this answers "what would this tile become and may it". Both
 * are arithmetic over tiles, so the pointer in `adapters/terrainPointer.ts` is
 * left with events and none of the rules.
 *
 * Five brushes, and between them they are the two facts a tile is — see
 * `layout/domain/terrain.ts`. Raise and lower move the level; grass, sand and
 * water set the surface. Nothing sets both, which is why an island is built by
 * raising the sea rather than by a brush called "island".
 *
 * Four rules, and each of them is a rule somewhere else read from this side:
 *
 * - **The ground has to be clear.** An object stands on one level and has a flat
 *   underside, so moving the ground under a cottage would bury half of it —
 *   `elevation.ts` says why at length. Paving is worse than that: whether a tile
 *   is flagstones, decking, a flight or a pier is decided *as it is laid*, off
 *   the ground under it, so changing that ground afterwards leaves paving that
 *   is the wrong kind and a flight that climbs nothing. Rather than re-deriving
 *   the plot after every spadeful, a tile with anything on it is simply not
 *   diggable, which is also the rule anybody would guess.
 * - **Neighbours differ by at most one level.** The invariant `elevation.ts`
 *   holds every generated plot to, and the one the flights of stairs rest on: a
 *   two-level step is a step nothing in the catalogue can climb, and a path
 *   drawn over it comes out as two slabs with a wall between them. So the tool
 *   refuses it, which is what makes terracing by hand feel like terracing —
 *   ground is feathered up a level at a time rather than pulled into a tower.
 * - **The sea cannot be changed.** It is not the plot's to move: the coast is
 *   what the bay, the buoys, the balloons and the beach are all measured off.
 *   What it *can* have is something stood in it, which is why raising a sea tile
 *   is allowed and painting one is not — an island is land on top of the bay,
 *   not a hole in it.
 * - **Sea level is the floor.** Below it the infinite grass plane the whole
 *   resort stands on would cover the ground, and a negative level has nothing to
 *   mean anyway: sea level is where the sea is.
 *
 * A brush that would change nothing comes back as no change rather than as a
 * refusal, because the two read differently under the cursor: painting sand on
 * sand is not a mistake, it is a stroke passing over ground it has already done.
 */

import { MAX_TERRAIN_LEVEL, type Terrain, type TerrainTile } from '../../layout/domain/terrain';
import type { Tile } from '../../layout/domain/resortLayout';
import { CLIMBS } from '../../layout/domain/stairs';

/**
 * The five terrain brushes.
 *
 * Named by what they do to the ground rather than by what you get — `water` digs
 * a river or a lake depending only on where it is dragged, and `raise` makes a
 * dune, a terrace or an island out of the same one rule.
 */
export type TerrainBrush = 'raise' | 'lower' | 'grass' | 'sand' | 'water';

/**
 * The brushes as the palette offers them, in the order they belong on a shelf:
 * the two that move the ground, then the three that surface it.
 *
 * Here rather than in the component for the reason the catalogue's own shelves
 * are derived rather than written out: the label and the hint are facts about
 * the brush, and a component that held them would be a second place to change
 * when a brush is added.
 */
export const TERRAIN_BRUSHES: readonly {
  readonly id: TerrainBrush;
  readonly label: string;
  /** What the tile says on hover, which is the whole of the tool's manual. */
  readonly hint: string;
  /** Glyph the tile shows instead of a model preview; a brush has no art. */
  readonly glyph: string;
}[] = [
  { id: 'raise', label: 'Raise', hint: 'A level up, feathered off its neighbours', glyph: '▲' },
  { id: 'lower', label: 'Lower', hint: 'A level down, no further than sea level', glyph: '▼' },
  { id: 'grass', label: 'Grass', hint: 'Turf the ground over', glyph: '▩' },
  { id: 'sand', label: 'Sand', hint: 'Lay sand, wherever the ground is', glyph: '▨' },
  { id: 'water', label: 'Water', hint: 'Flood the tile: a river or a lake', glyph: '≈' },
];

/** Everything a brush reads that does not change from tile to tile. */
export interface TerrainRules {
  readonly terrain: Terrain;
  /**
   * Whether nothing at all stands on a tile.
   *
   * The occupancy index answers it, and it is enough on its own: a handrail
   * stands on the paving it guards rather than on ground of its own, so a tile
   * with a rail on it is a tile with paving on it. See `tileOccupancy.ts`.
   */
  readonly isClear: (tileX: number, tileZ: number) => boolean;
}

/** What a brush would do to one tile. */
export interface TerrainChange {
  readonly tile: Tile;
  /**
   * The ground the tile would become, or null when the brush changes nothing
   * there — which is not the same as being refused.
   */
  readonly next: TerrainTile | null;
  /** True when the brush may not touch this tile at all; the cursor says so. */
  readonly blocked: boolean;
}

const refused = (tile: Tile): TerrainChange => ({ tile, next: null, blocked: true });
const unchanged = (tile: Tile): TerrainChange => ({ tile, next: null, blocked: false });

/** The lowest and highest level among a tile's four orthogonal neighbours. */
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

/**
 * What raising or lowering a tile leaves it made of.
 *
 * Two cases are not "whatever it already was", and both are about water:
 *
 * - **Water raised out of itself comes up as sand.** What breaks the surface of
 *   a bay is a sandbank, and the same is true of a stone in a stream — so this
 *   is what makes an island an island, and what fills a river in, off one rule.
 * - **Sea ground brought back down to sea level is sea again.** A tile that
 *   answers exactly its base is dropped as an edit, so an island taken apart
 *   leaves the coast as it was found rather than as a dry hole in the bay. See
 *   `Terrain.set`.
 *
 * Everything else keeps its surface: raising a lawn gives a grass terrace and
 * raising a dune gives more dune.
 */
function surfaceAfter(terrain: Terrain, tile: Tile, level: number): TerrainTile['surface'] {
  const standing = terrain.tileAt(tile.x, tile.z);
  if (level === 0 && terrain.isSea(tile.x, tile.z)) return 'water';
  if (level > standing.level && standing.surface === 'water') return 'sand';
  return standing.surface;
}

/** Raising or lowering by one level, feathered against the neighbours. */
function stepped(brush: 'raise' | 'lower', tile: Tile, rules: TerrainRules): TerrainChange {
  const { terrain } = rules;
  const level = terrain.levelOf(tile.x, tile.z);
  const next = brush === 'raise' ? level + 1 : level - 1;
  if (next < 0 || next > MAX_TERRAIN_LEVEL) return refused(tile);
  const beside = besideRange(terrain, tile);
  // One rule for both directions: the tile has to end up within a level of
  // everything touching it, whichever way it is being moved.
  if (next - beside.low > 1 || beside.high - next > 1) return refused(tile);
  return {
    tile,
    next: { level: next, surface: surfaceAfter(terrain, tile, next) },
    blocked: false,
  };
}

/** Painting a surface on, which leaves the level exactly where it was. */
function surfaced(surface: TerrainTile['surface'], tile: Tile, rules: TerrainRules): TerrainChange {
  const { terrain } = rules;
  // The one tile no brush may paint. Asked of the base and of the level
  // together: a sea tile raised into an island is ordinary land now, and its
  // sand may be turfed over like anybody else's.
  if (terrain.isSea(tile.x, tile.z) && terrain.levelOf(tile.x, tile.z) === 0) return refused(tile);
  const standing = terrain.tileAt(tile.x, tile.z);
  if (standing.surface === surface) return unchanged(tile);
  return { tile, next: { level: standing.level, surface }, blocked: false };
}

/**
 * What a brush would do to one tile, and whether it may.
 *
 * The plan is built whether or not it is refused, because the cursor draws a
 * refused tile too — a red patch where the spade would have gone is how the
 * pointer says why nothing happened.
 */
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
