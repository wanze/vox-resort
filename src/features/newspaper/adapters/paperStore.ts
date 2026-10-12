import { z } from 'zod';
import {
  editionPhotoSchema,
  editionSchema,
  type Edition,
  type EditionPhoto,
} from '../domain/edition';
import { answer, done, openedOnce } from '../../saves/adapters/indexedDb';

// Its own database, so the archive can never cost a save: no migration, no shared transaction.
const DATABASE = 'vox-resort-papers';
const EDITIONS = 'editions';
const PENDING = 'pending';
const BY_GAME = 'gameId';

class PapersUnavailable extends Error {
  constructor(cause: unknown) {
    super('The newspaper archive is not available in this browser', { cause });
    this.name = 'PapersUnavailable';
  }
}

export interface PendingPhoto {
  readonly gameId: string;
  readonly season: number;
  readonly photo: Blob;
  readonly origin: EditionPhoto;
}

export interface StoredEdition {
  readonly edition: Edition;
  readonly photo: Blob | null;
}

const blob = z.instanceof(Blob);

const pendingSchema = z.object({
  gameId: z.string(),
  season: z.number().int().positive(),
  photo: blob,
  origin: editionPhotoSchema,
});

const editionRowSchema = z.object({
  gameId: z.string(),
  season: z.number().int().positive(),
  edition: editionSchema,
  photo: blob.nullable(),
});

const database = openedOnce(
  DATABASE,
  (db) => {
    db.createObjectStore(EDITIONS, { keyPath: ['gameId', 'season'] }).createIndex(
      BY_GAME,
      'gameId',
    );
    db.createObjectStore(PENDING, { keyPath: 'gameId' });
  },
  (cause) => new PapersUnavailable(cause),
);

export async function keepPending(pending: PendingPhoto): Promise<void> {
  const db = await database();
  const transaction = db.transaction(PENDING, 'readwrite');
  transaction.objectStore(PENDING).put(pending);
  await done(transaction);
}

export async function readPending(gameId: string): Promise<PendingPhoto | null> {
  const db = await database();
  const row: unknown = await answer(db.transaction(PENDING).objectStore(PENDING).get(gameId));
  const parsed = pendingSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

// One transaction, so the pending photo is never lost before its edition is kept.
export async function printEdition(edition: Edition, photo: Blob | null): Promise<void> {
  const db = await database();
  const transaction = db.transaction([EDITIONS, PENDING], 'readwrite');
  const { gameId, season } = edition;
  transaction.objectStore(EDITIONS).put({ gameId, season, edition, photo });
  transaction.objectStore(PENDING).delete(gameId);
  await done(transaction);
}

export async function readEdition(gameId: string, season: number): Promise<StoredEdition | null> {
  const db = await database();
  const row: unknown = await answer(
    db.transaction(EDITIONS).objectStore(EDITIONS).get([gameId, season]),
  );
  const parsed = editionRowSchema.safeParse(row);
  return parsed.success ? { edition: parsed.data.edition, photo: parsed.data.photo } : null;
}

// Oldest first. A stored blob reads as a handle to a file, so the photos are not loaded here.
export async function listEditions(gameId: string): Promise<readonly Edition[]> {
  const db = await database();
  const index = db.transaction(EDITIONS).objectStore(EDITIONS).index(BY_GAME);
  const rows: readonly unknown[] = await answer(index.getAll(gameId));
  return rows
    .flatMap((row) => {
      const parsed = editionRowSchema.safeParse(row);
      return parsed.success ? [parsed.data.edition] : [];
    })
    .toSorted((a, b) => a.season - b.season);
}

// A save kept under a new name takes the archive with it, so the two games never share a season.
export async function copyGame(from: string, to: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction([EDITIONS, PENDING], 'readwrite');
  const editions = transaction.objectStore(EDITIONS);
  const pending = transaction.objectStore(PENDING);
  const read = editions.index(BY_GAME).getAll(from);
  read.addEventListener('success', () => {
    for (const row of read.result as { edition: Edition }[]) {
      editions.put({ ...row, gameId: to, edition: { ...row.edition, gameId: to } });
    }
  });
  const waiting = pending.get(from);
  waiting.addEventListener('success', () => {
    const row = waiting.result as PendingPhoto | undefined;
    if (row) pending.put({ ...row, gameId: to });
  });
  await done(transaction);
}

// Every game not kept goes, with its pending photo; a row naming no game is unreadable anyway.
export async function sweep(keep: ReadonlySet<string>): Promise<void> {
  const db = await database();
  const transaction = db.transaction([EDITIONS, PENDING], 'readwrite');
  for (const name of [EDITIONS, PENDING]) {
    const cursor = transaction.objectStore(name).openCursor();
    cursor.addEventListener('success', () => {
      const at = cursor.result;
      if (!at) return;
      if (!keep.has(String((at.value as { gameId?: unknown }).gameId))) at.delete();
      at.continue();
    });
  }
  await done(transaction);
}
