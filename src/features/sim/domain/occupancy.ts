import { MAX_QUEUE_SHOWN } from './queueLane';

export const VISIT = { away: 0, waiting: 1, inside: 2 } as const;

export interface Occupancy {
  readonly people: number;
  readonly venues: number;
  readonly state: Uint8Array;
  readonly at: Int32Array;
  readonly until: Float64Array;
  readonly slot: Int32Array;
  readonly inside: Int32Array;
  readonly queues: readonly number[][];
  // Refilled in place: the sweep runs up to twelve times a frame. Read the result
  // before the next call and do not keep it.
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

// Out-of-range indices balk rather than throw: the venue list is rebuilt on every
// edit, so a stale index can arrive mid-frame.
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

// At least one tick: a zero-tick visit would admit and release in one call, so no
// queue would ever form (`beach-shower` is half a tick).
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
  readonly left: readonly number[];
  // Carried because leaving clears `at`, and the caller still needs the venue.
  readonly leftFrom: readonly number[];
  readonly admitted: readonly number[];
  readonly moved: readonly number[];
}

// Leaves before admitting: the other order stalls a full venue's line every other
// tick. Index order, so the same tick always admits the same people.
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

// There is no "forget everybody": a rebuilt plot gets a fresh Occupancy, since the
// per-venue arrays would be the wrong size. Shuffled slots are not reported, as the
// sweep only removes people who were inside.
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
