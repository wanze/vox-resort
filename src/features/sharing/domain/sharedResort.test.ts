import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '../../saves/domain/snapshot';
import { sharedOf, summaryOf } from './sharedResort';

const PLACED = { tileX: 0, tileZ: 0, tilesX: 1, tilesZ: 1, rotation: 0 as const };
const one = (id: string, tileX: number) => ({
  ...PLACED,
  key: `${id}@${tileX},0`,
  id,
  tileX,
  x: tileX * 16,
  z: 0,
  y: 0,
  width: 16,
  depth: 16,
});

const WORLD = {
  tilesX: 48,
  tilesZ: 40,
  shore: null,
  elevation: null,
  terrain: [],
  placements: [one('resort-bar-b', 0), one('snack-bar-b', 4)],
  props: [one('hedge', 8)],
  paths: [one('path', 9), one('path', 10)],
  rails: [one('ramp-head-railing-left', 9)],
};

// Only the parts sharedOf reads are real; the sim state stands in as markers it must not carry.
const GAME = {
  version: 1,
  world: WORLD,
  params: { tilesX: 48, tilesZ: 40, density: 0.6, seed: 5 },
  name: 'Coral Cove',
  population: 12,
  resort: { names: [['resort-bar-b@0,0', 'Sunset Tavern']], ledger: 'kept' },
  clock: 'kept',
  camera: 'kept',
} as unknown as GameSnapshot;

describe('sharedOf', () => {
  it('keeps the layout, params and names, and nothing of the game', () => {
    const shared = sharedOf(GAME);
    expect(Object.keys(shared).toSorted()).toEqual(['name', 'names', 'params', 'world']);
    expect(shared).toEqual({
      world: WORLD,
      params: GAME.params,
      name: 'Coral Cove',
      names: [['resort-bar-b@0,0', 'Sunset Tavern']],
    });
  });

  it('names a resort saved before names by its seed', () => {
    const { name: _, ...unnamed } = GAME;
    expect(sharedOf(unnamed as GameSnapshot).name).not.toBe('');
  });
});

describe('summaryOf', () => {
  it('counts buildings, not props, paths or rails', () => {
    expect(summaryOf(sharedOf(GAME))).toEqual({
      name: 'Coral Cove',
      tilesX: 48,
      tilesZ: 40,
      buildings: 2,
    });
  });
});
