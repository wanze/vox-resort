// Storage throws in a private window or with site data blocked; the value is then just not kept.
export function jsonStore<T>(key: string, fallback: T, parse: (stored: unknown) => T) {
  return {
    load(): T {
      try {
        const stored = globalThis.localStorage.getItem(key);
        return stored === null ? fallback : parse(JSON.parse(stored));
      } catch {
        return fallback;
      }
    },
    save(value: T): void {
      try {
        globalThis.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Same as above: an unsaved setting only costs the player a click next time.
      }
    },
  };
}
