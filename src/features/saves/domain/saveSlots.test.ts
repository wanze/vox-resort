import { describe, expect, it } from 'vitest';
import {
  autosaveTarget,
  shownGame,
  afterNaming,
  afterRemoving,
  clashOf,
  cleanName,
  isReadable,
  latestOf,
  listedOf,
  listOrder,
  planSave,
  readableById,
  saveOrAsk,
  targetOf,
  UNSAVED_ID,
  withUnreadable,
  type ListedSave,
} from './saveSlots';
import type { SaveMeta } from './snapshot';

const meta = (id: string, name: string | null, savedAt: number): SaveMeta => ({
  id,
  name,
  savedAt,
  version: 1,
  mode: 'sandbox',
  day: 3,
  balance: 100,
  stars: 4,
  guests: 20,
  tilesX: 48,
  tilesZ: 48,
});

const broken: ListedSave = { id: 'broken', unreadable: true };
const SAVES: readonly ListedSave[] = [
  meta('a', 'Seaside', 10),
  broken,
  meta(UNSAVED_ID, null, 30),
  meta('b', 'Hilltop', 20),
];

const plan = (overrides: Partial<Parameters<typeof planSave>[0]>) =>
  planSave({
    current: null,
    saves: SAVES,
    asked: undefined,
    copy: false,
    overwrite: false,
    freshId: 'fresh',
    ...overrides,
  });

describe('save slots', () => {
  it('cleans a name, and refuses an empty or overlong one', () => {
    expect(cleanName('  Bay  ')).toBe('Bay');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(41))).toBeNull();
    expect(cleanName('x'.repeat(40))).toHaveLength(40);
  });

  it('lists the newest first and the unreadable last, and continues the newest', () => {
    expect(listOrder(SAVES).map((save) => save.id)).toEqual([UNSAVED_ID, 'b', 'a', 'broken']);
    expect(latestOf(SAVES)?.id).toBe(UNSAVED_ID);
    expect(latestOf([broken])).toBeNull();
    expect(isReadable(broken)).toBe(false);
  });

  it('finds a clash by name whatever the case, but not with the game itself', () => {
    expect(clashOf(SAVES, 'seaside', null)?.id).toBe('a');
    expect(clashOf(SAVES, 'Seaside', 'a')).toBeNull();
  });

  it('autosaves into the current slot, or the unsaved one', () => {
    expect(targetOf({ id: 'a', name: 'Seaside' })).toBe('a');
    expect(targetOf(null)).toBe(UNSAVED_ID);
    expect(autosaveTarget({ id: 'a', name: 'Seaside' })).toEqual({
      id: 'a',
      name: 'Seaside',
      drop: null,
    });
    expect(autosaveTarget(null)).toEqual({ id: UNSAVED_ID, name: null, drop: null });
  });

  it('shows no game and an unnamed one alike, with a blank name', () => {
    expect(shownGame(null)).toEqual({ id: null, name: '' });
    expect(shownGame({ id: UNSAVED_ID, name: null })).toEqual({ id: UNSAVED_ID, name: '' });
    expect(shownGame({ id: 'a', name: 'Cove' })).toEqual({ id: 'a', name: 'Cove' });
  });

  it('overwrites a named game, and asks for a name for an unnamed one', () => {
    expect(plan({ current: { id: 'a', name: 'Seaside' } })).toEqual({
      kind: 'write',
      target: { id: 'a', name: 'Seaside', drop: null },
    });
    expect(plan({ current: { id: UNSAVED_ID, name: null } })).toEqual({ kind: 'needs-name' });
    expect(plan({ asked: '  ' })).toEqual({ kind: 'bad-name' });
  });

  it('moves an unsaved game into a new named slot', () => {
    expect(plan({ current: { id: UNSAVED_ID, name: null }, asked: 'Cove' })).toEqual({
      kind: 'write',
      target: { id: 'fresh', name: 'Cove', drop: UNSAVED_ID },
    });
  });

  it('renames a named game in its own slot', () => {
    expect(plan({ current: { id: 'a', name: 'Seaside' }, asked: 'Cove' })).toEqual({
      kind: 'write',
      target: { id: 'a', name: 'Cove', drop: null },
    });
  });

  it('asks before taking a name another save has, and takes its slot once told to', () => {
    const current = { id: 'a', name: 'Seaside' };
    expect(plan({ current, asked: 'Hilltop' })).toMatchObject({ kind: 'clash', with: { id: 'b' } });
    expect(plan({ current, asked: 'Hilltop', overwrite: true })).toEqual({
      kind: 'write',
      target: { id: 'b', name: 'Hilltop', drop: 'a' },
    });
  });

  it('saves a copy beside the game it came from, but never beside the unsaved slot', () => {
    expect(plan({ current: { id: 'a', name: 'Seaside' }, asked: 'Cove', copy: true })).toEqual({
      kind: 'write',
      target: { id: 'fresh', name: 'Cove', drop: null },
    });
    expect(plan({ current: { id: UNSAVED_ID, name: null }, asked: 'Cove', copy: true })).toEqual({
      kind: 'write',
      target: { id: 'fresh', name: 'Cove', drop: UNSAVED_ID },
    });
  });

  it('leaves the game unnamed once its own slot is deleted', () => {
    expect(afterRemoving({ id: 'a', name: 'Seaside' }, 'a')).toEqual({
      id: UNSAVED_ID,
      name: null,
    });
    expect(afterRemoving({ id: 'a', name: 'Seaside' }, 'b')).toEqual({ id: 'a', name: 'Seaside' });
  });
});

