import { describe, expect, it } from 'vitest';
import { SHOWN } from '../../choreography/domain/casting';
import { RESTING } from '../../crowd/domain/crowd';
import type { GuestSources } from './followTarget';
import { benchGuest, craftOut, hutRide, rideOffers, type RideFleet } from './rides';

const BUOY = 0;
const ROWING = 1;
const PEDALO = 3;
const SPEEDBOAT = 5;
const BANANA = 6;

interface Craft {
  readonly variant: number;
  readonly hired?: boolean;
  readonly fleet?: number;
  readonly towedBy?: number;
  readonly age?: number;
}

const bay = (craft: readonly Craft[]): RideFleet => ({
  count: craft.length,
  variant: craft.map((each) => each.variant),
  hired: craft.map((each) => (each.hired ? 1 : 0)),
  fleet: craft.map((each) => each.fleet ?? -1),
  towedBy: craft.map((each) => each.towedBy ?? -1),
  age: craft.map((each) => each.age ?? 0),
});

// A buoy, a drifting rowing boat, two pedalos from hut a, a speedboat towing a banana from hut b.
const BAY = bay([
  { variant: BUOY },
  { variant: ROWING },
  { variant: PEDALO, hired: true, fleet: 0, age: 40 },
  { variant: PEDALO, hired: true, fleet: 0, age: 12 },
  { variant: SPEEDBOAT, hired: true, fleet: 1, age: 30 },
  { variant: BANANA, hired: true, towedBy: 4, age: -1 },
]);

describe('craftOut', () => {
  it('never offers a buoy, and always a drifting craft', () => {
    expect(craftOut(BAY, 0, BUOY)).toBe(false);
    expect(craftOut(BAY, 1, BUOY)).toBe(true);
  });

  it('takes a towed craft out with its tug, whatever its own age', () => {
    expect(craftOut(BAY, 5, BUOY)).toBe(true);
    const tied = bay([
      { variant: SPEEDBOAT, hired: true, fleet: 0, age: -3 },
      { variant: BANANA, hired: true, towedBy: 0, age: 9 },
    ]);
    expect(craftOut(tied, 1, BUOY)).toBe(false);
  });
});

describe('rideOffers', () => {
  it('offers one of each kind out, the youngest hire of it', () => {
    expect(rideOffers(BAY, BUOY)).toEqual([
      { variant: ROWING, craft: 1, only: true },
      { variant: PEDALO, craft: 3, only: false },
      { variant: SPEEDBOAT, craft: 4, only: true },
      { variant: BANANA, craft: 5, only: true },
    ]);
  });

  it('offers nothing tied up', () => {
    const tied = bay([{ variant: BUOY }, { variant: PEDALO, hired: true, fleet: 0, age: -2 }]);
    expect(rideOffers(tied, BUOY)).toEqual([]);
  });
});

describe('hutRide', () => {
  const huts = ['hut-a', 'hut-b'];

  it('takes only that hut’s fleets, the youngest first', () => {
    expect(hutRide(BAY, huts, 'hut-a', BUOY)).toBe(3);
  });

  it('counts a towed craft as its tug’s hut', () => {
    const towing = bay([
      { variant: SPEEDBOAT, hired: true, fleet: 1, age: 30 },
      { variant: BANANA, hired: true, towedBy: 0, age: -1 },
    ]);
    expect(hutRide(towing, huts, 'hut-b', BUOY)).toBe(0);
    const towedOnly = { ...towing, variant: [BUOY, BANANA] };
    expect(hutRide(towedOnly, huts, 'hut-b', BUOY)).toBe(1);
  });

  it('answers null for a hut with nothing out', () => {
    expect(hutRide(BAY, huts, 'hut-c', BUOY)).toBeNull();
  });
});

describe('benchGuest', () => {
  const PEOPLE = 5;
  const sources = (resting: readonly number[]): GuestSources => ({
    crowd: {
      x: new Float32Array(PEOPLE),
      y: new Float32Array(PEOPLE),
      z: new Float32Array(PEOPLE),
      heading: new Float32Array(PEOPLE),
      offPlot: Uint8Array.of(0, 1, 0, 0, 0),
    },
    drawn: {
      shown: Uint8Array.of(0, 0, SHOWN.hidden, 0, 0),
      x: new Float32Array(PEOPLE),
      y: new Float32Array(PEOPLE),
      z: new Float32Array(PEOPLE),
      heading: new Float32Array(PEOPLE),
      pose: new Float32Array(PEOPLE),
    },
    guests: {
      present: Uint8Array.of(0, 1, 1, 1, 1),
      party: new Int32Array(PEOPLE),
      child: new Uint8Array(PEOPLE),
    },
    resting: (person) => resting[person]!,
  });

  it('skips the absent, the off-plot, the hidden and the seated', () => {
    const still = [RESTING.none, RESTING.none, RESTING.none, RESTING.sitting, RESTING.none];
    expect(benchGuest(sources(still))).toBe(4);
  });

  it('answers null when nobody walks', () => {
    expect(benchGuest(sources(Array.from({ length: PEOPLE }, () => RESTING.sitting)))).toBeNull();
  });
});
