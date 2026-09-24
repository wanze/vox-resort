import { describe, expect, it } from 'vitest';
import { createGuests, partyOf, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { clearAllGoals, clearPartyGoal, createGoals, NO_GOAL, setPartyGoal } from './goals';
import { NEEDS } from './needs';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 }];

const guests: Guests = createGuests({
  count: 120,
  homes: HOMES,
  variants: 4,
  childVariant: 3,
  seed: 5,
});

const inAParty = (): number => {
  for (let person = 0; person < guests.count; person++) {
    if (partyOf(guests, person).length > 1) return person;
  }
  throw new Error('everybody came alone');
};

describe('createGoals', () => {
  it('starts everybody with nowhere to be', () => {
    const goals = createGoals(10);
    expect(goals.count).toBe(10);
    expect([...goals.venue]).toEqual(Array.from({ length: 10 }, () => NO_GOAL));
  });
});

describe('setPartyGoal', () => {
  it('sends the whole party, because a holiday is taken together', () => {
    const goals = createGoals(guests.count);
    const person = inAParty();
    const party = partyOf(guests, person);
    setPartyGoal(goals, guests, person, { venue: 3, need: 'hunger' });
    for (const member of party) {
      expect(goals.venue[member], `member ${member}`).toBe(3);
      expect(goals.need[member]).toBe(NEEDS.indexOf('hunger'));
    }
  });

  it('leaves everybody outside the party where they were', () => {
    const goals = createGoals(guests.count);
    const person = inAParty();
    const party = new Set(partyOf(guests, person));
    setPartyGoal(goals, guests, person, { venue: 3, need: 'hunger' });
    for (let other = 0; other < guests.count; other++) {
      if (party.has(other)) continue;
      expect(goals.venue[other], `person ${other}`).toBe(NO_GOAL);
    }
  });

  it('ignores a person the goals are not long enough to hold', () => {
    const goals = createGoals(4);
    expect(() => setPartyGoal(goals, guests, 100, { venue: 1, need: 'fun' })).not.toThrow();
    expect([...goals.venue]).toEqual([NO_GOAL, NO_GOAL, NO_GOAL, NO_GOAL]);
  });
});

describe('clearPartyGoal', () => {
  it('forgets the whole party, and nobody else', () => {
    const goals = createGoals(guests.count);
    const person = inAParty();
    const other = [...Array(guests.count).keys()].find(
      (candidate) => !partyOf(guests, person).includes(candidate),
    )!;
    setPartyGoal(goals, guests, person, { venue: 3, need: 'hunger' });
    setPartyGoal(goals, guests, other, { venue: 5, need: 'thirst' });

    clearPartyGoal(goals, guests, person);
    for (const member of partyOf(guests, person)) expect(goals.venue[member]).toBe(NO_GOAL);
    expect(goals.venue[other]).toBe(5);
  });

  it('ignores a person past the end rather than throwing', () => {
    const goals = createGoals(4);
    expect(() => clearPartyGoal(goals, guests, 100)).not.toThrow();
  });
});

describe('clearAllGoals', () => {
  it('drops everybody, because a rebuilt graph leaves no node index standing', () => {
    const goals = createGoals(guests.count);
    for (let person = 0; person < guests.count; person++) {
      setPartyGoal(goals, guests, person, { venue: 2, need: 'fun' });
    }
    clearAllGoals(goals);
    expect([...goals.venue].every((venue) => venue === NO_GOAL)).toBe(true);
  });
});
