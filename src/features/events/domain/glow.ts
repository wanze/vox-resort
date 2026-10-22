// Slow enough that an evening's lift is still there at the next morning's rating.
export const GLOW_FADE_PER_HOUR = 0.005;

// Towards nothing from either side, so a let-down wears off over the day as a lift does.
export function fadeGlow(glow: Float32Array, hours: number): void {
  const fade = GLOW_FADE_PER_HOUR * hours;
  if (!(fade > 0)) return;
  for (let person = 0; person < glow.length; person++) {
    const left = glow[person]!;
    glow[person] = left > fade ? left - fade : left < -fade ? left + fade : 0;
  }
}

// The larger of the two, so two shows in one evening do not stack past the better one.
export function glowOn(glow: Float32Array, person: number, amount: number): void {
  if (person < 0 || person >= glow.length) return;
  if (amount > glow[person]!) glow[person] = amount;
}

// Off whatever lift is there, but never below the one let-down: two shows called off in an
// evening disappoint as much as the worse of them.
export function dimGlow(glow: Float32Array, person: number, amount: number): void {
  if (person < 0 || person >= glow.length) return;
  const now = glow[person]!;
  glow[person] = Math.min(now, Math.max(now - amount, -amount));
}