describe('listedOf', () => {
  it('lists a readable save as it is', () => {
    expect(listedOf(meta('a', 'Seaside', 10))).toEqual(meta('a', 'Seaside', 10));
  });

  it('lists another version, or a broken record, as unreadable', () => {
    expect(listedOf({ ...meta('a', 'Seaside', 10), version: 2 })).toEqual({
      id: 'a',
      unreadable: true,
    });
    expect(listedOf({ id: 'b', name: 7 })).toEqual({ id: 'b', unreadable: true });
    expect(listedOf(null)).toEqual({ id: '', unreadable: true });
  });
});

describe('afterNaming', () => {
  it('follows the game into its named slot only if it was the one named', () => {
    const named = { id: 'fresh', name: 'Cove' };
    expect(afterNaming({ id: UNSAVED_ID, name: null }, UNSAVED_ID, named)).toBe(named);
    expect(afterNaming({ id: 'a', name: 'Seaside' }, UNSAVED_ID, named)).toEqual({
      id: 'a',
      name: 'Seaside',
    });
    expect(afterNaming(null, UNSAVED_ID, named)).toBeNull();
  });
});

describe('finding a save to load', () => {
  it('takes the latest, or one by id, but never an unreadable one', () => {
    expect(readableById(SAVES, 'latest')?.id).toBe(UNSAVED_ID);
    expect(readableById(SAVES, 'b')?.id).toBe('b');
    expect(readableById(SAVES, 'broken')).toBeNull();
    expect(readableById(SAVES, 'gone')).toBeNull();
  });

  it('lists a save whose snapshot failed to read as unreadable', () => {
    const listed = withUnreadable(SAVES, new Set(['b']));
    expect(listed.find((save) => save.id === 'b')).toEqual({ id: 'b', unreadable: true });
    expect(listed.filter(isReadable)).toHaveLength(2);
  });
});

describe('saveOrAsk', () => {
  it('asks for a name only when the game has none', async () => {
    let asked = 0;
    await saveOrAsk(
      async () => ({ kind: 'saved' }),
      () => asked++,
    );
    expect(asked).toBe(0);
    await saveOrAsk(
      async () => ({ kind: 'needs-name' }),
      () => asked++,
    );
    expect(asked).toBe(1);
  });
});
