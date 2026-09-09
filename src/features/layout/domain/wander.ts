/**
 * A seeded meander: how far a line strung across the plot strays off straight.
 *
 * Two lines on this plot need one, and need the same one — the coast in
 * `shoreline.ts` and the terrace steps in `elevation.ts`. Both are described as
 * a function of a tile *column* rather than as a path, because both are read by
 * callers that walk columns and never see each other's, and a line that is a
 * function of `x` alone is the only kind two such callers can agree on to the
 * voxel.
 *
 * Deliberately not a random walk, for exactly that reason: a walk has to be
 * generated in order, and the renderer asks about columns the layout never
 * visits.
 */

/**
 * How far the line strays at `at`, in the same units as `amplitude`.
 *
 * Two sines rather than one, at wavelengths that do not divide each other, so
 * the line does not repeat within a plot. The phases come off the seed, so a
 * resort's coast and its terraces are as reproducible as the rest of it, and
 * `salt` is what keeps two lines on the same seed from being the same line.
 *
 * `at` may be fractional: the callers that place things round it to whole tiles,
 * and the callers that shade things want the curve underneath.
 */
export function meanderAt(seed: number, salt: number, at: number, amplitude: number): number {
  if (amplitude <= 0) return 0;
  const slow = Math.sin(at * 0.041 + phaseOf(seed, salt));
  const quick = Math.sin(at * 0.17 + phaseOf(seed, salt + 1));
  return (slow * 0.62 + quick * 0.38) * amplitude;
}

/**
 * One of a meander's phases, scattered rather than scaled off the seed.
 *
 * Seed 7 and seed 8 are neighbours as numbers and must not be neighbours as
 * coastlines: a phase taken as a fraction of the seed put the two within a
 * hundredth of a radian of each other, and both rounded to the same tiles.
 */
function phaseOf(seed: number, salt: number): number {
  const mixed = Math.sin(Math.trunc(seed) * 127.1 + salt * 311.7) * 43758.5453;
  return (mixed - Math.floor(mixed)) * Math.PI * 2;
}
