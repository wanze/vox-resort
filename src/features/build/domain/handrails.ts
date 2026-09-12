/**
 * Which handrails an edit stands, and which it takes away, as the plot is edited
 * by hand.
 *
 * `railings.ts` already says which paved tiles want a rail and along which edge,
 * and `layoutResort` asks it once for a whole authored plan. This is the other
 * shape of the same question, the one a pointer needs: paving one tile does not
 * only rail that tile, it re-rails the ground around it, and some of what was
 * standing there has to come back down.
 *
 * Both editing tools ask it, and the second is the one worth naming. A rail is a
 * fact about the ground *beside* a paved tile — whether it drops away, and
 * whether it is water — so the terrain tool changes the answer as surely as the
 * paving tool does: raise the ground next to a promenade and that edge stops
 * being a fall, flood it and a lawn becomes something you could fall into. One
 * question, asked from both sides; see {@link reRailAround}.
 *
 * **Paving takes rails away as well as putting them up**, which is what makes
 * this a diff rather than a list. Every case is the one rule in `railings.ts` —
 * paving is always the way through — read from the other side:
 *
 * - A walk along the top of a terrace is railed against the drop to the south.
 *   Pave the tile below it and that edge is a way down rather than a fall, so the
 *   rail goes.
 * - The tile that was paved is the lower half of a step, so it comes out as a
 *   flight and wants a balustrade up both flanks — and the edge rails it was
 *   given a moment ago, when it was still a flat slab on the lip of the drop,
 *   are not what a staircase wears.
 * - Pave alongside an existing flight and the two are one wide staircase, which
 *   is left open: that flight's balustrade comes down.
 *
 * **Only the tile and its four neighbours.** What rails a tile is what it stands
 * next to: whether each neighbour is paved, how high it stands, and — through
 * `climbAt` — the same two facts again. Paving a tile changes those answers for
 * the tile itself and for the four tiles touching it, and for nothing further
 * out, because a tile two steps away has no neighbour whose paving changed.
 *
 * **Recomputed rather than adjusted.** Each of those five tiles is re-asked from
 * scratch what rails it wants, and the answer is diffed against what stands on
 * it. Nothing here has to know which of the cases above it is looking at, or
 * which gesture is running, and a stroke drawn in either direction — or a step
 * paved by two strokes days apart — comes out the same, exactly as the paving
 * itself does.
 */

import {
  railPlacementsFor,
  type Placement,
  type RailModels,
  type Tile,
} from '../../layout/domain/resortLayout';
import { railsAt, type WaterProvider } from '../../layout/domain/railings';
import type { LevelProvider } from '../../layout/domain/elevation';
import { CLIMBS, type PavedProvider } from '../../layout/domain/stairs';
import type { PavedGround } from './paving';

/** The rails standing on one tile, whichever kind they are. */
export interface StandingRails {
  (tileX: number, tileZ: number): readonly Placement[];
}

/** Everything the rail rule reads that does not change from tile to tile. */
export interface HandrailRules {
  /** What paving already stands on a tile, if any; a rail only ever guards paving. */
  readonly pavedWith: PavedGround;
  /** How high the ground under a tile stands, in levels. */
  readonly levelOf: LevelProvider;
  /**
   * Whether a tile is open water, which a jetty's edge has to be guarded against
   * even though the sea beside it is at the pier's own level. See `railings.ts`.
   */
  readonly isWater: WaterProvider;
  /** The rail models the catalogue offers, either of which may be missing. */
  readonly models: RailModels;
  /** What rails are standing now, which is what the recomputed answer is diffed against. */
  readonly standing: StandingRails;
}

/** The rails an edit changes: the ones to stand, and the ones to take down. */
export interface RailChange {
  readonly stand: readonly Placement[];
  readonly lift: readonly Placement[];
}

/** The tile that was paved, and the four whose answer it changed. */
const AROUND: readonly { readonly dx: number; readonly dz: number }[] = [
  { dx: 0, dz: 0 },
  ...CLIMBS.map(({ dx, dz }) => ({ dx, dz })),
];

/**
 * The rails paving `tile` has just changed, standing and lifted.
 *
 * Asked *after* the tile is standing, and after any slab it turned into a flight
 * has been re-laid, so what is paved is what the rule reads. Asked after every
 * placement too, not only a paved one: a cottage rails nothing and re-rails
 * nothing, so the pointer needs no second branch to know that.
 *
 * A rail already standing where one belongs is left alone rather than lifted and
 * stood again, which is what a key that says everything a rail is buys — a
 * stroke along the top of a terrace re-rails only its own far end.
 */
export function railChangeAt(tile: Tile, rules: HandrailRules): RailChange {
  const { pavedWith, levelOf, isWater, models, standing } = rules;
  const isPaved: PavedProvider = (tileX, tileZ) => pavedWith(tileX, tileZ) !== null;
  const stand: Placement[] = [];
  const lift: Placement[] = [];
  for (const { dx, dz } of AROUND) {
    const around: Tile = { x: tile.x + dx, z: tile.z + dz };
    // Bare ground is skipped rather than asked: a rail guards paving, so an
    // unpaved tile wants none and can have none standing on it either. Paving is
    // only ever laid, never taken up, so there is nothing there to clear.
    if (!isPaved(around.x, around.z)) continue;
    const wanted = railPlacementsFor(models, railsAt(around, isPaved, levelOf, isWater), levelOf);
    const already = standing(around.x, around.z);
    const wantedKeys = new Set(wanted.map((rail) => rail.key));
    const standingKeys = new Set(already.map((rail) => rail.key));
    for (const rail of wanted) if (!standingKeys.has(rail.key)) stand.push(rail);
    for (const rail of already) if (!wantedKeys.has(rail.key)) lift.push(rail);
  }
  return { stand, lift };
}

/** Where a rail change is handed to: the world that actually stands them. */
export interface RailSink {
  (stand: readonly Placement[], lift: readonly Placement[]): void;
}

/**
 * Re-rails the ground around a tile something has just happened to.
 *
 * The shape both editing tools want, and the reason it is here rather than in
 * each of them: paving a tile rails the ground around it, and *raising* that
 * ground rails the paving, so the two pointers ask the same question at the same
 * moment — after the tile has changed — and had the same four lines in them to
 * do it.
 *
 * A change that changes nothing says nothing at all rather than handing the
 * caller two empty lists, so a row of cottages or a stroke across open lawn does
 * not tell the HUD the scene changed once per tile.
 */
export function reRailAround(tile: Tile, rules: HandrailRules, onRails: RailSink): void {
  const { stand, lift } = railChangeAt(tile, rules);
  if (stand.length === 0 && lift.length === 0) return;
  onRails(stand, lift);
}
