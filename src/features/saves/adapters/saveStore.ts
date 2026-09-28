import { listedOf, type ListedSave } from '../domain/saveSlots';
import { gameSnapshotSchema, type GameSnapshot, type SaveMeta } from '../domain/snapshot';

const DATABASE = 'vox-resort';
const META = 'meta';
const SNAPSHOTS = 'snapshots';

export class SavesUnavailable extends Error {
  constructor(cause: unknown) {
    super('Saving is not available in this browser', { cause });
    this.name = 'SavesUnavailable';
  }
}

interface SnapshotRow {
  readonly id: string;
  readonly snapshot: unknown;
}

// IndexedDB is missing in some embedded browsers and refuses to open in a private window or with
// site data blocked, as localStorage throws for layoutStore.ts. The failure is kept, so every call
// after it rejects alike and the game plays on unsaved.
let opened: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opened ??= openDatabase();
  return opened;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = globalThis.indexedDB.open(DATABASE, 1);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore(META, { keyPath: 'id' });
        request.result.createObjectStore(SNAPSHOTS, { keyPath: 'id' });
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(new SavesUnavailable(request.error)));
    } catch (error) {
      reject(new SavesUnavailable(error));
    }
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('The save was abandoned')),
    );
  });
}

function answer<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

export async function listSaves(): Promise<readonly ListedSave[]> {
  const db = await database();
  const rows = await answer(db.transaction(META).objectStore(META).getAll());
  return rows.map(listedOf);
}

export async function readSave(id: string): Promise<GameSnapshot | null> {
  const db = await database();
  const row = (await answer(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(id))) as
    | SnapshotRow
    | undefined;
  const parsed = gameSnapshotSchema.safeParse(row?.snapshot);
  return parsed.success ? parsed.data : null;
}

// One transaction, so a game moving into a named slot is never in both or in neither.
export async function writeSave(
  meta: SaveMeta,
  snapshot: GameSnapshot,
  drop: string | null = null,
): Promise<void> {
  const db = await database();
  const transaction = db.transaction([META, SNAPSHOTS], 'readwrite');
  if (drop !== null && drop !== meta.id) forget(transaction, drop);
  transaction.objectStore(META).put(meta);
  transaction.objectStore(SNAPSHOTS).put({ id: meta.id, snapshot } satisfies SnapshotRow);
  await done(transaction);
}

// Chained on the read's callback rather than awaited: a transaction closes once it has nothing
// left to do, and an await can hand control back before the write is queued.
export async function moveSave(from: string, meta: SaveMeta): Promise<void> {
  const db = await database();
  const transaction = db.transaction([META, SNAPSHOTS], 'readwrite');
  const read = transaction.objectStore(SNAPSHOTS).get(from);
  read.addEventListener('success', () => {
    const row = read.result as SnapshotRow | undefined;
    if (!row) return transaction.abort();
    forget(transaction, from);
    transaction.objectStore(META).put(meta);
    transaction.objectStore(SNAPSHOTS).put({ id: meta.id, snapshot: row.snapshot });
  });
  await done(transaction);
}

export async function removeSave(id: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction([META, SNAPSHOTS], 'readwrite');
  forget(transaction, id);
  await done(transaction);
}

function forget(transaction: IDBTransaction, id: string): void {
  transaction.objectStore(META).delete(id);
  transaction.objectStore(SNAPSHOTS).delete(id);
}
