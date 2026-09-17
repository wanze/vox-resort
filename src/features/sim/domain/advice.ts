/**
 * What the resort is getting wrong, ranked, in the plot's own words.
 *
 * Everything needed to say "you need another bakery" was already measured and
 * none of it was ever said. The router knows which lines it turned people away
 * from; `doors.ts` knows which buildings nothing can walk to; `homes.ts` knows
 * which parties got no bed; `venuesOn` knows which of the five needs nothing on
 * the plot serves. A player saw a queue if they happened to be looking at it,
 * and nothing else.
 *
 * ## It computes nothing
 *
 * Every number here is one somebody else counted. This module ranks facts; it
 * does not gather them, and it must never be the reason something else in
 * `sim/` starts counting differently. **Advice observes.** If a rule seems to
 * want a change in `chooseVenue.ts` or `occupancy.ts`, the rule is wrong: what
 * has been found is a bug in the thing being observed, and it is worth more as
 * a bug report than as a weighting.
 *
 * ## One small function per rule
 *
 * Six rules, each a function of {@link ResortFacts} alone, each testable on a
 * literal. That is not only house style: a rule that cannot be tested on a
 * literal is a rule reading more of the world than it should, and one big
 * `adviceFor` with six branches would hide exactly that. A seventh rule -
 * cleanliness, weather - is a seventh function and a seventh test, never a
 * branch in one of these.
 *
 * ## It knows what a bakery is for, never what a bakery is
 *
 * Every rule reads the art's own declarations - what a venue satisfies, how many
 * it holds, where its doors are - so a model that serves a new need produces new
 * advice with no change here. There is no list of ids in this file and there
 * must not be one.
 *
 * ## The wording is not here
 *
 * A rule hands back a kind, a weight, a subject already named and the count that
 * produced it. Turning that into a sentence is `AdvicePanel.tsx`'s job, for the
 * reason `InspectPanel.tsx` keeps its own `NEED_LABELS`: the domain should not
 * have to be edited to change a phrase.
 */

import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { ARCHETYPES } from './archetypes';
import type { VenueDoors } from './doors';
import type { Lodging } from './lodgings';
import { NEEDS } from './needs';
import { reliefAt, type Venue } from './venues';

/** What one piece of advice is about. */
export type AdviceKind =
  | 'no-beds'
  | 'unserved-need'
  | 'full-lines'
  | 'unreachable'
  | 'far-from-home'
  | 'unvisited';

export interface Advice {
  readonly kind: AdviceKind;
  /**
   * How badly it wants saying, 0..1. What the list is sorted by, and the only
   * number the panel needs to decide what to show.
   */
  readonly weight: number;
  /** What it is about - a venue's label, a lodging's, a need's - already named. */
  readonly subject: string;
  /** The count that produced it: guests, balks, tiles. Worded by the panel. */
  readonly count: number;
  /**
   * Which one of them, in tiles, where the advice is about one building; null
   * where it is about the whole plot.
   *
   * A label is not an address. A plot stands nine Changing Cabins and four
   * Bungalows, so "Nobody visited Changing Cabins today" twice over is two
   * lines the player cannot act on and cannot tell apart. The tile is what the
   * inspector already titles a building with - `Bakery, tile 12, 7` - so it is
   * vocabulary the HUD has taught already, and it points at somewhere the
   * player can go and look.
   */
  readonly at: { readonly tileX: number; readonly tileZ: number } | null;
  /**
   * The need the advice is about, where it is about one; null otherwise.
   *
   * `far-from-home` is the reason it exists: "Bungalow guests walk 76 tiles for
   * something they need" names no need and so says almost nothing, where
   * "76 tiles for somewhere to rest" is a thing to build. Declared `| null`
   * rather than optional, which `exactOptionalPropertyTypes` requires.
   */
  readonly need: GuestNeed | null;
}

/** Where a building stands, as a piece of advice carries it. */
const tileOf = (place: { readonly tileX: number; readonly tileZ: number }) => ({
  tileX: place.tileX,
  tileZ: place.tileZ,
});

