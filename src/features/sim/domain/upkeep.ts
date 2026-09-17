/**
 * How clean each venue is, and what wears it down.
 *
 * 1 is spotless and 0 is filthy, the way round `needs.ts` reads: a level that
 * counted dirt upwards would make every comparison read backwards against the
 * five columns beside it.
 *
 * Per venue and not per tile. A tile grid of dirt would be a second thing to
 * keep in step with the paving, and dirt is a fact about a place people use
 * rather than about the ground between places.
 *
 * ## Nothing recovers on its own
 *
 * There is deliberately no decay back towards clean. A venue nobody cleans
 * stays dirty for ever, which is the whole of the mechanic: the answer to dirt
 * is somebody walking to it, and a venue that tidied itself overnight would
 * make the staff decoration.
 *
 * ## An index nobody has an entry for is spotless
 *
 * `cleanliness` answers 1 and `soil` does nothing for a venue outside the
 * array, which is not a slip. The router carries a synthetic beach past the end
 * of the plot's own venue list - see `withBeach` - and a band of sand is not
 * somewhere a cleaner is sent to mop.
 */

/** How clean every venue on the plot is. */
export interface Upkeep {
  readonly venues: number;
  /** 1 spotless, 0 filthy, one entry per venue in the list it was built from. */
  readonly level: Float32Array;
}

/**
 * One completed visit's worth of wear, before the venue's own capacity is
 * divided out.
 *
 * 0.02 against a venue for ten is a five-hundredth of its cleanliness per
 * visit, so it goes from spotless to filthy in about five hundred covers -
 * which is a few days of a busy plot rather than an afternoon. Low enough that
 * a player who never builds a cleaner has days to notice, high enough that a
 * restaurant the whole resort eats at is visibly worse by the end of the week.
 */
export const WEAR_PER_VISIT = 0.02;

/**
 * How much one spell of work puts back.
 *
 * Three spells restore a venue from filthy to spotless, and a spell is about
 * twenty simulated minutes plus the walk - so one cleaner can hold two or three
 * places and no more. That ratio is what makes `staffFor`'s count a decision
 * rather than a formality: build a fourth busy venue and the three cleaners on
 * the plot stop keeping up.
 */
export const SCRUB_PER_SPELL = 0.35;

/**
 * How dirty a venue has to be before a cleaner will walk to it.
 *
 * Below {@link NEEDS_CLEANING} a place is worth crossing the plot for; above
 * it, a cleaner would spend their day topping up venues that were nearly clean
 * already while the filthy one across the plot went untouched. It is also the
 * threshold the advice panel and the HUD read as "dirty".
 */
export const NEEDS_CLEANING = 0.7;

/** Everything spotless, which is what a plot that has just been built is. */
export function createUpkeep(venues: number): Upkeep {
  const count = Math.max(0, venues);
  return { venues: count, level: new Float32Array(count).fill(1) };
}

/**
 * One completed visit's worth of wear.
 *
 * Divided by the venue's capacity, so a restaurant for forty is not worn forty
 * times as fast as a beach shower for one by being forty times as busy: what a
 * capacity says is how many the place is *built* for.
 */
export function soil(upkeep: Upkeep, venue: number, capacity: number): void {
  const level = upkeep.level[venue];
  if (level === undefined) return;
  const worn = level - WEAR_PER_VISIT / Math.max(1, capacity);
  upkeep.level[venue] = worn < 0 ? 0 : worn;
}

/** One spell of work: a venue is that much cleaner, capped at spotless. */
export function scrub(upkeep: Upkeep, venue: number, amount: number): void {
  const level = upkeep.level[venue];
  if (level === undefined) return;
  const cleaned = level + amount;
  upkeep.level[venue] = cleaned > 1 ? 1 : cleaned;
}

/** How clean a venue is, 1 for anything the caller has no entry for. */
export function cleanliness(upkeep: Upkeep, venue: number): number {
  return upkeep.level[venue] ?? 1;
}

/**
 * The dirtiest venue of those offered, or -1 when none is below `threshold`.
 *
 * `eligible` is a predicate rather than a list because the reasons to pass a
 * venue over grow: today it is one a cleaner is already walking to, and plan
 * 023's weather will want a closed venue left alone too.
 *
 * Ties break towards the lower index, so two equally filthy venues are taken in
 * the same order on two runs of the same plot.
 */
export function dirtiest(
  upkeep: Upkeep,
  eligible: (venue: number) => boolean,
  threshold: number,
): number {
  let worst = -1;
  let worstLevel = threshold;
  for (let venue = 0; venue < upkeep.venues; venue++) {
    const level = upkeep.level[venue]!;
    if (level >= worstLevel) continue;
    if (!eligible(venue)) continue;
    worst = venue;
    worstLevel = level;
  }
  return worst;
}

/**
 * The dirt the venues still standing had, carried onto the list that has just
 * replaced them.
 *
 * A venue index means nothing across a rebuild - which is why the router throws
 * away every field, goal and visit - but a venue *key* does, and a player who
 * paves one tile should not find every restaurant on the plot scrubbed for
 * them. Anything newly built starts spotless, which is what a new building is.
 */
export function carryUpkeep(
  previous: Upkeep,
  from: readonly { readonly key: string }[],
  to: readonly { readonly key: string }[],
): Upkeep {
  const carried = createUpkeep(to.length);
  const was = new Map(from.map((venue, index) => [venue.key, previous.level[index] ?? 1]));
  for (let venue = 0; venue < to.length; venue++) {
    carried.level[venue] = was.get(to[venue]!.key) ?? 1;
  }
  return carried;
}
