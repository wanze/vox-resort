import { breakDown } from '../../sim/domain/breakdowns';
import { aged } from '../../sim/domain/condition';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { MOST_HITS_A_DAY, stormHitsAt } from '../../sim/domain/stormDamage';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import type { SimState } from './simState';

type StormState = Pick<
  SimState,
  | 'venues'
  | 'venueIndex'
  | 'lodgings'
  | 'shore'
  | 'ageing'
  | 'condition'
  | 'breakdowns'
  | 'renovating'
  | 'stormHits'
>;

export function recentStormHits(
  hits: ReadonlyMap<string, number>,
  now: number,
): ReadonlyMap<string, number> {
  return new Map([...hits].filter(([, at]) => now - at < TICKS_PER_DAY));
}

// Hourly. Scaffolding shields a building under renovation, and one hit today has had its storm.
// A hit that neither dents nor breaks anything is no hit, so the news never cries wolf.
export function batterTheShore(resort: StormState, clock: SimNow): void {
  if (clock.weather !== 'storm') return;
  const recent = recentStormHits(resort.stormHits, clock.ticks);
  const room = MOST_HITS_A_DAY - recent.size;
  if (room <= 0) return;
  const hits = stormHitsAt(
    [...resort.venues, ...resort.lodgings],
    resort.shore,
    Math.floor(clock.ticks / TICKS_PER_HOUR),
    room,
    (key) => recent.has(key) || resort.renovating.has(key),
  );
  const battered = new Map(recent);
  for (const { key, dent } of hits) {
    const venue = resort.venueIndex.get(key) ?? -1;
    const breakable = venue >= 0 && resort.venues[venue]?.reliability !== undefined;
    const broke = breakable && breakDown(resort.breakdowns, venue, clock.ticks);
    if (resort.ageing) resort.condition = aged(resort.condition, new Map([[key, dent]]));
    if (resort.ageing || broke) battered.set(key, clock.ticks);
  }
  resort.stormHits = battered;
}
