import { describe, expect, it } from 'vitest';
import type { VenueRole } from '../../../../voxel-gen/voxelgen.ts';
import {
  feltAt,
  mindedAt,
  mindedOver,
  NOISE,
  noiseOf,
  nuisanceFieldFor,
  nuisanceFor,
  SMELL,
  SMELLS_BELOW,
  smellOf,
  worstAt,
  type NuisanceLive,
} from './nuisance';
import { NEEDS_CLEANING } from './upkeep';

interface Traits {
  readonly noise?: number;
  readonly smell?: number;
  readonly calm?: boolean;
}

const at = (role: VenueRole, tileX: number, traits: Traits = {}, tileZ = 0) => ({
  role,
  tileX,
  tileZ,
  tilesX: 2,
  tilesZ: 1,
  ...traits,
});

const restrooms = (tileX: number, tileZ = 0) => at('service', tileX, { smell: 1 }, tileZ);

const restaurant = (tileX: number) => at('food', tileX);

const nightClub = (tileX: number) => at('activity', tileX, { noise: 1 });

const full: NuisanceLive = () => 1;

const none: NuisanceLive = () => 0;

const loudOnly: NuisanceLive = (_, kind) => (kind === NOISE ? 1 : 0);

const cleanAt =
  (clean: number): NuisanceLive =>
  (_, kind) =>
    kind === SMELL ? smellOf(clean) : 0;

const entriesOf = (venues: Parameters<typeof nuisanceFor>[0], listener: number) => {
  const nuisance = nuisanceFor(venues);
  const from = nuisance.start[listener]!;
  const to = nuisance.start[listener + 1]!;
  return Array.from(nuisance.weight.subarray(from, to));
};

describe('who smells and hears what, before the day decides how much', () => {
  it('carries a smell to the next table and the one after, no further', () => {
    expect(entriesOf([restaurant(0), restrooms(2)], 0)[0]).toBeCloseTo(2 / 3);
    expect(entriesOf([restaurant(0), restrooms(3)], 0)[0]).toBeCloseTo(1 / 3);
    expect(entriesOf([restaurant(0), restrooms(5)], 0)).toEqual([]);
  });

  it('never makes a venue its own source', () => {
    expect(entriesOf([restrooms(0)], 0)).toEqual([]);
  });

  it('leaves a bar deaf to the club next door, and a calm spa not', () => {
    expect(entriesOf([at('drink', 0), nightClub(2)], 0)).toEqual([]);
    const spa = at('activity', 0, { calm: true });
    expect(entriesOf([spa, nightClub(2)], 0)[0]).toBeCloseTo(0.8);
  });
});

describe('how strong a source is right now', () => {
  it('smells only once a cleaner is late, and reeks when filthy', () => {
    expect(SMELLS_BELOW).toBeLessThan(NEEDS_CLEANING);
    expect(smellOf(1)).toBe(0);
    expect(smellOf(0.6)).toBe(0);
    expect(smellOf(0.2)).toBe(1);
    expect(smellOf(0)).toBe(1);
    let last = 0;
    for (let clean = 0.6; clean >= 0.2; clean -= 0.05) {
      expect(smellOf(clean)).toBeGreaterThanOrEqual(last);
      last = smellOf(clean);
    }
  });

  it('is silent empty and at full noise half full', () => {
    expect(noiseOf(0, 10)).toBe(0);
    expect(noiseOf(5, 10)).toBe(1);
    expect(noiseOf(2, 10)).toBeCloseTo(0.4);
  });
});

describe('what a venue feels', () => {
  const venues = [restaurant(0), restrooms(2)];
  const nuisance = nuisanceFor(venues);

  it('feels nothing beside clean restrooms and plenty beside filthy ones', () => {
    expect(feltAt(nuisance, 0, cleanAt(1))).toBe(0);
    expect(feltAt(nuisance, 0, cleanAt(0))).toBeGreaterThan(0.25);
  });

  it('feels nothing on the beach, which lies past the list', () => {
    expect(feltAt(nuisance, venues.length, full)).toBe(0);
    expect(worstAt(nuisance, venues.length, full)).toBeNull();
  });

  it('clamps three sources at 1', () => {
    const crowded = nuisanceFor([restaurant(2), restrooms(0), restrooms(4), restrooms(2, 1)]);
    expect(feltAt(crowded, 0, full)).toBe(1);
  });

  it('names the source that adds most, of the kind felt most', () => {
    const square = nuisanceFor([restaurant(4), restrooms(7), nightClub(2)]);
    const loudest = worstAt(square, 0, loudOnly)!;
    expect(loudest).toMatchObject({ kind: 'noise', source: 2 });
    expect(loudest.felt).toBeCloseTo(0.8 * 0.3);
    const worst = worstAt(square, 0, full)!;
    expect(worst.kind).toBe('smell');
    expect(worst.source).toBe(1);
    expect(worst.felt).toBeCloseTo(1 / 3);
    expect(worstAt(square, 0, none)).toBeNull();
  });
});

describe('what a venue minds, by its neighbour', () => {
  const venues = [
    { ...restaurant(0), key: 'restaurant#0', label: 'Restaurant' },
    { ...restrooms(2), key: 'restrooms#0', label: 'Restrooms' },
    { ...restaurant(9), key: 'restaurant#1', label: 'Far Restaurant' },
  ];
  const nuisance = nuisanceFor(venues);

  it('names the worst neighbour as a guest would', () => {
    expect(mindedAt(nuisance, venues, 0, full)).toMatchObject({ kind: 'smell', from: 'Restrooms' });
    expect(mindedAt(nuisance, venues, 2, full)).toBeNull();
  });

  it('keeps only what a guest would say, by key', () => {
    expect([...mindedOver(nuisance, venues, full).keys()]).toEqual(['restaurant#0']);
    expect(mindedOver(nuisance, venues, cleanAt(0.5)).size).toBe(0);
  });
});

describe('the field the overlay paints', () => {
  const venues = [restaurant(0), restrooms(4)];
  const { sources } = nuisanceFor(venues);

  it('smells inside the reach and nowhere past it', () => {
    const field = nuisanceFieldFor(sources, venues, full, 12, 1);
    expect(field.value[3]).toBeCloseTo(2 / 3);
    expect(field.value[7]).toBeCloseTo(1 / 3);
    expect(field.value[9]).toBe(0);
  });

  it('is clean around a clean restroom', () => {
    const field = nuisanceFieldFor(sources, venues, cleanAt(1), 12, 1);
    expect(field.value.every((value) => value === 0)).toBe(true);
  });
});
