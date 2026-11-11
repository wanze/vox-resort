import { afterEach, describe, expect, it, vi } from 'vitest';
import { openedOnce } from './indexedDb';

type FakeDb = EventTarget & { closed: boolean; close(): void };

function fakeIndexedDb() {
  const opened: FakeDb[] = [];
  let fail = false;
  const open = vi.fn(() => {
    const request = new EventTarget() as EventTarget & { result: unknown; error: unknown };
    const db: FakeDb = Object.assign(new EventTarget(), {
      closed: false,
      close() {
        db.closed = true;
      },
    });
    request.result = db;
    request.error = new Error('refused');
    queueMicrotask(() => {
      if (fail) request.dispatchEvent(new Event('error'));
      else {
        opened.push(db);
        request.dispatchEvent(new Event('success'));
      }
    });
    return request;
  });
  return {
    open,
    opened,
    setFail: (next: boolean) => {
      fail = next;
    },
  };
}

class Unavailable extends Error {}

function install() {
  const fake = fakeIndexedDb();
  vi.stubGlobal('indexedDB', { open: fake.open });
  const database = openedOnce(
    'test',
    () => {},
    (cause) => new Unavailable('unavailable', { cause }),
  );
  return { fake, database };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openedOnce', () => {
  it('opens the database once for every call', async () => {
    const { fake, database } = install();
    const first = database();
    expect(database()).toBe(first);
    await first;
    expect(fake.open).toHaveBeenCalledTimes(1);
  });

  it('opens afresh after the browser closes the connection', async () => {
    const { fake, database } = install();
    const first = await database();
    first.dispatchEvent(new Event('close'));
    const second = await database();
    expect(fake.open).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('closes and reopens when another tab wants a new version', async () => {
    const { fake, database } = install();
    await database();
    fake.opened[0]!.dispatchEvent(new Event('versionchange'));
    expect(fake.opened[0]!.closed).toBe(true);
    await database();
    expect(fake.open).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed open, so every call rejects alike', async () => {
    const { fake, database } = install();
    fake.setFail(true);
    await expect(database()).rejects.toBeInstanceOf(Unavailable);
    await expect(database()).rejects.toBeInstanceOf(Unavailable);
    expect(fake.open).toHaveBeenCalledTimes(1);
  });
});
