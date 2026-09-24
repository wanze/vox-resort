// On its own rather than in resortGenerator.ts, so drawing a number does not pull
// the whole plot in behind it.

// Mulberry32.
export function createRandom(seed: number): () => number {
  let state = (seed + 0x6d2b79f5) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}
