import { describe, expect, it } from 'vitest';
import { groupFigures } from './figures';

const figures = (kind: 'family' | 'solo', parties: number) =>
  groupFigures({ kind, parties }).parties.map((party) => party.map((each) => each.figure));

describe('groupFigures', () => {
  it('draws each party as its typical members', () => {
    expect(figures('family', 1)).toEqual([['adult', 'adult', 'child', 'child']]);
    expect(figures('solo', 2)).toEqual([['adult'], ['adult']]);
  });

  it('draws a wedding as the friends and the couples who came', () => {
    const { parties } = groupFigures({ kind: 'wedding', parties: 3 });
    expect(parties.map((party) => party.length)).toEqual([4, 2, 2]);
  });

  it('seats every guest drawn once, in order', () => {
    const seats = groupFigures({ kind: 'couple', parties: 3 }).parties.flat();
    expect(seats.map((each) => each.seat)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('counts the parties it has no room to draw', () => {
    const group = groupFigures({ kind: 'couple', parties: 8 }, 5);
    expect(group.parties).toHaveLength(5);
    expect(group.more).toBe(3);
  });
});
