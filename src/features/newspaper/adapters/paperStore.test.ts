import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSeason, startTally } from '../../sim/domain/season';
import { editionOf, type Edition } from '../domain/edition';

const edition = (gameId: string, season = 1): Edition =>
  editionOf({
    gameId,
    printedOn: 30,
    resortName: 'Coral Cove',
    mode: 'tycoon',
    seasons: [
      closeSeason(
        startTally(),
        { number: season, startedOn: (season - 1) * 30, state: 'break' },
        0,
      ),
    ],
    reviews: [],
    photo: null,
  })!;

const store = () => import('./paperStore');

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('paperStore', () => {
  it('lists the editions printed for a game only', async () => {
    const { listEditions, printEdition } = await store();
    await printEdition(edition('g1'), null);
    expect(await listEditions('g1')).toEqual([edition('g1')]);
    expect(await listEditions('g2')).toEqual([]);
  });

  it('sweeps the games not kept and leaves the kept ones', async () => {
    const { listEditions, printEdition, sweep } = await store();
    await printEdition(edition('g1'), null);
    await printEdition(edition('g2'), null);
    await sweep(new Set(['g1']));
    expect(await listEditions('g1')).toEqual([edition('g1')]);
    expect(await listEditions('g2')).toEqual([]);
  });

  it('sweeps everything when nothing is kept', async () => {
    const { listEditions, printEdition, sweep } = await store();
    await printEdition(edition('g1'), null);
    await printEdition(edition('g2'), null);
    await sweep(new Set());
    expect(await listEditions('g1')).toEqual([]);
    expect(await listEditions('g2')).toEqual([]);
  });

  it('copies a game under a new id and keeps the original', async () => {
    const { copyGame, listEditions, printEdition } = await store();
    await printEdition(edition('g1'), null);
    await copyGame('g1', 'g3');
    expect(await listEditions('g3')).toEqual([edition('g3')]);
    expect(await listEditions('g1')).toEqual([edition('g1')]);
  });
});
