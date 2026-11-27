import { describe, expect, it } from 'vitest';
import { bordersFor, STONE_CHANCE, type BorderGround } from './borders';
import type { Tile } from './resortLayout';
import { tileKey } from './tileKey';

// Paths drawn as '=', grass as '.', where nothing may grow as '#'.
function groundOf(rows: readonly string[], favoursStone = false) {
  const at = (x: number, z: number): string => rows[z]?.[x] ?? '#';
  const ground: BorderGround = {
    isPaved: (x, z) => at(x, z) === '=',
    canPlant: (x, z) => at(x, z) === '.',
    favoursStone: () => favoursStone,
  };
  const ring: Tile[] = [];
  rows.forEach((row, z) =>
    [...row].forEach((cell, x) => {
      const besidePath = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dz]) => at(x + dx!, z + dz!) === '=');
      if (cell === '.' && besidePath) ring.push({ x, z });
    }),
  );
  return { ground, ring };
}

const keysOf = (tiles: readonly { tile: Tile }[]) =>
  new Set(tiles.map(({ tile }) => tileKey(tile.x, tile.z)));

const laidOn = (rows: readonly string[]) => {
  const { ground, ring } = groundOf(rows);
  const { hedges, walls } = bordersFor(ring, ground, []);
  return [...hedges, ...walls];
};

describe('bordersFor', () => {
  it('closes the corner inside a bend in the path', () => {
    const laid = laidOn(['=====', '=....', '=....', '=....']);
    expect(keysOf(laid).has('1,1')).toBe(true);
    expect(laid.find(({ tile }) => tile.x === 2 && tile.z === 1)?.rotation).toBe(0);
    expect(laid.find(({ tile }) => tile.x === 1 && tile.z === 2)?.rotation).toBe(1);
  });

  it('closes the corner outside a bend, where the path only touches it at a diagonal', () => {
    const laid = laidOn(['.....', '.====', '.=...', '.=...']);
    expect(keysOf(laid).has('0,0')).toBe(true);
  });

  it('leaves a corner open when one of its arms is missing', () => {
    const laid = laidOn(['=====', '=..##', '=#...', '=#...']);
    expect(keysOf(laid).has('1,1')).toBe(false);
  });

  it('builds a run of one material, hedge or stone, never both', () => {
    for (let index = 0; index < 20; index++) {
      const { ground, ring } = groundOf(['=====', '=....', '=....']);
      const rect = { x0: 0, x1: 9, z0: 0, z1: 9 };
      const { hedges, walls } = bordersFor(ring, ground, [
        ...Array.from({ length: index }, () => ({ x0: 99, x1: 99, z0: 99, z1: 99 })),
        rect,
      ]);
      expect(hedges.length === 0 || walls.length === 0).toBe(true);
    }
  });

  it('walls more districts in stone by the sea or up a hill than inland', () => {
    const share = (favoured: boolean): number => {
      let stone = 0;
      for (let index = 0; index < 200; index++) {
        const { ground, ring } = groundOf(['=====', '.....'], favoured);
        const districts = Array.from({ length: index + 1 }, (_, at) =>
          at === index ? { x0: 0, x1: 9, z0: 0, z1: 9 } : { x0: 99, x1: 99, z0: 99, z1: 99 },
        );
        if (bordersFor(ring, ground, districts).walls.length > 0) stone++;
      }
      return stone / 200;
    };
    expect(share(false)).toBeCloseTo(STONE_CHANCE.inland, 1);
    expect(share(true)).toBeCloseTo(STONE_CHANCE.favoured, 1);
  });

  it('plants nothing alone', () => {
    expect(laidOn(['===', '#.#'])).toEqual([]);
  });
});
