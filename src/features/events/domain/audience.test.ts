import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { PartyKind } from '../../guests/domain/parties';
import { EVENT_KINDS, type AudienceParty, type EventKind } from './catalogue';
import {
  expectedAudience,
  INVITE_URGENCY,
  isInterested,
  partiesAmong,
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

  it('asks no urgency of a party with a member busy', () => {
    const index = guests.parties.findIndex((each) => each.members.length >= 2);
    const { members } = guests.parties[index]!;
    const busy = members.at(-1)!;
    const asked = new Set<number>();
    const free = partiesOf(
      guests,
      (person) => person !== busy,
      (person) => {
        asked.add(person);
        return 0;
      },
    );
    expect(members.filter((member) => asked.has(member))).toEqual([]);
    expect(free.some((each) => each.party === index)).toBe(false);
  });
});

describe('stepFree', () => {
  const many = createGuests({ count: 400, homes: HOMES, variants: 4, childVariant: 3, seed: 9 });
  const all = partiesOf(
    many,
    () => true,
    () => 0,
  );

  it('marks the parties with a wheelchair along, and only those', () => {
    const marked = all.filter((each) => each.stepFree === true).map((each) => each.party);
    const wheeled = all
      .filter((each) => many.parties[each.party]!.wheelchair >= 0)
      .map((each) => each.party);
    expect(wheeled.length).toBeGreaterThan(0);
    expect(wheeled.length).toBeLessThan(all.length);
    expect(marked).toEqual(wheeled);
  });

  it('keeps such a party away from the fireworks, which have no way onto the sand', () => {
    const wheeled = all.find((each) => each.stepFree === true)!;
    const keen = {
      ...EVENT_KINDS.fireworks,
      appeal: { family: 1, couple: 1, friends: 1, solo: 1 },
    };
    expect(isInterested(wheeled, keen, 'grand', 0, 7)).toBe(false);
    expect(isInterested({ ...wheeled, stepFree: false }, keen, 'grand', 0, 7)).toBe(true);
  });
});

describe('partiesAmong', () => {
  it('looks only at the parties given, as partiesOf would see them', () => {
    const among = partiesAmong(
      guests,
      [3, 1, 99],
      () => true,
      () => 0,
    );
    const all = partiesOf(
      guests,
      () => true,
      () => 0,
    );
    expect(among).toEqual([3, 1].map((index) => all.find((each) => each.party === index)));
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

describe('the free and the picked, pinned', () => {
  it('finds the same free parties', () => {
    const free = partiesOf(
      guests,
      (person) => person % 7 !== 3,
      (person) => (person % 5 === 0 ? 0.6 : 0),
    );
    expect(free.map((each) => each.party)).toEqual([3, 5, 10, 15, 17]);
    expect(free.reduce((sum, each) => sum + each.people, 0)).toBe(10);
  });

  it('picks the same parties in the same order', () => {
    const HALF: EventKind = {
      ...EVENT_KINDS['live-music'],
      appeal: { family: 0.5, couple: 0.5, friends: 0.5, solo: 0.5 },
    };
    expect(pickAudience(ask({ kind: HALF, room: 40 }))).toEqual([
      15, 37, 6, 12, 8, 30, 9, 19, 27, 11, 31, 26, 35, 33,
    ]);
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
    expect(expectedAudience(EVENT_KINDS.fireworks, counts, 100, 1.25)).toBeGreaterThan(
      expectedAudience(EVENT_KINDS.fireworks, counts, 100),
    );
    expect(expectedAudience(EVENT_KINDS.fireworks, counts, 100, 0.8)).toBeLessThan(
      expectedAudience(EVENT_KINDS.fireworks, counts, 100),
    );
    expect(expectedAudience(EVERYONE, counts, 100, 3)).toBe(24);
    expect(expectedAudience(EVERYONE, counts, 10, 3)).toBe(10);
    const mixed = partyMixOf(guests);
    const people = Object.values(mixed).reduce((sum, each) => sum + each.people, 0);
    expect(people).toBe(60);
  });
});
