import { describe, expect, it } from 'vitest';
import { TALK, TALK_RADIUS, talkGridFor, talkSides, type Sitters } from './conversation';

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
