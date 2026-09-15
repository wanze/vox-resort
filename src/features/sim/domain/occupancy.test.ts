import { describe, expect, it } from 'vitest';
import { arriveAt, createOccupancy, leaveVenue, sweepOccupancy, VISIT } from './occupancy';
import { MAX_QUEUE_SHOWN } from './queueSpot';

/** `beach-shower`'s own numbers: one person, and half a tick rounded up to one. */
const SHOWER = { venue: 0, capacity: 1, dwell: 1 };
/** `bakery`'s: eight inside, and a visit of six simulated minutes. */
const BAKERY = { venue: 1, capacity: 8, dwell: 6 };

const both = [SHOWER, BAKERY];
const capacityOf = (venue: number): number => both.find((each) => each.venue === venue)!.capacity;
const dwellTicksOf = (venue: number): number => both.find((each) => each.venue === venue)!.dwell;

const occupancyFor = () => createOccupancy(20, 2);

const arrive = (
  occupancy: ReturnType<typeof occupancyFor>,
  person: number,
  place: typeof SHOWER,
  tick = 0,
) => arriveAt(occupancy, person, place.venue, place.capacity, place.dwell, tick);

const sweep = (occupancy: ReturnType<typeof occupancyFor>, tick: number) =>
  sweepOccupancy(occupancy, capacityOf, dwellTicksOf, tick);

/** Everything a sweep could have changed, as one comparable value. */
const snapshotOf = (occupancy: ReturnType<typeof occupancyFor>) =>
  JSON.stringify({
    state: [...occupancy.state],
    at: [...occupancy.at],
    until: [...occupancy.until],
    slot: [...occupancy.slot],
    inside: [...occupancy.inside],
    queues: occupancy.queues.map((queue) => [...queue]),
  });

describe('arriveAt', () => {
  it('lets the first person at an empty venue straight in', () => {
    const occupancy = occupancyFor();
    expect(arrive(occupancy, 0, SHOWER)).toBe('inside');
    expect(occupancy.inside[SHOWER.venue]).toBe(1);
    expect(occupancy.state[0]).toBe(VISIT.inside);
    expect(occupancy.queues[SHOWER.venue]).toHaveLength(0);
  });

  it('puts the second person at the front of the line, not in second place', () => {
    const occupancy = occupancyFor();
    arrive(occupancy, 0, SHOWER);
    expect(arrive(occupancy, 1, SHOWER)).toBe('waiting');
    // The first of the line, which is where they stand; not the second person
    // to have turned up.
    expect(occupancy.slot[1]).toBe(0);
    expect(occupancy.queues[SHOWER.venue]).toEqual([1]);
  });

  it('fills a bakery to its declared capacity and queues the ninth', () => {
    const occupancy = occupancyFor();
    for (let person = 0; person < BAKERY.capacity; person++) {
      expect(arrive(occupancy, person, BAKERY), `person ${person}`).toBe('inside');
    }
    expect(occupancy.inside[BAKERY.venue]).toBe(BAKERY.capacity);
    expect(arrive(occupancy, BAKERY.capacity, BAKERY)).toBe('waiting');
    expect(occupancy.slot[BAKERY.capacity]).toBe(0);
  });

  it('balks at a full line and changes nothing at all', () => {
    const occupancy = createOccupancy(40, 2);
    arriveAt(occupancy, 0, SHOWER.venue, SHOWER.capacity, SHOWER.dwell, 0);
    for (let person = 1; person <= MAX_QUEUE_SHOWN; person++) {
      arriveAt(occupancy, person, SHOWER.venue, SHOWER.capacity, SHOWER.dwell, 0);
    }
    const before = snapshotOf(occupancy);
    expect(arriveAt(occupancy, 30, SHOWER.venue, SHOWER.capacity, SHOWER.dwell, 0)).toBe('balked');
    expect(snapshotOf(occupancy)).toBe(before);
  });

  it('balks rather than throwing at a person or a venue that is not there', () => {
    const occupancy = occupancyFor();
    const before = snapshotOf(occupancy);
    expect(arriveAt(occupancy, 99, 0, 1, 1, 0)).toBe('balked');
    expect(arriveAt(occupancy, 0, 9, 1, 1, 0)).toBe('balked');
    expect(snapshotOf(occupancy)).toBe(before);
  });

  it('never lets a visit be over on the tick it started', () => {
    const occupancy = occupancyFor();
    // Half a tick, which is `beach-shower`'s 30 simulated seconds rounded down.
    arriveAt(occupancy, 0, SHOWER.venue, SHOWER.capacity, 0, 4);
    expect(occupancy.until[0]).toBeGreaterThan(4);
    expect(sweep(occupancy, 4).left).toEqual([]);
  });
});

