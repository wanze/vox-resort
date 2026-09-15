/**
 * Who is inside each venue, who is in the line outside it, and when either
 * changes.
 *
 * This is what makes a capacity mean something. Before it a guest touching a
 * door had their need seen to on the instant and walked off again, so six
 * hundred people could be inside a bakery for eight at the same moment and the
 * `capacity` every model has declared since plan 011 was read only to be
 * printed. A capacity nobody can exceed is what makes one bakery not enough,
 * which is what makes a player build a second one.
 *
 * ## Columns, and one small array per venue
 *
 * Per person it is four columns, keyed by the same index as `Guests` and
 * `Needs`, for their reason: the state is rewritten every tick and identity is
 * written once. Per venue it is a count and a queue, and the queue is a plain
 * array because it is at most {@link MAX_QUEUE_SHOWN} long and is pushed and
 * spliced at either end - a typed ring for twelve numbers would be arithmetic
 * in place of an array method for no measurable gain.
 *
 * ## Leave, then admit
 *
 * {@link sweepOccupancy} frees places before it fills them, in that order and
 * never the other. Admitting first means a venue at capacity never takes
 * anybody on the tick somebody leaves, which shows up on screen as a line that
 * moves once every two ticks - half the throughput, from one swapped pass.
 *
 * ## Nothing here knows what a need is
 *
 * A visit's *effect* is the router's business: this says who went in and who
 * came out, and `relieve` is applied to the people who came out. Keeping the
 * two apart is what lets a visit take time at all - the relief happens on
 * leaving, which is the whole change this module exists to make.
 */

import { MAX_QUEUE_SHOWN } from './queueLane';

/** What a person is doing about a venue. */
export const VISIT = { away: 0, waiting: 1, inside: 2 } as const;

export interface Occupancy {
  readonly people: number;
  readonly venues: number;
  /** One of {@link VISIT}, per person. */
  readonly state: Uint8Array;
  /** The venue each person is at, or -1. */
  readonly at: Int32Array;
  /** The tick each person inside is done at; meaningless otherwise. */
  readonly until: Float64Array;
  /** Where in the line each person waiting stands; -1 otherwise. */
  readonly slot: Int32Array;
  /** How many are inside each venue. */
  readonly inside: Int32Array;
  /** The people waiting at each venue, front first. */
  readonly queues: readonly number[][];
  /**
   * The sweep's own answer, refilled in place rather than allocated afresh:
   * {@link sweepOccupancy} runs up to twelve times a frame and would otherwise
   * hand the collector three arrays on every one of them. Read what comes back
   * before the next call and do not keep it.
   */
  readonly swept: {
    readonly left: number[];
    readonly leftFrom: number[];
    readonly admitted: number[];
    readonly moved: number[];
  };
}

export function createOccupancy(people: number, venues: number): Occupancy {
  return {
    people,
    venues,
    state: new Uint8Array(people),
    at: new Int32Array(people).fill(-1),
    until: new Float64Array(people),
    slot: new Int32Array(people).fill(-1),
    inside: new Int32Array(venues),
    queues: Array.from({ length: venues }, (): number[] => []),
    swept: { left: [], leftFrom: [], admitted: [], moved: [] },
  };
}

export type ArrivalOutcome = 'inside' | 'waiting' | 'balked';

/**
 * Somebody has reached a venue's door. They go in if there is room, join the
 * back of the line if there is not, and give up if the line is already too
 * long.
 *
 * `'balked'` changes nothing at all, which is what lets the caller simply send
 * them somewhere else: there is no half-joined state to undo.
 *
 * An index nobody could have meant - a person or a venue out of range - is
 * `'balked'` too rather than a throw. The venue list is rebuilt whenever the
 * plot is edited, and a router mid-frame is exactly where a stale index would
 * arrive from.
 */
export function arriveAt(
  occupancy: Occupancy,
  person: number,
  venue: number,
  capacity: number,
  dwellTicks: number,
  tick: number,
): ArrivalOutcome {
  if (person < 0 || person >= occupancy.people) return 'balked';
  if (venue < 0 || venue >= occupancy.venues) return 'balked';
  const queue = occupancy.queues[venue]!;
  if (queue.length >= MAX_QUEUE_SHOWN) return 'balked';

  occupancy.at[person] = venue;
  if (occupancy.inside[venue]! < capacity) {
    admit(occupancy, person, venue, dwellTicks, tick);
    return 'inside';
  }
  occupancy.state[person] = VISIT.waiting;
  occupancy.slot[person] = queue.length;
  queue.push(person);
  return 'waiting';
}

