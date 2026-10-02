import { describe, expect, it } from 'vitest';
import { GUEST_NEEDS, type GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { PartyKind } from '../../guests/domain/parties';
import { ARCHETYPES } from './archetypes';
import {
  cheer,
  createNeeds,
  decayNeeds,
  relieve,
  resetNeeds,
  START_LEVEL,
  strongestNeed,
  wouldGetUpFor,
  type Needs,
} from './needs';
import { weatherEffect } from './weather';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 }];

const guestsOf = (count = 120, seed = 5): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed });

const someone = (guests: Guests, kind: PartyKind): number => {
  for (let person = 0; person < guests.count; person++) {
    if (guests.parties[guests.party[person]!]!.kind === kind) return person;
  }
  throw new Error(`no ${kind} on the plot`);
};

const setAll = (needs: Needs, person: number, level: number): void => {
  for (const need of GUEST_NEEDS) needs.level[need][person] = level;
};

const levelsOf = (needs: Needs, person: number): number[] =>
  GUEST_NEEDS.map((need) => needs.level[need][person]!);

describe('createNeeds', () => {
  it('gives every need a column the size of the registry', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    expect(needs.count).toBe(guests.count);
    for (const need of GUEST_NEEDS) expect(needs.level[need].length).toBe(guests.count);
  });

  it('starts everybody somewhere in the middle, so nobody is desperate on day one', () => {
    const needs = createNeeds(guestsOf(), 7);
    for (let person = 0; person < needs.count; person++) {
      for (const level of levelsOf(needs, person)) {
        expect(level).toBeGreaterThanOrEqual(START_LEVEL.min);
        expect(level).toBeLessThanOrEqual(START_LEVEL.max);
      }
    }
  });

  it('spreads the starting moods rather than giving everybody the same one', () => {
    const needs = createNeeds(guestsOf(), 7);
    expect(new Set(Array.from(needs.level.hunger)).size).toBeGreaterThan(50);
  });

  it('replays the same levels from the same seed, and different ones from another', () => {
    const guests = guestsOf();
    expect(Array.from(createNeeds(guests, 7).level.hunger)).toEqual(
      Array.from(createNeeds(guests, 7).level.hunger),
    );
    expect(Array.from(createNeeds(guests, 8).level.hunger)).not.toEqual(
      Array.from(createNeeds(guests, 7).level.hunger),
    );
  });

  it('draws nothing for a resort nobody is staying in', () => {
    const needs = createNeeds(guestsOf(0), 7);
    expect(needs.count).toBe(0);
    for (const need of GUEST_NEEDS) expect(needs.level[need].length).toBe(0);
  });
});

describe('decayNeeds', () => {
  it("drops a family's hunger by its own hourly rate over a simulated hour", () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'family');
    setAll(needs, person, 1);
    decayNeeds(needs, guests, 60);
    expect(needs.level.hunger[person]!).toBeCloseTo(1 - ARCHETYPES.family.decayPerHour.hunger, 5);
  });

  it('decays each party by its own rates, so friends get bored before a family does', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const family = someone(guests, 'family');
    const friends = someone(guests, 'friends');
    setAll(needs, family, 1);
    setAll(needs, friends, 1);
    decayNeeds(needs, guests, 120);
    expect(needs.level.fun[friends]!).toBeLessThan(needs.level.fun[family]!);
    expect(needs.level.hunger[friends]!).toBeGreaterThan(needs.level.hunger[family]!);
  });

  it('runs twelve ticks as twelve minutes, not as twelve hours', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'couple');
    setAll(needs, person, 1);
    decayNeeds(needs, guests, 12);
    expect(needs.level.hunger[person]!).toBeCloseTo(
      1 - (ARCHETYPES.couple.decayPerHour.hunger * 12) / 60,
      5,
    );
  });

  it('changes nothing for no ticks or for a negative count', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const before = Array.from(needs.level.hunger);
    decayNeeds(needs, guests, 0);
    decayNeeds(needs, guests, -600);
    expect(Array.from(needs.level.hunger)).toEqual(before);
  });

  it('holds a sleeping guest where they went to bed, and decays everybody awake', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const sleeper = someone(guests, 'family');
    const awake = someone(guests, 'couple');
    setAll(needs, sleeper, 0.6);
    setAll(needs, awake, 0.6);
    const before = levelsOf(needs, sleeper);
    decayNeeds(needs, guests, 9 * 60, undefined, (person) => person === sleeper);
    expect(levelsOf(needs, sleeper)).toEqual(before);
    expect(needs.level.hunger[awake]!).toBeLessThan(0.5);
  });

  it('stops at desperate rather than running below zero', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    decayNeeds(needs, guests, 60 * 24 * 30);
    for (let person = 0; person < needs.count; person++) {
      for (const level of levelsOf(needs, person)) expect(level).toBe(0);
    }
  });
});

