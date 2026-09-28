// On its own rather than in resortGenerator.ts, so drawing a number does not pull
// the whole plot in behind it.

export interface Random {
  (): number;
  state(): number;
}

// Mulberry32.
export function resumeRandom(state: number): Random {
  let current = state | 0;
  const random = () => {
    current = (current + 0x6d2b79f5) | 0;
    let drawn = Math.imul(current ^ (current >>> 15), 1 | current);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(random, { state: () => current });
}

export function createRandom(seed: number): Random {
  return resumeRandom((seed + 0x6d2b79f5) | 0);
}