/**
 * Puts one person inside, for at least one whole tick.
 *
 * The clamp is here rather than trusted to the caller because a zero-tick visit
 * would admit and release somebody in the same call: the queue behind them
 * would never form and a capacity of one would behave like a capacity of
 * hundreds. `beach-shower` is 30 simulated seconds, which is half a tick, so
 * this is not a theoretical case.
 */
function admit(
  occupancy: Occupancy,
  person: number,
  venue: number,
  dwellTicks: number,
  tick: number,
): void {
  occupancy.state[person] = VISIT.inside;
  occupancy.slot[person] = -1;
  occupancy.until[person] = tick + Math.max(1, Math.round(dwellTicks));
  occupancy.inside[venue]! += 1;
}

export interface SweepResult {
  /** People whose visit has ended this tick. */
  readonly left: readonly number[];
  /**
   * The venue each of {@link left} has just come out of, in the same order.
   *
   * Parallel arrays rather than pairs, so a tick allocates nothing - and
   * carried at all because leaving clears where somebody was, and the caller
   * still has to know what the visit was for.
   */
  readonly leftFrom: readonly number[];
  /** People who have just got in, and must be sent inside. */
  readonly admitted: readonly number[];
  /** People still waiting whose slot has changed, and must be moved up. */
  readonly moved: readonly number[];
}

/**
 * One tick of every venue: whoever is done leaves, the front of each line goes
 * in to fill the room, and everybody behind them shuffles up.
 *
 * Venues in index order and each queue front first, so the same tick run twice
 * on the same plot admits the same people - which is what `docs/rendering.md`
 * asks of anything in the animation loop.
 */
export function sweepOccupancy(
  occupancy: Occupancy,
  capacityOf: (venue: number) => number,
  dwellTicksOf: (venue: number) => number,
  tick: number,
): SweepResult {
  const { left, leftFrom, admitted, moved } = occupancy.swept;
  left.length = 0;
  leftFrom.length = 0;
  admitted.length = 0;
  moved.length = 0;

  for (let person = 0; person < occupancy.people; person++) {
    if (occupancy.state[person] !== VISIT.inside) continue;
    if (occupancy.until[person]! > tick) continue;
    left.push(person);
    leftFrom.push(occupancy.at[person]!);
    leaveVenue(occupancy, person);
  }

  for (let venue = 0; venue < occupancy.venues; venue++) {
    fillFrom(occupancy, venue, capacityOf(venue), dwellTicksOf, tick, admitted, moved);
  }
  return occupancy.swept;
}

/**
 * Takes as many off the front of one venue's queue as it now has room for, and
 * renumbers whoever is left.
 *
 * Only the people whose slot actually moved go in `moved`. Renumbering the
 * whole line every tick would have the caller re-place a hundred people who are
 * standing exactly where they already were, which is the one way a queue this
 * cheap could stop being cheap.
 */
function fillFrom(
  occupancy: Occupancy,
  venue: number,
  capacity: number,
  dwellTicksOf: (venue: number) => number,
  tick: number,
  admitted: number[],
  moved: number[],
): void {
  const queue = occupancy.queues[venue]!;
  const taking = Math.min(capacity - occupancy.inside[venue]!, queue.length);
  if (taking <= 0) return;
  for (let place = 0; place < taking; place++) {
    const person = queue[place]!;
    admit(occupancy, person, venue, dwellTicksOf(venue), tick);
    admitted.push(person);
  }
  queue.splice(0, taking);
  for (let place = 0; place < queue.length; place++) {
    const person = queue[place]!;
    occupancy.slot[person] = place;
    moved.push(person);
  }
}

/**
 * Takes somebody out of wherever they are, inside or in a line.
 *
 * There is deliberately no "forget everybody" beside this. A rebuilt plot has a
 * new venue list of its own length, so the router builds a fresh
 * {@link Occupancy} rather than emptying one whose per-venue arrays are the
 * wrong size - which is the same rule `flowField` and `Goals` are thrown away
 * by.
 *
 * Somebody in the middle of a line leaving it shuffles everybody behind them
 * up, exactly as the front of the line going in does. Their new slots are
 * written but not reported: the one caller that needs to know - the sweep -
 * only ever leaves people who were *inside*, where nobody is behind anybody.
 */
export function leaveVenue(occupancy: Occupancy, person: number): void {
  if (person < 0 || person >= occupancy.people) return;
  const state = occupancy.state[person];
  if (state === VISIT.away) return;
  const venue = occupancy.at[person]!;
  if (state === VISIT.inside) {
    occupancy.inside[venue]! -= 1;
  } else {
    const queue = occupancy.queues[venue]!;
    queue.splice(occupancy.slot[person]!, 1);
    for (let place = 0; place < queue.length; place++) occupancy.slot[queue[place]!] = place;
  }
  occupancy.state[person] = VISIT.away;
  occupancy.at[person] = -1;
  occupancy.slot[person] = -1;
}
