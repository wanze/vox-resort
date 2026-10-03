export interface DecodedCache {
  bufferOf(file: string): Promise<AudioBuffer | null>;
  // While a file plays it is never dropped, however long ago it started.
  hold(file: string, by: 1 | -1): void;
}

interface Decoded {
  promise: Promise<AudioBuffer | null>;
  bytes: number;
  playing: number;
}

// Decoded PCM is about ten times the MP3: the whole bank decoded would pass 200 MB.
const DECODED_BUDGET = 48 * 1024 * 1024;

const evictable = (entry: Decoded): boolean => entry.playing === 0 && entry.bytes > 0;

// Least recently used first: a Map keeps insertion order, and every use re-inserts.
function evict(entries: Map<string, Decoded>): void {
  let total = [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  for (const [file, entry] of entries) {
    if (total <= DECODED_BUDGET) return;
    if (!evictable(entry)) continue;
    entries.delete(file);
    total -= entry.bytes;
  }
}

async function decode(context: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

// Decoded on first use and shared by every later play, the fetch and the decode cached together.
export function createDecodedCache(
  context: BaseAudioContext,
  urls: ReadonlyMap<string, string>,
): DecodedCache {
  const entries = new Map<string, Decoded>();
  return {
    bufferOf(file) {
      const known = entries.get(file);
      if (known) {
        entries.delete(file);
        entries.set(file, known);
        return known.promise;
      }
      const entry: Decoded = { promise: Promise.resolve(null), bytes: 0, playing: 0 };
      entry.promise = decode(context, urls.get(file)!).then(
        (buffer) => {
          entry.bytes = buffer.length * buffer.numberOfChannels * 4;
          evict(entries);
          return buffer;
        },
        (cause: unknown) => {
          console.warn(`Sound: could not decode ${file}`, cause);
          return null;
        },
      );
      entries.set(file, entry);
      return entry.promise;
    },
    hold(file, by) {
      const entry = entries.get(file);
      if (entry) entry.playing += by;
    },
  };
}
