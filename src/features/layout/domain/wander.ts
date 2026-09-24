// A function of x rather than a random walk: callers walk columns independently,
// and the renderer asks about columns the layout never visits.

// Two sines at wavelengths that do not divide each other, so the line does not repeat within a
// plot.
export function meanderAt(seed: number, salt: number, at: number, amplitude: number): number {
  if (amplitude <= 0) return 0;
  const slow = Math.sin(at * 0.041 + phaseOf(seed, salt));
  const quick = Math.sin(at * 0.17 + phaseOf(seed, salt + 1));
  return (slow * 0.62 + quick * 0.38) * amplitude;
}

// Scattered rather than scaled: neighbouring seeds must not give neighbouring coastlines.
function phaseOf(seed: number, salt: number): number {
  const mixed = Math.sin(Math.trunc(seed) * 127.1 + salt * 311.7) * 43758.5453;
  return (mixed - Math.floor(mixed)) * Math.PI * 2;
}
