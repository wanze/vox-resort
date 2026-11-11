import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSnapshot, SaveMeta } from '../domain/snapshot';

const meta = (id: string, name: string | null = null): SaveMeta => ({
  id,
  name,
  savedAt: 1,
  version: 1,
  mode: 'sandbox',
  day: 0,
  balance: 0,
  stars: 0,
  guests: 0,
  tilesX: 4,
  tilesZ: 4,
});

const snapshot = (marker: string): GameSnapshot => ({ marker }) as unknown as GameSnapshot;

const store = () => import('./saveStore');

function rawSnapshot(id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('vox-resort');
    open.addEventListener('error', () => reject(open.error));
    open.addEventListener('success', () => {
      const db = open.result;
      const get = db.transaction('snapshots').objectStore('snapshots').get(id);
      get.addEventListener('error', () => reject(get.error));
      get.addEventListener('success', () => {
        db.close();
        resolve(get.result);
      });
    });
  });
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saveStore', () => {
  it('lists a written save as readable', async () => {
    const { listSaves, writeSave } = await store();
    await writeSave(meta('a'), snapshot('a'));
    const saves = await listSaves();
    expect(saves.map((save) => save.id)).toEqual(['a']);
    expect('unreadable' in saves[0]!).toBe(false);
  });

  it('drops the slot a game leaves behind in the same write', async () => {
    const { listSaves, writeSave } = await store();
    await writeSave(meta('a'), snapshot('a'));
    await writeSave(meta('b'), snapshot('b'), 'a');
    expect((await listSaves()).map((save) => save.id)).toEqual(['b']);
    expect(await rawSnapshot('a')).toBeUndefined();
  });

  it('moves a save into a new slot with its snapshot', async () => {
    const { listSaves, moveSave, writeSave } = await store();
    await writeSave(meta('a'), snapshot('a'));
    await moveSave('a', meta('c', 'Named'));
    const saves = await listSaves();
    expect(saves).toEqual([meta('c', 'Named')]);
    expect(await rawSnapshot('c')).toEqual({ id: 'c', snapshot: { marker: 'a' } });
    expect(await rawSnapshot('a')).toBeUndefined();
  });

  it('refuses to move a save that is not there and changes nothing', async () => {
    const { listSaves, moveSave, writeSave } = await store();
    await writeSave(meta('a'), snapshot('a'));
    await expect(moveSave('missing', meta('d'))).rejects.toBeDefined();
    expect((await listSaves()).map((save) => save.id)).toEqual(['a']);
  });

  it('removes both rows of a save', async () => {
    const { listSaves, removeSave, writeSave } = await store();
    await writeSave(meta('a'), snapshot('a'));
    await removeSave('a');
    expect(await listSaves()).toEqual([]);
    expect(await rawSnapshot('a')).toBeUndefined();
  });

  it('warns with the issues when a stored snapshot does not read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { readSave, writeSave } = await store();
    await writeSave(meta('a'), snapshot('a'));
    expect(await readSave('a')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reads a missing save as null without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { readSave } = await store();
    expect(await readSave('nope')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
