import { describe, expect, it } from 'vitest';
import type { Placement } from '../../layout/domain/resortLayout';
import { createRailIndex } from './railIndex';

const rail = (key: string, tileX: number, tileZ: number): Placement => ({
  key,
  id: 'railing',
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x: tileX * 16,
  z: tileZ * 16,
  y: 0,
  width: 16,
  depth: 2,
});

const keysOf = (rails: readonly Placement[]) => rails.map((standing) => standing.key);

describe('createRailIndex', () => {
  it('finds nothing on any tile of an empty plot', () => {
    const index = createRailIndex([]);
    expect(index.at(0, 0)).toEqual([]);
    expect(index.at(-3, 7)).toEqual([]);
  });

  it('finds exactly the rails on a tile, and nothing from its neighbours', () => {
    const index = createRailIndex([rail('a', 1, 1), rail('b', 2, 1), rail('c', 1, 2)]);
    expect(keysOf(index.at(1, 1))).toEqual(['a']);
    expect(keysOf(index.at(2, 1))).toEqual(['b']);
    expect(index.at(0, 1)).toEqual([]);
  });

  it('finds every rail on a tile that carries more than one', () => {
    const index = createRailIndex([rail('west', 4, 4), rail('east', 4, 4)]);
    expect(keysOf(index.at(4, 4))).toEqual(['west', 'east']);
  });

  it('makes an added rail findable on its tile, and lists it on the plot', () => {
    const rails: Placement[] = [];
    const index = createRailIndex(rails);
    index.add(rail('a', 3, 5));
    expect(keysOf(index.at(3, 5))).toEqual(['a']);
    expect(keysOf(rails)).toEqual(['a']);
  });

  it('takes a removed rail off its tile and off the plot', () => {
    const rails = [rail('a', 3, 5), rail('b', 3, 6)];
    const index = createRailIndex(rails);
    expect(index.remove(rail('a', 3, 5))).toBe(true);
    expect(index.at(3, 5)).toEqual([]);
    expect(keysOf(rails)).toEqual(['b']);
  });

  it('says so when no rail stood under a key, and changes nothing', () => {
    const rails = [rail('a', 3, 5)];
    const index = createRailIndex(rails);
    expect(index.remove(rail('nobody', 3, 5))).toBe(false);
    expect(keysOf(index.at(3, 5))).toEqual(['a']);
    expect(keysOf(rails)).toEqual(['a']);
  });

  it('keeps nothing extra for a rail re-stood over and over', () => {
    const rails = [rail('keep', 0, 0)];
    const index = createRailIndex(rails);
    for (let pass = 0; pass < 5; pass++) {
      index.add(rail('edge', 1, 0));
      index.remove(rail('edge', 1, 0));
    }
    expect(index.at(1, 0)).toEqual([]);
    expect(keysOf(rails)).toEqual(['keep']);
  });

  it('answers empty for a tile once its last rail has come down', () => {
    const index = createRailIndex([rail('west', 4, 4), rail('east', 4, 4)]);
    index.remove(rail('west', 4, 4));
    expect(keysOf(index.at(4, 4))).toEqual(['east']);
    index.remove(rail('east', 4, 4));
    expect(index.at(4, 4)).toEqual([]);
  });

  it('can still find and remove the rail moved into a hole', () => {
    const rails = [rail('a', 0, 0), rail('b', 1, 0), rail('c', 2, 0)];
    const index = createRailIndex(rails);
    index.remove(rail('a', 0, 0));
    expect(keysOf(rails)).toEqual(['c', 'b']);
    expect(index.remove(rail('c', 2, 0))).toBe(true);
    expect(keysOf(rails)).toEqual(['b']);
    expect(index.remove(rail('b', 1, 0))).toBe(true);
    expect(rails).toEqual([]);
  });

  it('refuses to stand two rails under one key', () => {
    const index = createRailIndex([rail('a', 0, 0)]);
    expect(() => index.add(rail('a', 1, 0))).toThrow(/already stands/);
  });
});