/** Everything the rules read, gathered once by the caller. */
export interface ResortFacts {
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  /** Guests on the plot now, and how many of them have no bed. */
  readonly present: number;
  readonly homeless: number;
  readonly bedsFree: number;
  /** What each present guest wants most, counted per need; see `strongestNeed`. */
  readonly wanting: { readonly [need in GuestNeed]: number };
  /** Times each venue turned somebody away today, by venue key. */
  readonly balks: ReadonlyMap<string, number>;
  /** Visits each venue took today, by venue key. */
  readonly visits: ReadonlyMap<string, number>;
  /** Venue keys nothing can walk to at all. */
  readonly unreachable: ReadonlySet<string>;
}

/**
 * The order two pieces of advice of equal weight come out in.
 *
 * Declared rather than left to whichever rule ran first, so the panel shows the
 * same three lines on two runs of the same plot. Loudest kind first, which is
 * also roughly the order a player can do something about them.
 */
const KIND_ORDER: readonly AdviceKind[] = [
  'no-beds',
  'unserved-need',
  'full-lines',
  'unreachable',
  'far-from-home',
  'unvisited',
];

const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * How many balks make a full line the loudest thing on the plot.
 *
 * One balk at a beach shower is not news and four hundred at the only
 * restaurant is, so the share of arrivals turned away is scaled by how many
 * there were. Fifty in a day is a place that is plainly too small.
 */
const BALKS_LOUD = 50;

/**
 * How far a lodging may stand from something before it is worth saying, and
 * what the distance is weighed against.
 *
 * A family will not be walked further than {@link ARCHETYPES}`.family.reach`,
 * which is the smallest reach in the table, so a lodging further than that from
 * somewhere to eat is one whose families stop eating - that is the point at
 * which this is a fact about the plot rather than about the walk. The weight is
 * scaled against the *widest* reach, `friends.reach`, so a distance nobody at
 * all will walk comes out at 1.
 */
const TOO_FAR = ARCHETYPES.family.reach;
const REACH_SCALE = ARCHETYPES.friends.reach;

/**
 * Nobody can sleep.
 *
 * The loudest thing there is: a guest with no bed walks all night, their energy
 * is on the floor by morning and a day later it reads as a resort with too few
 * benches. So the share of the plot it happens to *is* the weight, undamped.
 *
 * Softened where beds are standing free, which is the same shortage in a milder
 * form - the player has the capacity and only the rooming is wrong, a party of
 * five in front of a row of double bungalows - and is a plot a bed at a time
 * cannot fix.
 */
export function adviceNoBeds(facts: ResortFacts): Advice | null {
  if (facts.homeless <= 0) return null;
  const share = clamp(facts.homeless / facts.present);
  return {
    kind: 'no-beds',
    weight: facts.bedsFree > 0 ? share * 0.6 : share,
    subject: 'beds',
    count: facts.homeless,
    // Not about any one building: it is the plot that is short of beds.
    at: null,
    need: null,
  };
}

/**
 * A need nothing on the plot relieves at all.
 *
 * A permanent drag rather than a busy afternoon: the guests who want it will
 * want it for the whole of their stay, so the weight is simply the share of the
 * plot wanting it. One piece of advice per such need - there are five needs, so
 * the list this can add to is short.
 *
 * Silent about a need nobody happens to want yet, which is a new plot rather
 * than a badly built one. It starts saying so the moment anybody does.
 */
export function adviceUnservedNeeds(facts: ResortFacts): readonly Advice[] {
  const advice: Advice[] = [];
  for (const need of NEEDS) {
    const wanting = facts.wanting[need];
    if (wanting <= 0) continue;
    if (facts.venues.some((venue) => reliefAt(venue, need) > 0)) continue;
    advice.push({
      kind: 'unserved-need',
      weight: clamp(wanting / facts.present),
      subject: need,
      count: wanting,
      at: null,
      need,
    });
  }
  return advice;
}

/**
 * The place turning most people away.
 *
 * The share of everybody who walked up to it and was refused, scaled by how many
 * that was: a venue nobody much goes to can turn away everybody who does and
 * still be nothing to worry about. One venue only - the worst - because a plot
 * where three places are full is a plot where the player builds one more of the
 * worst and looks again tomorrow.
 */
