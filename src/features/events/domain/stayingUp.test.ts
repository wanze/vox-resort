import { describe, expect, it } from 'vitest';
import type { AudienceParty } from './catalogue';
import { pickAudience } from './audience';
import { EVENT_KINDS } from './catalogue';
import { saltOf } from './eventRuns';
import { book, EMPTY_PROGRAMME, occurrencesOn, type Programme } from './programme';
import { createGuests } from '../../guests/domain/guests';
import {
  bookingDayKey,
  keenParties,
  markKeen,
  showToTell,
  STAY_UP_FROM,
  tonightsShow,
} from './stayingUp';
import { tickAt } from './week';

const DAY = 3;

const PROGRAMME: Programme = book(
  EMPTY_PROGRAMME,
  {
    kind: 'fireworks',
    site: { kind: 'beach' },
    repeat: { every: 'day' },
    start: 22 * 60,
    tier: 'grand',
  },
  0,
).programme;

const SHOW = occurrencesOn(PROGRAMME, DAY)[0]!;

const ask = (now: number, over: Partial<Parameters<typeof tonightsShow>[0]> = {}) =>
  tonightsShow({ programme: PROGRAMME, now, open: () => true, settled: new Set(), ...over });

const party = (index: number, stepFree = false): AudienceParty => ({
  party: index,
  kind: 'solo',
  people: 1,
  children: 0,
  arrivedOn: 0,
  ...(stepFree ? { stepFree } : {}),
});

const PARTIES = Array.from({ length: 60 }, (_, index) => party(index));

describe('tonightsShow', () => {
  it('is nothing before noon, and the show from noon until it ends', () => {
    expect(ask(tickAt(DAY, STAY_UP_FROM) - 1)).toBeNull();
    expect(ask(tickAt(DAY, STAY_UP_FROM))).toEqual(SHOW);
    expect(ask(SHOW.end - 1)).toEqual(SHOW);
    expect(ask(SHOW.end)).toBeNull();
  });

  it('is nothing on a day the beach is shut', () => {
    expect(ask(tickAt(DAY, 18 * 60), { open: () => false })).toBeNull();
  });

  it('is nothing once the show was called off or moved', () => {
    const settled = new Set([bookingDayKey(SHOW)]);
    expect(ask(tickAt(DAY, 18 * 60), { settled })).toBeNull();
  });

  it('ignores a kind that does not keep anybody up', () => {
    const music = book(
      EMPTY_PROGRAMME,
      {
        kind: 'cinema',
        site: { kind: 'stage', venue: 'stage#0' },
        repeat: { every: 'day' },
        start: 21.5 * 60,
      },
      0,
    ).programme;
    expect(ask(tickAt(DAY, 18 * 60), { programme: music })).toBeNull();
  });
});

describe('showToTell', () => {
  it("tells in the morning of the night's show, unless the beach is shut", () => {
    const morning = { programme: PROGRAMME, open: () => true, settled: new Set<string>() };
    expect(showToTell({ ...morning, day: DAY })).toEqual(SHOW);
    expect(showToTell({ ...morning, day: DAY, open: () => false })).toBeNull();
  });
});

describe('markKeen', () => {
  it('marks exactly the parties the run would pick', () => {
    const keen = new Uint8Array(PARTIES.length);
    markKeen(PARTIES, SHOW, keen);
    const picked = pickAudience({
      parties: PARTIES,
      kind: EVENT_KINDS.fireworks,
      tier: SHOW.tier,
      day: SHOW.day,
      room: 10_000,
      salt: saltOf(SHOW),
    });
    const marked = PARTIES.filter((each) => keen[each.party] === 1).map((each) => each.party);
    expect(marked.toSorted((a, b) => a - b)).toEqual(picked.toSorted((a, b) => a - b));
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThan(PARTIES.length);
  });

  it('never keeps up a party with a wheelchair, and clears what it marked before', () => {
    const keen = new Uint8Array(PARTIES.length).fill(1);
    markKeen(
      PARTIES.map((each) => party(each.party, true)),
      SHOW,
      keen,
    );
    expect(keen.every((flag) => flag === 0)).toBe(true);
  });
});

describe('keenParties', () => {
  const guests = createGuests({
    count: 80,
    homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 200 }],
    variants: 4,
    childVariant: 3,
    seed: 2,
  });

  it('grows to the parties there are, and clears with no show', () => {
    const keen = keenParties(guests, SHOW, new Uint8Array(1));
    expect(keen).toHaveLength(guests.parties.length);
    expect(keen.some((flag) => flag === 1)).toBe(true);
    const same = keenParties(guests, null, keen);
    expect(same).toBe(keen);
    expect(keen.every((flag) => flag === 0)).toBe(true);
  });
});
