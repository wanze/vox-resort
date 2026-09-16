import { describe, expect, it } from 'vitest';
import { assignHomes, homeWithRoom, NO_HOME, type Home } from './homes';
import type { Party } from './parties';

let nextPerson = 0;
const partyOfSize = (size: number): Party => ({
  kind: size === 1 ? 'solo' : 'family',
  family: 'Rossi',
  members: Array.from({ length: size }, () => nextPerson++),
});

const home = (key: string, beds: number): Home => ({ key, id: key, label: key, beds });

describe('assignHomes', () => {
  it('houses a party that fits and takes its beds', () => {
    const { byParty, freeBeds } = assignHomes([partyOfSize(3)], [home('villa', 8)]);
    expect(byParty[0]).toBe(0);
    expect(freeBeds[0]).toBe(5);
  });

  it('leaves a party bigger than any lodging without a home', () => {
    const { byParty, freeBeds } = assignHomes([partyOfSize(5)], [home('bungalow', 4)]);
    expect(byParty[0]).toBe(NO_HOME);
    expect(freeBeds[0]).toBe(4);
  });

  it('gives the biggest party the biggest lodging', () => {
    const parties = [partyOfSize(2), partyOfSize(5), partyOfSize(2)];
    const { byParty } = assignHomes(parties, [home('hotel', 5), home('bungalow', 4)]);
    expect(byParty[1]).toBe(0);
    expect(byParty[0]).toBe(1);
    expect(byParty[2]).toBe(1);
  });

  it('never puts more people in a home than it has beds', () => {
    const parties = Array.from({ length: 60 }, (_, i) => partyOfSize(1 + (i % 5)));
    const homes = [home('hotel', 40), home('villa', 8), home('house', 6), home('bungalow', 4)];
    const { byParty, freeBeds } = assignHomes(parties, homes);
    const housed = Array.from({ length: homes.length }, () => 0);
    parties.forEach((p, index) => {
      const at = byParty[index]!;
      if (at !== NO_HOME) housed[at] = housed[at]! + p.members.length;
    });
    homes.forEach((h, index) => {
      expect(housed[index]).toBeLessThanOrEqual(h.beds);
      expect(freeBeds[index]).toBe(h.beds - housed[index]!);
    });
  });

  it('leaves everybody homeless on a plot with no lodging, without throwing', () => {
    const { byParty, freeBeds } = assignHomes([partyOfSize(2), partyOfSize(1)], []);
    expect(Array.from(byParty)).toEqual([NO_HOME, NO_HOME]);
    expect(freeBeds.length).toBe(0);
  });

  it("does not reorder the caller's parties", () => {
    const parties = [partyOfSize(1), partyOfSize(4), partyOfSize(2)];
    const before = [...parties];
    assignHomes(parties, [home('villa', 8)]);
    expect(parties).toEqual(before);
  });

  it('gives the same answer every time, with no generator to seed', () => {
    const parties = Array.from({ length: 30 }, (_, i) => partyOfSize(1 + ((i * 7) % 4)));
    const homes = [home('villa', 8), home('cottage', 4), home('bungalow', 4)];
    const a = assignHomes(parties, homes);
    const b = assignHomes(parties, homes);
    expect(Array.from(a.byParty)).toEqual(Array.from(b.byParty));
    expect(Array.from(a.freeBeds)).toEqual(Array.from(b.freeBeds));
  });
});

describe('homeWithRoom', () => {
  it('picks the same home the greedy pass does, and says so when none fits', () => {
    const homes = [home('villa', 8), home('cottage', 4), home('bungalow', 4)];
    const parties = [partyOfSize(5), partyOfSize(4), partyOfSize(3), partyOfSize(2)];
    const { byParty, freeBeds } = assignHomes(parties, homes);

    // The greedy pass asks the same question party by party, so replaying it
    // against a fresh bed count has to give the same answer at every step.
    const beds = Int32Array.from(homes, (each) => each.beds);
    const order = [0, 1, 2, 3];
    for (const party of order) {
      const chosen = homeWithRoom(beds, parties[party]!.members.length);
      expect(chosen).toBe(byParty[party]);
      if (chosen !== NO_HOME) beds[chosen] = beds[chosen]! - parties[party]!.members.length;
    }
    expect(Array.from(beds)).toEqual(Array.from(freeBeds));
    expect(homeWithRoom(beds, 99)).toBe(NO_HOME);
    expect(homeWithRoom(new Int32Array(0), 1)).toBe(NO_HOME);
  });
});
