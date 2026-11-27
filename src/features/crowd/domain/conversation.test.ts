import { describe, expect, it } from 'vitest';
import {
  easeTurn,
  facesParty,
  MINGLE_FACING_SHARE,
  MINGLE_SPELL,
  MINGLE_RADIUS,
  MINGLE_TURN_LIMIT,
  mingleTurns,
  TALK,
  TALK_RADIUS,
  talkGridFor,
  talkSides,
  type Sitters,
} from './conversation';

interface Sitter {
  readonly x: number;
  readonly z: number;
  readonly y?: number;
  readonly heading?: number;
  readonly sitting?: boolean;
}

function sidesOf(people: readonly Sitter[]): number[] {
  const sitters: Sitters = {
    count: people.length,
    x: people.map((p) => p.x),
    y: people.map((p) => p.y ?? 0),
    z: people.map((p) => p.z),
    heading: people.map((p) => p.heading ?? 0),
    sitting: people.map((p) => (p.sitting === false ? 0 : 1)),
  };
  const out = new Uint8Array(people.length).fill(99);
  talkSides(sitters, talkGridFor(people.length), out);
  return [...out];
}

const pairOnABench = (sitting: readonly number[]): Sitters => ({
  count: 2,
  x: [10, 14],
  y: [0, 0],
  z: [10, 10],
  heading: [0, 0],
  sitting,
});

describe('talkSides', () => {
  it('turns neighbours on a bench towards each other', () => {
    expect(
      sidesOf([
        { x: 10, z: 10 },
        { x: 14, z: 10 },
      ]),
    ).toEqual([TALK.plusX, TALK.minusX]);
  });

  it('measures the side in the sitter’s own frame', () => {
    const facingEast = Math.PI / 2;
    const sides = sidesOf([
      { x: 10, z: 10, heading: facingEast },
      { x: 10, z: 14, heading: facingEast },
    ]);
    expect(sides).toEqual([TALK.minusX, TALK.plusX]);
  });

  it('talks straight ahead across a table', () => {
    const sides = sidesOf([
      { x: 10, z: 10, heading: 0 },
      { x: 10, z: 17, heading: Math.PI },
    ]);
    expect(sides).toEqual([TALK.ahead, TALK.ahead]);
  });

  it('picks the nearer of two neighbours', () => {
    const sides = sidesOf([
      { x: 10, z: 10 },
      { x: 14, z: 10 },
      { x: 10, z: 17, heading: Math.PI },
    ]);
    expect(sides[0]).toBe(TALK.plusX);
  });

  it('leaves alone a sitter with nobody in reach', () => {
    expect(
      sidesOf([
        { x: 10, z: 10 },
        { x: 10 + TALK_RADIUS + 1, z: 10 },
      ]),
    ).toEqual([TALK.none, TALK.none]);
  });

  it('ignores whoever sits behind, a storey up or is not sitting', () => {
    expect(
      sidesOf([
        { x: 10, z: 10 },
        { x: 10, z: 5 },
      ]),
    ).toEqual([TALK.none, TALK.ahead]);
    expect(
      sidesOf([
        { x: 10, z: 10 },
        { x: 14, z: 10, y: 6 },
      ]),
    ).toEqual([TALK.none, TALK.none]);
    expect(
      sidesOf([
        { x: 10, z: 10 },
        { x: 14, z: 10, sitting: false },
      ]),
    ).toEqual([TALK.none, TALK.none]);
  });

  it('finds neighbours across a cell boundary and at negative coordinates', () => {
    const edge = TALK_RADIUS * 3;
    expect(
      sidesOf([
        { x: edge - 1, z: -3 },
        { x: edge + 2, z: -3 },
      ]),
    ).toEqual([TALK.plusX, TALK.minusX]);
  });

  it('forgets a talker who stood up since the last frame', () => {
    const grid = talkGridFor(2);
    const out = new Uint8Array(2);
    talkSides(pairOnABench([1, 1]), grid, out);
    talkSides(pairOnABench([1, 0]), grid, out);
    expect([...out]).toEqual([TALK.none, TALK.none]);
  });
});

interface Mingler {
  readonly x: number;
  readonly z: number;
  readonly party: number;
  readonly y?: number;
  readonly heading?: number;
}

