import { describe, expect, it } from 'vitest';
import type { WalkNode } from '../../crowd/domain/walkNetwork';
import { MAX_QUEUE_SHOWN, queueSpotAt } from './queueSpot';

const nodeAt = (x: number, z: number, y = 3): WalkNode => ({
  x,
  z,
  y,
  tileX: 0,
  tileZ: 0,
  exits: [],
  gate: false,
  seats: [],
});

/** The venue's middle, with the door some way off it in one direction. */
const CENTRE = { x: 100, z: 100 };

describe('queueSpotAt', () => {
  it('stands the first person on the door itself', () => {
    const door = nodeAt(100, 130);
    const spot = queueSpotAt(door, CENTRE, 0);
    expect(spot.x).toBeCloseTo(door.x);
    expect(spot.z).toBeCloseTo(door.z);
    expect(spot.y).toBe(door.y);
  });

  it('marches the line away from the venue at an even spacing', () => {
    const door = nodeAt(100, 130);
    const spacing = queueSpotAt(door, CENTRE, 1).z - queueSpotAt(door, CENTRE, 0).z;
    expect(spacing).toBeGreaterThan(0);
    for (let slot = 0; slot < MAX_QUEUE_SHOWN; slot++) {
      const spot = queueSpotAt(door, CENTRE, slot);
      // Straight out along +z, which is the way the door lies from the centre.
      expect(spot.x, `slot ${slot} x`).toBeCloseTo(100);
      expect(spot.z, `slot ${slot} z`).toBeCloseTo(130 + slot * spacing);
      // Further from the venue with every place back in the line.
      expect(Math.hypot(spot.x - CENTRE.x, spot.z - CENTRE.z)).toBeCloseTo(30 + slot * spacing);
    }
  });

  it('faces everybody in the line back at the door, whichever way it lies', () => {
    for (const [dx, dz] of [
      [0, 30],
      [0, -30],
      [30, 0],
      [-30, 0],
    ] as const) {
      const door = nodeAt(CENTRE.x + dx, CENTRE.z + dz);
      // Derived from the same convention `segment` writes a heading with -
      // `atan2` of the way somebody is travelling - rather than from a number
      // guessed off the compass: they are travelling from the line to the door,
      // which is the direction from the centre to the door, reversed.
      const towards = Math.atan2(-dx / 30, -dz / 30);
      for (const slot of [0, 1, 5]) {
        const { heading } = queueSpotAt(door, CENTRE, slot);
        expect(Math.cos(heading - towards), `${dx},${dz} slot ${slot}`).toBeCloseTo(1);
      }
    }
  });

  it('gives a door on the venue own middle a line rather than a heap of NaN', () => {
    const door = nodeAt(CENTRE.x, CENTRE.z);
    const first = queueSpotAt(door, CENTRE, 0);
    const third = queueSpotAt(door, CENTRE, 2);
    for (const value of [first.x, first.z, first.heading, third.x, third.z, third.heading]) {
      expect(Number.isNaN(value)).toBe(false);
    }
    expect(Math.hypot(third.x - first.x, third.z - first.z)).toBeGreaterThan(0);
  });
});