export function adviceFullLines(facts: ResortFacts): Advice | null {
  let worst: Advice | null = null;
  for (const venue of facts.venues) {
    const balks = facts.balks.get(venue.key) ?? 0;
    if (balks <= 0) continue;
    const arrivals = balks + (facts.visits.get(venue.key) ?? 0);
    const weight = clamp(balks / arrivals) * clamp(balks / BALKS_LOUD);
    if (worst === null || weight > worst.weight) {
      worst = {
        kind: 'full-lines',
        weight,
        subject: venue.label,
        count: balks,
        at: tileOf(venue),
        need: null,
      };
    }
  }
  return worst;
}

/**
 * A building nothing can walk to.
 *
 * Flat, and high: this is not a matter of degree. Whatever it cost is standing
 * there doing nothing, and nothing about how the resort is used will ever change
 * that until the player paves to it. The count is how many places are standing
 * idle inside it.
 */
export function adviceUnreachable(facts: ResortFacts): readonly Advice[] {
  return facts.venues
    .filter((venue) => facts.unreachable.has(venue.key))
    .map((venue) => ({
      kind: 'unreachable' as const,
      weight: 0.9,
      subject: venue.label,
      count: venue.capacity,
      at: tileOf(venue),
      need: null,
    }));
}

/**
 * The lodging furthest from anything serving one of the five needs.
 *
 * **Straight line, and deliberately not walking distance.** A flow field per
 * lodging per need is exactly the eager sweep `router.ts` refuses to do, and
 * would build a field for every venue on the plot once a day to answer a
 * question about a corner of it. The straight line is near enough to point at
 * the corner, which is all this has to do.
 *
 * A need nothing serves is not measured here - there is nothing to measure to,
 * and {@link adviceUnservedNeeds} has already said so, louder.
 */
export function adviceFarFromHome(facts: ResortFacts): Advice | null {
  let furthest = 0;
  let worst: { readonly lodging: Lodging; readonly need: GuestNeed } | null = null;
  for (const lodging of facts.lodgings) {
    for (const need of NEEDS) {
      const distance = nearestServing(facts.venues, need, lodging);
      if (distance === null || distance <= TOO_FAR || distance <= furthest) continue;
      furthest = distance;
      worst = { lodging, need };
    }
  }
  // Ranked on the distance and not on the weight, which is clamped: on the
  // reference plot a dozen lodgings are further from something than anybody
  // will walk, every one of them weighs 1, and the first of them is not the one
  // worth pointing at.
  if (!worst) return null;
  return {
    kind: 'far-from-home',
    weight: clamp(furthest / REACH_SCALE),
    subject: worst.lodging.label,
    count: Math.round(furthest / TILE_VOXELS),
    at: tileOf(worst.lodging),
    // Which walk it is. Without it the line names a distance and no errand,
    // which is a number the player cannot build anything about.
    need: worst.need,
  };
}

/** How far the nearest venue serving `need` stands, in voxels, or null if none does. */
function nearestServing(
  venues: readonly Venue[],
  need: GuestNeed,
  from: { readonly x: number; readonly z: number },
): number | null {
  let nearest: number | null = null;
  for (const venue of venues) {
    if (reliefAt(venue, need) <= 0) continue;
    const distance = Math.hypot(venue.x - from.x, venue.z - from.z);
    if (nearest === null || distance < nearest) nearest = distance;
  }
  return nearest;
}

/**
 * How loud a venue nobody went to is: 0.2 for the smallest, {@link IDLE_LOUDEST}
 * for anything the size of a swimming pool.
 *
 * Flat 0.3 for every one of them was the first cut, and running the resort is
 * what showed it up: a plot stands ninety venues, a quiet day leaves a dozen
 * unvisited, they all weighed the same, and which four reached the panel came
 * down to placement order. A thirty-place pool nobody swam in is worse news
 * than a one-place beach shower nobody rinsed under, and that is a difference
 * the art already declares.
 *
 * Kept below {@link adviceUnreachable}'s 0.9 at both ends, deliberately: this
 * is still a note rather than a problem.
 */
const IDLE_LOUDEST = 0.4;
const IDLE_ROOMY = 40;

