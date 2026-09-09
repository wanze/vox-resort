/**
 * The seeded generator everything reproducible draws from.
 *
 * Two things now need one and they need it for the same reason. A generated
 * resort has to be reproducible — a seed is the whole plot, small enough to put
 * in the HUD and to paste into a bug report. And a crowd has to be reproducible
 * because `pnpm bench` only compares one run with the one before it if the scene
 * has not moved, and people wandering off `Math.random` are a scene that moves.
 *
 * It lives on its own rather than in `resortGenerator.ts` because that module is
 * the plot's layout and this is arithmetic — and because importing a layout
 * generator to draw a number pulls the whole plot in behind it.
 */

/**
 * Mulberry32: a small, fast, well-distributed 32-bit generator.
 *
 * The same seed always gives the same run, and two neighbouring seeds give
 * unrelated ones.
 */
export function createRandom(seed: number): () => number {
  let state = (seed + 0x6d2b79f5) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}
