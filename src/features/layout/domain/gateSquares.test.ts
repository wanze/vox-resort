import { describe, expect, it } from 'vitest';
import { gateSquare, GATE_SQUARE_DEPTH } from './gateSquares';

const isStreet = (x: number, z: number) => x === 10 || x === 11 || z === 1 || z === 2;

describe('gateSquare', () => {
  it('opens a square into the plot from a gate on its north edge', () => {
    const square = gateSquare({ x0: 9, x1: 12, z0: 0, z1: 0 }, 'south', isStreet);
    expect(square.plaza).toEqual({ x0: 8, x1: 13, z0: 1, z1: GATE_SQUARE_DEPTH });
    expect(square.beds).toEqual([
      { x: 8, z: 4 },
      { x: 13, z: 4 },
    ]);
    expect(square.sign).toEqual({ x: 9, z: 3 });
  });

  it('stands nothing on the streets that cross it', () => {
    for (const [gate, inward] of [
      [{ x0: 0, x1: 0, z0: 0, z1: 3 }, 'east'],
      [{ x0: 30, x1: 30, z0: 0, z1: 3 }, 'west'],
      [{ x0: 9, x1: 12, z0: 0, z1: 0 }, 'south'],
    ] as const) {
      const square = gateSquare(gate, inward, isStreet);
      for (const tile of [...square.beds, ...(square.sign ? [square.sign] : [])]) {
        expect(isStreet(tile.x, tile.z)).toBe(false);
      }
    }
  });

  it('frames the far side of a square opening from the west edge', () => {
    const square = gateSquare({ x0: 0, x1: 0, z0: 5, z1: 8 }, 'east', () => false);
    expect(square.plaza).toEqual({ x0: 1, x1: 4, z0: 4, z1: 9 });
    expect(square.beds).toEqual([
      { x: 4, z: 4 },
      { x: 4, z: 9 },
    ]);
    expect(square.sign).toEqual({ x: 1, z: 6 });
  });

  it('opens a square the other way from the east edge', () => {
    const square = gateSquare({ x0: 39, x1: 39, z0: 5, z1: 8 }, 'west', () => false);
    expect(square.plaza).toEqual({ x0: 35, x1: 38, z0: 4, z1: 9 });
    expect(square.beds.every((bed) => bed.x === 35)).toBe(true);
  });

  it('has no sign where every tile is street', () => {
    expect(gateSquare({ x0: 0, x1: 3, z0: 0, z1: 0 }, 'south', () => true).sign).toBeNull();
  });
});