describe('cheer', () => {
  it('tops up fun alone, and never past content', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    setAll(needs, 3, 0.5);
    cheer(needs, 3, 0.2);
    expect(needs.level.fun[3]!).toBeCloseTo(0.7, 5);
    expect(needs.level.hunger[3]!).toBeCloseTo(0.5, 5);
    cheer(needs, 3, 0.8);
    expect(needs.level.fun[3]!).toBe(1);
    cheer(needs, needs.count, 0.5);
  });
});

describe('relieve', () => {
  it('sees to the need a visit serves and leaves the other four alone', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    setAll(needs, 3, 0.1);
    relieve(needs, 3, [{ need: 'fun', amount: 0.8 }]);
    expect(needs.level.fun[3]!).toBeCloseTo(0.9, 5);
    for (const need of GUEST_NEEDS) {
      if (need !== 'fun') expect(needs.level[need][3]!).toBeCloseTo(0.1, 5);
    }
  });

  it("keeps basketball's cost: it raises fun and lowers energy", () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    setAll(needs, 3, 0.5);
    relieve(needs, 3, [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ]);
    expect(needs.level.fun[3]!).toBeCloseTo(1, 5);
    expect(needs.level.energy[3]!).toBeCloseTo(0.1, 5);
  });

  it('cannot push a level past content or below desperate', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    setAll(needs, 3, 0.9);
    relieve(needs, 3, [{ need: 'hunger', amount: 1 }]);
    expect(needs.level.hunger[3]!).toBe(1);
    setAll(needs, 3, 0.1);
    relieve(needs, 3, [{ need: 'energy', amount: -0.9 }]);
    expect(needs.level.energy[3]!).toBe(0);
  });

  it('touches nobody but the one person visiting', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const before = needs.level.fun[4]!;
    relieve(needs, 3, [{ need: 'fun', amount: 0.8 }]);
    expect(needs.level.fun[4]!).toBe(before);
  });
});

describe('strongestNeed', () => {
  it('wants nothing at all from somebody who has everything', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    setAll(needs, 3, 1);
    expect(strongestNeed(needs, guests, 3)).toBeNull();
  });

  it('leaves a barely-run-down guest content rather than sending them anywhere', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    setAll(needs, someone(guests, 'couple'), 0.95);
    expect(strongestNeed(needs, guests, someone(guests, 'couple'))).toBeNull();
  });

  it('picks the loudest need and not merely the lowest level', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'family');
    const { weight } = ARCHETYPES.family;
    expect(weight.hunger).toBeGreaterThan(weight.fun);
    setAll(needs, person, 1);
    needs.level.fun[person] = 0.45;
    needs.level.hunger[person] = 0.5;
    expect(weight.fun * 0.55).toBeLessThan(weight.hunger * 0.5);
    const strongest = strongestNeed(needs, guests, person)!;
    expect(strongest.need).toBe<GuestNeed>('hunger');
    expect(strongest.urgency).toBeCloseTo(weight.hunger * 0.5, 5);
  });

  it('breaks a tie towards the earlier need, so key order never decides it', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'couple');
    const { weight } = ARCHETYPES.couple;
    expect(weight.hunger).toBe(weight.thirst);
    setAll(needs, person, 1);
    needs.level.hunger[person] = 0.4;
    needs.level.thirst[person] = 0.4;
    expect(strongestNeed(needs, guests, person)?.need).toBe<GuestNeed>('hunger');
  });
});

describe('wouldGetUpFor', () => {
  it('agrees with strongestNeed about which needs are worth getting up for', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'family');
    setAll(needs, person, 0.95);
    needs.level.hunger[person] = 0.4;
    expect(wouldGetUpFor(needs, guests, person, 'hunger')).toBe(true);
    expect(wouldGetUpFor(needs, guests, person, 'thirst')).toBe(false);
    expect(strongestNeed(needs, guests, person)?.need).toBe<GuestNeed>('hunger');
  });
});

