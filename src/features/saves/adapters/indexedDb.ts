// IndexedDB is missing in some embedded browsers and refuses to open in a private window or with
// site data blocked, as localStorage throws for jsonStore.ts. The failure is kept, so every call
// after it rejects alike and the game plays on without what the database would have kept.
export function openedOnce(
  name: string,
  upgrade: (db: IDBDatabase) => void,
  unavailable: (cause: unknown) => Error,
): () => Promise<IDBDatabase> {
  let opened: Promise<IDBDatabase> | null = null;
  return () => {
    opened ??= openDatabase(name, upgrade, unavailable);
    return opened;
  };
}

function openDatabase(
  name: string,
  upgrade: (db: IDBDatabase) => void,
  unavailable: (cause: unknown) => Error,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = globalThis.indexedDB.open(name, 1);
      request.addEventListener('upgradeneeded', () => upgrade(request.result));
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(unavailable(request.error)));
    } catch (error) {
      reject(unavailable(error));
    }
  });
}

export function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('The write was abandoned')),
    );
  });
}

export function answer<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}
