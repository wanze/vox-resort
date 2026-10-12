import { describe, expect, it } from 'vitest';
import { planSave, UNSAVED_ID, type ListedSave } from '../../saves/domain/saveSlots';
import type { SaveMeta } from '../../saves/domain/snapshot';
import { forksTo, keptGames } from './archive';

const save = (id: string, gameId?: string): SaveMeta => ({
  id,
  name: id,
  ...(gameId ? { gameId } : {}),
  savedAt: 1,
  version: 1,
  mode: 'tycoon',
  day: 3,
  balance: 0,
  stars: 3,
  guests: 0,
  tilesX: 4,
  tilesZ: 4,
});

describe('the games the archive keeps', () => {
  it('keeps every game a save names, and the one being played without a save', () => {
    const kept = keptGames([save('a', 'game-a'), save('b')], 'game-x')!;
    expect([...kept].toSorted()).toEqual(['game-a', 'game-x']);
    expect(keptGames([], 'game-x')).toEqual(new Set(['game-x']));
  });

  it('keeps everything while a save does not read', () => {
    const saves: readonly ListedSave[] = [save('a', 'game-a'), { id: 'b', unreadable: true }];
    expect(keptGames(saves, null)).toBeNull();
  });
});

describe('a fork', () => {
  const plan = (current: { id: string; name: string | null }, copy: boolean) => {
    const planned = planSave({
      current,
      saves: [save('cove', 'game-a')],
      asked: 'Copy',
      copy,
      overwrite: false,
      freshId: 'fresh',
    });
    if (planned.kind !== 'write') throw new Error(planned.kind);
    return forksTo(current, planned.target, copy);
  };

  it('copies the papers when a named save is saved as new', () => {
    expect(plan({ id: 'cove', name: 'cove' }, true)).toBe(true);
  });

  it('keeps one game when the unsaved game is named, or a save renamed', () => {
    expect(plan({ id: UNSAVED_ID, name: null }, true)).toBe(false);
    expect(plan({ id: 'cove', name: 'cove' }, false)).toBe(false);
    expect(forksTo(null, { id: 'fresh', name: 'Copy', drop: null }, true)).toBe(false);
  });
});