describe('the weather over the needs', () => {
  it('makes thirst the loudest need in a heatwave where a clear day would not', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'family');
    const { weight } = ARCHETYPES.family;
    setAll(needs, person, 1);
    needs.level.hunger[person] = 0.55;
    needs.level.thirst[person] = 0.5;
    expect(weight.hunger * 0.45).toBeGreaterThan(weight.thirst * 0.5);
    expect(strongestNeed(needs, guests, person)?.need).toBe<GuestNeed>('hunger');
    expect(strongestNeed(needs, guests, person, weatherEffect('heatwave'))?.need).toBe<GuestNeed>(
      'thirst',
    );
  });

  it('decays thirst faster in a heatwave over the very same ticks', () => {
    const guests = guestsOf();
    const clear = createNeeds(guests, 7);
    const hot = createNeeds(guests, 7);
    const person = someone(guests, 'couple');
    decayNeeds(clear, guests, 120);
    decayNeeds(hot, guests, 120, weatherEffect('heatwave'));
    expect(hot.level.thirst[person]!).toBeLessThan(clear.level.thirst[person]!);
    expect(hot.level.hunger[person]!).toBeCloseTo(clear.level.hunger[person]!, 6);
    expect(hot.level.hygiene[person]!).toBeCloseTo(clear.level.hygiene[person]!, 6);
  });

  it('decays exactly as it always did when no weather is handed in', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const person = someone(guests, 'family');
    setAll(needs, person, 1);
    decayNeeds(needs, guests, 120);
    // Pinned against the literals rather than the table, so a change to either is a change to both.
    expect(levelsOf(needs, person)).toEqual(
      [1 - 0.12 * 2, 1 - 0.096 * 2, 1 - 0.084 * 2, 1 - 0.102 * 2, 1 - 0.108 * 2].map((level) =>
        Math.fround(level),
      ),
    );
    const spelled = createNeeds(guests, 7);
    setAll(spelled, person, 1);
    decayNeeds(spelled, guests, 120, weatherEffect('clear'));
    expect(levelsOf(spelled, person)).toEqual(levelsOf(needs, person));
  });
});

describe('health', () => {
  it('starts everybody well, and draws nothing for it', () => {
    const needs = createNeeds(guestsOf(), 7);
    expect(Array.from(needs.level.health).every((level) => level === 1)).toBe(true);
    // Taken from createNeeds before health existed: the five wants must be drawn as they were.
    const before = [
      [
        0.4840770363807678, 0.9872992038726807, 0.8344658017158508, 0.7367948889732361,
        0.6730369329452515,
      ],
      [
        0.7064279317855835, 0.5819588303565979, 0.7543290853500366, 0.8514021635055542,
        0.5917985439300537,
      ],
    ];
    expect(levelsOf(needs, 0)).toEqual(before[0]);
    expect(levelsOf(needs, 1)).toEqual(before[1]);
    expect(levelsOf(needs, 119)).toEqual([
      0.4975746273994446, 0.6272715926170349, 0.7645559906959534, 0.7908678650856018,
      0.9422182440757751,
    ]);
    expect(GUEST_NEEDS).not.toContain('health');
  });

  it('does not wear off by the hour, whatever the weather', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    needs.level.health[3] = 0.35;
    decayNeeds(needs, guests, 60 * 24, weatherEffect('heatwave'));
    expect(needs.level.health[3]).toBeCloseTo(0.35);
    expect(needs.level.health[4]).toBe(1);
  });

  it('makes a hurt guest want first aid before anything else', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    for (const kind of ['family', 'couple', 'friends', 'solo'] as const) {
      const person = someone(guests, kind);
      setAll(needs, person, 0);
      needs.level.health[person] = 0.35;
      expect(strongestNeed(needs, guests, person)?.need, kind).toBe('health');
      needs.level.health[person] = 1;
      expect(strongestNeed(needs, guests, person)?.need, kind).not.toBe('health');
    }
  });

  it('is put right by a visit that relieves it, and reset for the next guest', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    needs.level.health[2] = 0.35;
    relieve(needs, 2, [{ need: 'health', amount: 1 }]);
    expect(needs.level.health[2]).toBe(1);
    needs.level.health[2] = 0.2;
    resetNeeds(needs, 2, () => 0.5);
    expect(needs.level.health[2]).toBe(1);
  });
});