function mingle(people: readonly Mingler[]): { turn: number[]; talks: number[] } {
  const out = {
    turn: new Float32Array(people.length).fill(99),
    talks: new Uint8Array(people.length).fill(99),
  };
  mingleTurns(
    {
      count: people.length,
      x: people.map((p) => p.x),
      y: people.map((p) => p.y ?? 0),
      z: people.map((p) => p.z),
      heading: people.map((p) => p.heading ?? 0),
      party: people.map((p) => p.party),
    },
    talkGridFor(people.length),
    out,
  );
  return { turn: [...out.turn], talks: [...out.talks] };
}

describe('mingleTurns', () => {
  it('turns two of a party stood side by side towards each other, short of square', () => {
    const { turn, talks } = mingle([
      { x: 10, z: 10, party: 1 },
      { x: 14, z: 10, party: 1 },
    ]);
    expect(talks).toEqual([1, 1]);
    expect(turn[0]).toBeCloseTo(MINGLE_TURN_LIMIT, 5);
    expect(turn[1]).toBeCloseTo(-MINGLE_TURN_LIMIT, 5);
  });

  it('turns the whole way to somebody a little off ahead', () => {
    const { turn } = mingle([
      { x: 10, z: 10, party: 2 },
      { x: 11, z: 14, party: 2, heading: Math.PI },
    ]);
    expect(turn[0]).toBeCloseTo(Math.atan2(1, 4), 5);
  });

  it('leaves alone strangers, the party a storey up and anybody out of reach', () => {
    expect(
      mingle([
        { x: 10, z: 10, party: 1 },
        { x: 14, z: 10, party: 2 },
      ]).talks,
    ).toEqual([0, 0]);
    expect(
      mingle([
        { x: 10, z: 10, party: 1 },
        { x: 14, z: 10, party: 1, y: 6 },
      ]).talks,
    ).toEqual([0, 0]);
    expect(
      mingle([
        { x: 10, z: 10, party: 1 },
        { x: 10 + MINGLE_RADIUS + 1, z: 10, party: 1 },
      ]).talks,
    ).toEqual([0, 0]);
  });

  it('never pairs those who stand with nobody, even with each other', () => {
    const { turn, talks } = mingle([
      { x: 10, z: 10, party: 0 },
      { x: 14, z: 10, party: 0 },
    ]);
    expect(talks).toEqual([0, 0]);
    expect(turn).toEqual([0, 0]);
  });

  it('turns to the nearest of a party of three', () => {
    const { turn } = mingle([
      { x: 10, z: 10, party: 3 },
      { x: 10, z: 13, party: 3 },
      { x: 17, z: 11, party: 3, heading: -Math.PI / 2 },
    ]);
    expect(turn[0]).toBeCloseTo(0, 5);
    expect(turn[2]).toBeCloseTo(-Math.atan2(1, 7), 5);
  });
});

describe('easeTurn', () => {
  it('moves at most a step towards the target, and stops on it', () => {
    expect(easeTurn(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(easeTurn(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(easeTurn(0.9, 1, 0.25)).toBeCloseTo(1);
    expect(easeTurn(0.5, 0.5, 0)).toBe(0.5);
  });
});

describe('facesParty', () => {
  it('changes its mind only between spells, and faces the party about the share of spells', () => {
    const spells = 2000;
    const samples = 10;
    let facing = 0;
    let flips = 0;
    let was = facesParty(0, 4);
    for (let at = 0; at < spells * samples; at++) {
      const now = facesParty((at * MINGLE_SPELL) / samples, 4);
      if (now !== was) flips++;
      if (now) facing++;
      was = now;
    }
    expect(flips).toBeLessThanOrEqual(spells);
    expect(facing / (spells * samples)).toBeGreaterThan(MINGLE_FACING_SHARE - 0.05);
    expect(facing / (spells * samples)).toBeLessThan(MINGLE_FACING_SHARE + 0.05);
  });

  it('gives every member of a party the same answer, and other parties their own', () => {
    const answers = Array.from({ length: 50 }, (_, spell) => facesParty(spell * MINGLE_SPELL, 9));
    expect(answers).toEqual(
      Array.from({ length: 50 }, (_, spell) => facesParty(spell * MINGLE_SPELL, 9)),
    );
    const other = Array.from({ length: 50 }, (_, spell) => facesParty(spell * MINGLE_SPELL, 10));
    expect(other).not.toEqual(answers);
  });
});
