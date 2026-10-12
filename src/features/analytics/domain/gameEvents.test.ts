import { describe, expect, it } from 'vitest';
import { playedOf, startedOf } from './gameEvents';

const facts = {
  stats: {
    backend: 'webgpu' as const,
    objectCount: 40,
    pathCount: 120,
    rating: 3.5,
    startupMs: 2_345.6,
    guests: { present: 30 },
    staff: { total: 4 },
  },
  ledger: { mode: 'tycoon' as const, balance: 1_234.5 },
  land: { owned: 9 },
  status: { day: 6 },
};

const before = { stats: null, ledger: null, land: null, status: null };

describe('startedOf', () => {
  it('tells where the game came from and how big its plot is', () => {
    expect(startedOf('new', facts, { tilesX: 48, tilesZ: 32, density: 0.5, seed: 1 })).toEqual({
      name: 'game_started',
      source: 'new',
      renderer: 'webgpu',
      mode: 'tycoon',
      tiles: 1_536,
    });
  });

  it('leaves out what is not known yet', () => {
    expect(startedOf('save', before, null)).toEqual({ name: 'game_started', source: 'save' });
  });
});

describe('playedOf', () => {
  it('sums up the resort as it stands', () => {
    expect(playedOf(facts, 60_000.4)).toEqual({
      name: 'played',
      visibleMs: 60_000,
      renderer: 'webgpu',
      mode: 'tycoon',
      objects: 40,
      paths: 120,
      guests: 30,
      staff: 4,
      rating: 3.5,
      startupMs: 2_346,
      balance: 1_235,
      land: 9,
      day: 6,
    });
  });

  it('sends no balance for a sandbox, where money means nothing', () => {
    const sandbox = { ...facts, ledger: { mode: 'sandbox' as const, balance: 0 } };
    expect(playedOf(sandbox, 1_000)).not.toHaveProperty('balance');
  });

  it('sends only the time for a visit that never got past the welcome screen', () => {
    expect(playedOf(before, 8_000)).toEqual({ name: 'played', visibleMs: 8_000 });
  });
});
