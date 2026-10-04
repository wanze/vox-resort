import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { PartyKind } from '../../guests/domain/parties';
import { EVENT_KINDS, type AudienceParty, type EventKind } from './catalogue';
import {
  expectedAudience,
  INVITE_URGENCY,
  partiesOf,
  partyMixOf,
  pickAudience,
  type PartyMix,
} from './audience';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 200 }];

const guests = createGuests({ count: 60, homes: HOMES, variants: 4, childVariant: 3, seed: 9 });

const EVERYONE: EventKind = {
  ...EVENT_KINDS['live-music'],
  appeal: { family: 1, couple: 1, friends: 1, solo: 1 },
};

const party = (index: number, people: number, kind: PartyKind = 'couple'): AudienceParty => ({
  party: index,
  kind,
  people,
  children: 0,
  arrivedOn: 0,
});

const MANY = Array.from({ length: 40 }, (_, index) => party(index, 2 + (index % 3)));

const ask = (over: Partial<Parameters<typeof pickAudience>[0]> = {}) => ({
  parties: MANY,
  kind: EVERYONE,
  tier: undefined,
  day: 0,
  room: 1000,
  salt: 7,
  ...over,
});

describe('partiesOf', () => {
  const all = partiesOf(
    guests,
    () => true,
    () => 0,
  );

  it('leaves out a party with one member busy', () => {
    const busy = guests.parties[0]!.members[0]!;
    const free = partiesOf(
      guests,
      (person) => person !== busy,
      () => 0,
    );
    expect(all.some((each) => each.party === 0)).toBe(true);
    expect(free.some((each) => each.party === 0)).toBe(false);
    expect(free).toHaveLength(all.length - 1);
  });

  it('leaves out a party with an urgent need, but not one that only wants fun', () => {
    const hungry = guests.parties[1]!.members.at(-1)!;
    const urgent = partiesOf(
      guests,
      () => true,
      (person) => (person === hungry ? INVITE_URGENCY : 0),
    );
    expect(urgent.some((each) => each.party === 1)).toBe(false);
    expect(all.find((each) => each.party === 1)?.people).toBe(guests.parties[1]!.members.length);
  });
});

describe('pickAudience', () => {
  it('never overfills the room, and lets a smaller party into a gap', () => {
    const picked = pickAudience(ask({ parties: [party(0, 3), party(1, 3), party(2, 1)], room: 4 }));
    expect(picked).toHaveLength(2);
    expect(picked).toContain(2);
    const people = pickAudience(ask({ room: 23 })).reduce((sum, at) => sum + MANY[at]!.people, 0);
    expect(people).toBeLessThanOrEqual(23);
    expect(people).toBeGreaterThanOrEqual(21);
  });

  it('picks the same parties for the same salt, whatever the order', () => {
    const half = { ...EVERYONE, appeal: { family: 0.5, couple: 0.5, friends: 0.5, solo: 0.5 } };
    const forwards = pickAudience(ask({ kind: half }));
    const backwards = pickAudience(ask({ kind: half, parties: MANY.toReversed() }));
    expect(backwards).toEqual(forwards);
    expect(forwards.length).toBeGreaterThan(5);
    expect(forwards.length).toBeLessThan(35);
  });

  it('can pick others for another salt', () => {
    const half = { ...EVERYONE, appeal: { family: 0.5, couple: 0.5, friends: 0.5, solo: 0.5 } };
    expect(pickAudience(ask({ kind: half, salt: 8 }))).not.toEqual(
      pickAudience(ask({ kind: half })),
    );
  });

  it('picks nobody for an appeal of 0, nor a party the kind turns away', () => {
    const nobody = { ...EVERYONE, appeal: { family: 0, couple: 0, friends: 0, solo: 0 } };
    expect(pickAudience(ask({ kind: nobody }))).toEqual([]);
    expect(
      pickAudience(ask({ kind: { ...EVERYONE, audience: (each) => each.children > 0 } })),
    ).toEqual([]);
  });
});

describe('expectedAudience', () => {
  it('guesses from the mix, capped by the capacity', () => {
    const counts: PartyMix = {
      family: { people: 40, withChildren: 40 },
      couple: { people: 20, withChildren: 0 },
      friends: { people: 0, withChildren: 0 },
      solo: { people: 0, withChildren: 0 },
    };
    expect(expectedAudience(EVERYONE, counts, 100)).toBe(24);
    expect(expectedAudience(EVERYONE, counts, 10)).toBe(10);
    expect(expectedAudience(EVENT_KINDS['kids-show'], counts, 100)).toBe(Math.round(0.4 * 36));
    const mixed = partyMixOf(guests);
    const people = Object.values(mixed).reduce((sum, each) => sum + each.people, 0);
    expect(people).toBe(60);
  });
});
