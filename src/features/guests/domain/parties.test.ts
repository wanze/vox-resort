import { describe, expect, it } from 'vitest';
import { createRandom } from '../../layout/domain/random';
import { PARTY_MIX, partiesFor, type PartyKind } from './parties';

const partiesOf = (count: number, seed = 1) => partiesFor({ count, random: createRandom(seed) });

describe('partiesFor', () => {
  it('divides nobody into no parties', () => {
    const { parties, party, child } = partiesOf(0);
    expect(parties).toEqual([]);
    expect(party.length).toBe(0);
    expect(child.length).toBe(0);
  });

  it('puts every person in exactly one party, in order', () => {
    const { parties } = partiesOf(537);
    expect(parties.flatMap((p) => p.members)).toEqual(Array.from({ length: 537 }, (_, i) => i));
  });

  it("agrees with each party's members about who is in it", () => {
    const { parties, party } = partiesOf(300, 4);
    parties.forEach((p, index) => {
      for (const member of p.members) expect(party[member]).toBe(index);
    });
  });

  it('never has a child without an adult, and lists adults first', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { parties, child } = partiesOf(1 + (seed % 7) * 3, seed);
      for (const p of parties) {
        const flags = p.members.map((m) => child[m]!);
        expect(flags[0], `party of ${p.kind} led by a child`).toBe(0);
        expect(flags).toEqual(flags.toSorted((a, b) => a - b));
        if (p.kind !== 'family') expect(flags.every((flag) => flag === 0)).toBe(true);
      }
    }
  });

  it('makes a party of one a lone adult', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { parties, child } = partiesOf(1, seed);
      expect(parties).toHaveLength(1);
      expect(child[0]).toBe(0);
    }
  });

  it('replays the same parties for the same seed', () => {
    const a = partiesOf(200, 11);
    const b = partiesOf(200, 11);
    expect(a.parties).toEqual(b.parties);
    expect(Array.from(a.child)).toEqual(Array.from(b.child));
  });

  it('comes close to the declared mix over a large crowd', () => {
    const { parties } = partiesOf(40_000, 5);
    const counts = new Map<PartyKind, number>();
    for (const p of parties) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    for (const shape of PARTY_MIX) {
      expect((counts.get(shape.kind) ?? 0) / parties.length).toBeCloseTo(shape.share, 1);
    }
  });
});
