import { breakDown } from '../../sim/domain/breakdowns';
import { aged } from '../../sim/domain/condition';
import { flotsamOn, strandOf } from '../../sim/domain/flotsam';
import { washUp } from '../../sim/domain/litter';
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
  | 'constructing'
  | 'stormHits'
>;

export function recentStormHits(
  hits: ReadonlyMap<string, number>,
  now: number,
): ReadonlyMap<string, number> {
  return new Map([...hits].filter(([, at]) => now - at < TICKS_PER_DAY));
}

// Hourly. Scaffolding shields a building under renovation or going up, and one hit today has had
// its storm.
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
    (key) => recent.has(key) || resort.renovating.has(key) || resort.constructing.has(key),
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

type FlotsamState = Pick<
  SimState,
  'washUpDue' | 'shore' | 'litter' | 'crowd' | 'venues' | 'lodgings'
>;

const standsOn = (
  places: readonly { tileX: number; tileZ: number; tilesX: number; tilesZ: number }[],
  tileX: number,
  tileZ: number,
): boolean =>
  places.some(
    (place) =>
      tileX >= place.tileX &&
      tileX < place.tileX + place.tilesX &&
      tileZ >= place.tileZ &&
      tileZ < place.tileZ + place.tilesZ,
  );

// Hourly: the first hour the storm has passed, the sea leaves its tideline for the cleaners.
export function washUpAfterStorm(resort: FlotsamState, clock: SimNow): void {
  if (clock.weather === 'storm') {
    resort.washUpDue = true;
    return;
  }
  if (!resort.washUpDue) return;
  resort.washUpDue = false;
  const span = resort.crowd.crowd.network.beach?.span;
  if (!span) return;
  const buildings = [...resort.venues, ...resort.lodgings];
  const strand = strandOf(resort.shore, span);
  for (const { tileX, tileZ, pieces } of flotsamOn(
    strand,
    clock.day,
    (x, z) => !standsOn(buildings, x, z),
  )) {
    washUp(resort.litter, tileX, tileZ, pieces);
  }
}
