/**
 * What a tile of paving turns out to be once the ground under it has had its
 * say, as a path is drawn by hand.
 *
 * `layoutResort` already lays an authored plan this way: paving is a fact about
 * the ground under a tile rather than about the route over it, so the same
 * street is flagstones on grass, decking on sand and a flight of stairs where it
 * climbs a terrace step. This is that rule for the pointer, one tile at a time,
 * and it asks `stairs.ts` the same question the layout does — a path drawn
 * across a step climbs it exactly where a generated one would.
 *
 * **You do not place a flight or a boardwalk, you draw a path.** Both can only
 * ever be wrong when picked by hand: a staircase on flat ground climbs nothing,
 * one facing the wrong way walks into a wall, and decking laid on a lawn is a
 * jetty over grass. Both models say as much about themselves (`groundDecides`),
 * so the palette offers neither and this decides where they go — which leaves one
 * paving tool, and no way to pave a tile wrongly with it.
 *
 * Sand is the easy half: what a tile is made of is a fact about that tile alone,
 * so decking is decided once, as the tile goes down, and never revisited. A step
 * is not, because a step is a fact about two tiles and a stroke can cross one in
 * either direction — so that decision has two halves:
 *
 * - {@link pavingAt} answers for the tile being paved. Drawing *downhill*, the
 *   tile is the lower one and the paving above it is already there, so the tile
 *   itself comes out as the flight.
 * - {@link relaidBy} answers for the tiles already laid. Drawing *uphill*, the
 *   lower tile went down as an ordinary slab a moment ago and only becomes a
 *   flight once the tile above it is paved — so it is lifted and laid again.
 *
 * Between them a stroke comes out the same whichever way it was drawn, and so
 * does a step paved by two separate strokes days apart. Nothing here has to know
 * which gesture is running.
 *
 * Only ever more stairs, never fewer: paving a tile can turn a slab into a
 * flight, and no tile that is already a flight stops being one, so a relaid tile
 * is always a slab and this never has to work out what a flight would have been
 * if it were flat. Taking paving *up* — which nothing can do yet — is the case
 * that would need that, and it belongs with the bulldozer that introduces it.
 */

import {
  derivedKey,
  place,
  type LayoutItem,
  type Placement,
  type Tile,
} from '../../layout/domain/resortLayout';
import { PAVING_IDS } from '../../layout/domain/resortPlan';
import type { LevelProvider } from '../../layout/domain/elevation';
import { climbAt, CLIMBS, type PavedProvider } from '../../layout/domain/stairs';
import type { Rotation } from '../../layout/domain/rotation';
import type { TileOccupancy } from './tileOccupancy';

/** What paving stands on a tile as the plot is edited, or null for none. */
export interface PavedGround {
  (tileX: number, tileZ: number): LayoutItem | null;
}

/** Whether laying this object is a paving gesture at all. */
export function isPaving(item: LayoutItem): boolean {
  return PAVING_IDS.has(item.id);
}

/**
 * What paving stands on each tile, read off the live occupancy index.
 *
 * The index holds keys rather than placements, which is enough: a derived
 * placement's key is its type and its tile — see `derivedKey` — so the paving on
 * a tile is whichever paving type's key the index is holding there, and no key
 * has to be taken apart to find out. A cottage's tile matches none of them and
 * comes back unpaved, which is what the stair rule wants: a flight only ever
 * climbs towards paving.
 */
export function pavedGroundOf(
  occupancy: TileOccupancy,
  paving: readonly LayoutItem[],
): PavedGround {
  return (tileX, tileZ) => {
    const key = occupancy.keyAt({ x: tileX, z: tileZ });
    if (key === undefined) return null;
    return paving.find((item) => key === derivedKey(item.id, tileX, tileZ)) ?? null;
  };
}

/** Everything the paving rule reads that does not change from tile to tile. */
export interface PavingRules {
  /** What paving already stands on a tile, if any. */
  readonly pavedWith: PavedGround;
  /** How high the ground under a tile stands, in levels. */
  readonly levelOf: LevelProvider;
  /** Whether the ground under a tile is sand rather than grass. */
  readonly isSand: (tileX: number, tileZ: number) => boolean;
  /** The decking a path becomes on sand, or null when the catalogue has none. */
  readonly decking: LayoutItem | null;
  /**
   * The flight a path becomes where it climbs, or null when the catalogue has
   * none — in which case a step is simply paved flat, exactly as `layoutResort`
   * treats a catalogue missing one kind of paving.
   */
  readonly stairs: LayoutItem | null;
}

