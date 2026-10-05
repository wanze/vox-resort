// By the clock rather than by who is in bed: guests reach their beds after sunset, and parasols
// furled in the dark were never seen to close. The beach staff close them in the evening light.
const FURL_HOURS = { from: 18.5, to: 20 } as const;
const OPEN_HOURS = { from: 7.5, to: 9 } as const;

const rampBetween = (hour: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (hour - from) / (to - from)));

// The share of parasols furled at a time of day (0..1); each parasol closes at its own share.
export function furledShareAt(time: number): number {
  const hour = (((time % 1) + 1) % 1) * 24;
  if (hour < OPEN_HOURS.to) return 1 - rampBetween(hour, OPEN_HOURS.from, OPEN_HOURS.to);
  return rampBetween(hour, FURL_HOURS.from, FURL_HOURS.to);
}