describe('sweepOccupancy', () => {
  it('lets the finished out, the front of the line in, and shuffles the rest up', () => {
    const occupancy = occupancyFor();
    arrive(occupancy, 0, SHOWER);
    for (const person of [1, 2, 3]) arrive(occupancy, person, SHOWER);

    expect(sweep(occupancy, 0).left).toEqual([]);
    const swept = sweep(occupancy, SHOWER.dwell);
    expect([...swept.left]).toEqual([0]);
    expect([...swept.leftFrom]).toEqual([SHOWER.venue]);
    expect([...swept.admitted]).toEqual([1]);
    expect([...swept.moved]).toEqual([2, 3]);
    expect(occupancy.slot[2]).toBe(0);
    expect(occupancy.slot[3]).toBe(1);
    expect(occupancy.state[0]).toBe(VISIT.away);
    expect(occupancy.inside[SHOWER.venue]).toBe(1);
  });

  it('reports nobody when nobody is due and nothing can move', () => {
    const occupancy = occupancyFor();
    arrive(occupancy, 0, BAKERY);
    const swept = sweep(occupancy, BAKERY.dwell - 1);
    expect([...swept.left]).toEqual([]);
    expect([...swept.admitted]).toEqual([]);
    expect([...swept.moved]).toEqual([]);
  });

  it('runs a capacity of one through five people, in order and one at a time', () => {
    const occupancy = occupancyFor();
    for (const person of [0, 1, 2, 3, 4]) arrive(occupancy, person, SHOWER);
    const visits = new Map<number, number>();
    for (let tick = 1; tick <= 20; tick++) {
      for (const person of sweep(occupancy, tick).admitted) {
        visits.set(person, (visits.get(person) ?? 0) + 1);
      }
      // The assertion the whole module exists for.
      expect(occupancy.inside[SHOWER.venue], `tick ${tick}`).toBeLessThanOrEqual(SHOWER.capacity);
    }
    // Person 0 walked straight in and so was never admitted by a sweep; the
    // four behind them each got in exactly once, in the order they turned up.
    expect([...visits.keys()]).toEqual([1, 2, 3, 4]);
    expect([...visits.values()]).toEqual([1, 1, 1, 1]);
  });
});

describe('leaveVenue', () => {
  it('shuffles up the people behind somebody who gives up their place', () => {
    const occupancy = occupancyFor();
    arrive(occupancy, 0, SHOWER);
    for (const person of [1, 2, 3]) arrive(occupancy, person, SHOWER);
    leaveVenue(occupancy, 2);
    expect(occupancy.queues[SHOWER.venue]).toEqual([1, 3]);
    expect(occupancy.slot[1]).toBe(0);
    expect(occupancy.slot[3]).toBe(1);
    expect(occupancy.state[2]).toBe(VISIT.away);
    expect(occupancy.at[2]).toBe(-1);
  });

  it('frees the place of somebody who was inside, and ignores somebody who was not', () => {
    const occupancy = occupancyFor();
    arrive(occupancy, 0, BAKERY);
    leaveVenue(occupancy, 0);
    expect(occupancy.inside[BAKERY.venue]).toBe(0);
    const before = snapshotOf(occupancy);
    leaveVenue(occupancy, 0);
    leaveVenue(occupancy, 99);
    expect(snapshotOf(occupancy)).toBe(before);
  });
});
