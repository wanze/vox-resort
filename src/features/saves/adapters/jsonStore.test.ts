import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonStore } from './jsonStore';

const FALLBACK = { volume: 1 };

const parseVolume = (stored: unknown): { volume: number } => {
  const volume = (stored as { volume?: unknown }).volume;
  if (typeof volume !== 'number') throw new Error('no volume');
  return { volume };
};

function fakeStorage(entries: Record<string, string> = {}) {
  return {
    entries,
    getItem: (key: string): string | null => entries[key] ?? null,
    setItem: (key: string, value: string): void => {
      entries[key] = value;
    },
  };
}

const store = () => jsonStore('test:key', FALLBACK, parseVolume);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jsonStore', () => {
  it('gives the fallback for a missing key', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(store().load()).toBe(FALLBACK);
  });

  it('parses what is stored under the key', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'test:key': '{"volume":0.25}' }));
    expect(store().load()).toEqual({ volume: 0.25 });
  });

  it('gives the fallback when the parser refuses the value', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'test:key': '{"volume":"loud"}' }));
    expect(store().load()).toBe(FALLBACK);
  });

  it('gives the fallback for stored text that is not JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'test:key': '{volume' }));
    expect(store().load()).toBe(FALLBACK);
  });

  it('gives the fallback when storage itself throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(store().load()).toBe(FALLBACK);
  });

  it('saves the value as JSON under the key', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    store().save({ volume: 0.5 });
    expect(storage.entries['test:key']).toBe(JSON.stringify({ volume: 0.5 }));
  });

  it('does not throw when storage refuses the write', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => store().save({ volume: 0.5 })).not.toThrow();
  });
});