const idleWeight = (capacity: number): number =>
  0.2 + (IDLE_LOUDEST - 0.2) * clamp(capacity / IDLE_ROOMY);

/**
 * Somewhere nobody went all day.
 *
 * A note rather than a problem: a tennis court nobody used is a court in the
 * wrong place, or one the plot has two of, and either is the player's business
 * rather than the resort's. Silent about a venue nothing can reach, which
 * {@link adviceUnreachable} has already said better - saying both about one
 * building is two lines about one fact.
 *
 * Silent about the whole plot until somebody has been somewhere. "Nobody
 * visited the Bakery today" is only true of a day that happened, and a resort
 * that has just been generated - or one the player has just rebuilt - has a
 * day's counters of nothing at all, which would otherwise read as every
 * building on the plot standing idle.
 */
export function adviceUnvisited(facts: ResortFacts): readonly Advice[] {
  if (facts.visits.size === 0) return [];
  return facts.venues
    .filter(
      (venue) => !facts.unreachable.has(venue.key) && (facts.visits.get(venue.key) ?? 0) === 0,
    )
    .map((venue) => ({
      kind: 'unvisited' as const,
      weight: idleWeight(venue.capacity),
      subject: venue.label,
      count: venue.capacity,
      at: tileOf(venue),
      need: null,
    }));
}

/**
 * The venues nothing can walk to at all, for {@link ResortFacts.unreachable}.
 *
 * **Both halves of the answer, and that is the whole of the rule.** A building
 * on the beach has no door node either and is perfectly reachable - the sand in
 * front of it is how - so a set built from `nodes` alone would tell the player
 * that every beach shower on the plot was stranded. See `doors.ts`.
 *
 * What it does not ask is whether a route over the sand actually reaches those
 * points: that is `sandRoutesFor`, a sweep of the beach per building, and 27 ms
 * of them once a day to sharpen an answer that is already right about every
 * building the player can do anything about. A shower with sand in front of it
 * and no way over the sand is plan 027's terrace case, and the maintainer's
 * call rather than this panel's.
 *
 * Takes the lookup rather than the graph, so the rule can be read - and tested -
 * without a plot under it.
 */
export function unreachableOn(
  venues: readonly Venue[],
  doorsOf: (venue: Venue) => VenueDoors,
): ReadonlySet<string> {
  const stranded = new Set<string>();
  for (const venue of venues) {
    const doors = doorsOf(venue);
    if (doors.nodes.length === 0 && doors.sand.length === 0) stranded.add(venue.key);
  }
  return stranded;
}

/** Where advice about the whole plot is treated as standing, for the order below. */
const NOWHERE = { tileX: 0, tileZ: 0 } as const;

const spotOf = (advice: Advice): { readonly tileX: number; readonly tileZ: number } =>
  advice.at ?? NOWHERE;

/**
 * The order the panel reads in: loudest first, then by kind, then by where it
 * stands.
 *
 * A **total** order, and it has to be. Two Restaurants of equal size that
 * nobody visited weigh exactly the same, and a comparator that called them
 * equal would leave which of them reached the panel to the sort's own
 * tie-breaking - so the same plot could advise differently on two runs.
 */
function louderFirst(a: Advice, b: Advice): number {
  return (
    b.weight - a.weight ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    spotOf(a).tileZ - spotOf(b).tileZ ||
    spotOf(a).tileX - spotOf(b).tileX
  );
}

/**
 * Everything worth saying about the plot, loudest first.
 *
 * A plot with nobody on it says nothing: every weight here is a share of the
 * guests, and a resort nobody has arrived at yet has not got anything wrong
 * yet. It is also what keeps the divisions above out of trouble.
 */
export function adviceFor(facts: ResortFacts): readonly Advice[] {
  if (facts.present <= 0) return [];
  const found = [
    adviceNoBeds(facts),
    ...adviceUnservedNeeds(facts),
    adviceFullLines(facts),
    ...adviceUnreachable(facts),
    adviceFarFromHome(facts),
    ...adviceUnvisited(facts),
  ].filter((advice): advice is Advice => advice !== null && advice.weight > 0);
  return found.toSorted(louderFirst);
}
