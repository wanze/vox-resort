import type { Weather } from '../../sim/domain/weather';

// Rain only freshens the sea; it takes a storm to whip it up.
const ROUGHNESS: { readonly [kind in Weather]: number } = {
  clear: 0,
  rain: 0.3,
  storm: 1,
  heatwave: 0,
};

// The wind getting up over a few seconds, so a change of weather does not snap the sea.
const SETTLE_SECONDS = 6;

export function roughnessOf(weather: Weather): number {
  return ROUGHNESS[weather];
}

export function roughenTowards(current: number, weather: Weather, dt: number): number {
  const share = 1 - Math.exp(-Math.max(dt, 0) / SETTLE_SECONDS);
  return current + (ROUGHNESS[weather] - current) * share;
}