/** An object as it actually goes down: what it is, and the way it faces. */
export interface Paving {
  readonly item: LayoutItem;
  readonly rotation: Rotation;
}

/** Whether a tile has any paving on it, which is what a flight climbs towards. */
const pavedProvider =
  (rules: PavingRules): PavedProvider =>
  (tileX, tileZ) =>
    rules.pavedWith(tileX, tileZ) !== null;

/**
 * What laying `item` on a tile actually lays there.
 *
 * A flight where the tile climbs to paving one level up, turned to face it;
 * decking where the tile is sand; and what was picked everywhere else, which is
 * the flagstones. This sits in front of both the preview and the placement, so
 * the ghost under the pointer shows the flight or the decking before the click
 * rather than after it.
 *
 * The climb is asked first, which is the order `layoutResort` resolves the two in
 * as well. They do meet: `elevationFor` keeps the whole beach on one level, but a
 * terrace anchored right at the sand edge puts the *lower* tile of its step on
 * the landward-most row of sand, and there the flight is the right answer — you
 * climb off the beach rather than walking up decking laid flat against a step.
 *
 * Flat paving is laid **unturned**, whatever the `R` key was left at: a slab has
 * no front, so its turn is the ground's to give and only a flight's climb has
 * anything to say about it. Everything that is not paving keeps the turn it was
 * picked with.
 */
export function pavingAt(
  item: LayoutItem,
  tile: Tile,
  rotation: Rotation,
  rules: PavingRules,
): Paving {
  if (!isPaving(item)) return { item, rotation };
  const { stairs } = rules;
  if (stairs) {
    const climb = climbAt(tile, pavedProvider(rules), rules.levelOf);
    if (climb !== null) return { item: stairs, rotation: climb };
  }
  const decking = rules.isSand(tile.x, tile.z) ? rules.decking : null;
  return { item: decking ?? item, rotation: 0 };
}

/** A tile of paving that has to be laid again, and the paving it replaces. */
export interface Relaid {
  /** The flight to stand on the tile. */
  readonly placement: Placement;
  /** The slab already there, which has to come up first. */
  readonly lifted: Placement;
}

/**
 * The tiles already paved that paving `tile` has just turned into flights.
 *
 * Asked *after* the tile is laid, so the tile counts as paved: what makes a slab
 * next to it a flight is that there is now paving one level above it, and that
 * is only true once the new tile is standing.
 *
 * Asked after *every* placement, too, not only a paved one — nothing but paving
 * can give a slab something to climb to, so a cottage or a hedge simply re-lays
 * nothing, and the pointer needs no second branch to know that.
 *
 * The slab that comes up is rebuilt rather than looked up, which is exact: flat
 * paving — flagstones or decking — is laid unturned and stands on the level of
 * its own tile, here as in `layoutResort`, so there is nothing else it could have
 * been.
 */
export function relaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  const { stairs, levelOf } = rules;
  if (!stairs) return [];
  const isPaved = pavedProvider(rules);
  const relaid: Relaid[] = [];
  for (const { dx, dz } of CLIMBS) {
    const beside: Tile = { x: tile.x + dx, z: tile.z + dz };
    const slab = rules.pavedWith(beside.x, beside.z);
    // A tile that is already a flight is left alone: it climbs somewhere, and
    // re-facing it would only ever move the fudge an L-bend was resolved with.
    if (!slab || slab.id === stairs.id) continue;
    const climb = climbAt(beside, isPaved, levelOf);
    if (climb === null) continue;
    const level = levelOf(beside.x, beside.z);
    relaid.push({
      placement: place(
        stairs,
        derivedKey(stairs.id, beside.x, beside.z),
        beside.x,
        beside.z,
        climb,
        level,
      ),
      lifted: place(slab, derivedKey(slab.id, beside.x, beside.z), beside.x, beside.z, 0, level),
    });
  }
  return relaid;
}
