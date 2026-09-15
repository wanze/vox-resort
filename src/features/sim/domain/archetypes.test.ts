import { describe, expect, it } from 'vitest';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { PARTY_MIX } from '../../guests/domain/parties';
import { archetypeOf, ARCHETYPES, type Archetype } from './archetypes';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 }];

const guestsOf = (count = 120): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed: 5 });

const entries = Object.values(ARCHETYPES);
const ratesOf = (archetype: Archetype): number[] => Object.values(archetype.decayPerHour);
const weightsOf = (archetype: Archetype): number[] => Object.values(archetype.weight);

describe('ARCHETYPES', () => {
  it('plays every party kind the resort can draw', () => {
    for (const shape of PARTY_MIX) expect(ARCHETYPES[shape.kind]).toBeDefined();
    expect(Object.keys(ARCHETYPES)).toHaveLength(PARTY_MIX.length);
  });

  it('decays every need slowly enough that it takes hours, not minutes', () => {
    for (const archetype of entries) {
      for (const rate of ratesOf(archetype)) {
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThan(1);
        // Below a fifth an hour is five simulated hours from content to
        // desperate, which is a day with something happening in it.
        expect(rate).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('weights every need positively, so nothing is a need nobody has', () => {
    for (const archetype of entries) {
      for (const weight of weightsOf(archetype)) expect(weight).toBeGreaterThan(0);
    }
  });

  it('walks a family the shortest way and a group of friends the furthest', () => {
    const reaches = entries.map((archetype) => archetype.reach);
    expect(ARCHETYPES.family.reach).toBe(Math.min(...reaches));
    expect(ARCHETYPES.friends.reach).toBe(Math.max(...reaches));
  });

  it('makes a family the hungriest and grubbiest, and friends the most easily bored', () => {
    for (const kind of ['couple', 'friends', 'solo'] as const) {
      expect(ARCHETYPES.family.decayPerHour.hunger).toBeGreaterThan(
        ARCHETYPES[kind].decayPerHour.hunger,
      );
      expect(ARCHETYPES.family.decayPerHour.hygiene).toBeGreaterThan(
        ARCHETYPES[kind].decayPerHour.hygiene,
      );
      expect(ARCHETYPES.friends.decayPerHour.fun).toBeGreaterThan(
        ARCHETYPES[kind === 'friends' ? 'family' : kind].decayPerHour.fun,
      );
    }
    expect(ARCHETYPES.solo.decayPerHour.energy).toBe(
      Math.min(...entries.map((archetype) => archetype.decayPerHour.energy)),
    );
  });
});

describe('archetypeOf', () => {
  it('plays each person by the party they are in', () => {
    const guests = guestsOf();
    for (let person = 0; person < guests.count; person++) {
      const kind = guests.parties[guests.party[person]!]!.kind;
      expect(archetypeOf(guests, person)).toBe(ARCHETYPES[kind]);
    }
  });

  it('gives everybody in one party the same archetype', () => {
    const guests = guestsOf();
    for (const party of guests.parties) {
      const played = party.members.map((person) => archetypeOf(guests, person));
      expect(new Set(played).size).toBe(1);
    }
  });
});
