import { describe, expect, it } from 'vitest';
import { shoreFor } from '../../layout/domain/shoreline';
import { createBreakdowns, isBroken } from '../../sim/domain/breakdowns';
import { conditionOf } from '../../sim/domain/condition';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { MOST_HITS_A_DAY } from '../../sim/domain/stormDamage';
import type { Venue } from '../../sim/domain/venues';
import type { Weather } from '../../sim/domain/weather';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import { batterTheShore, recentStormHits } from './stormSteps';

// Water from z = 18.
const shore = shoreFor({
  tilesX: 60,
  tilesZ: 20,
  shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
})!;

const onTheEdge = (key: string, tileX: number, reliability?: number): Venue =>
  ({
    key,
    label: key,
    tileX,
    tileZ: 15,
    tilesX: 2,
    tilesZ: 3,
    ...(reliability === undefined ? {} : { reliability }),
  }) as Venue;

const venues = Array.from({ length: 20 }, (_, index) =>
  onTheEdge(`v${index}`, index * 3, index % 2 === 0 ? 40 : undefined),
);

function stateOf(ageing = true) {
  return {
    venues,
    venueIndex: new Map(venues.map((venue, index) => [venue.key, index])),
    lodgings: [],
    shore,
    ageing,
    condition: new Map<string, number>(),
    breakdowns: createBreakdowns(venues.length),
    renovating: new Map<string, number>(),
    stormHits: new Map<string, number>() as ReadonlyMap<string, number>,
  };
}

const at = (ticks: number, weather: Weather = 'storm'): SimNow => ({
  ticks,
  day: Math.floor(ticks / TICKS_PER_DAY),
  tickOfDay: ticks % TICKS_PER_DAY,
  weather,
  forcedWeather: null,
});

function stormFor(state: ReturnType<typeof stateOf>, hours: number, weather: Weather = 'storm') {
  for (let hour = 0; hour < hours; hour++)
    batterTheShore(state, at(hour * TICKS_PER_HOUR, weather));
}

describe('batterTheShore', () => {
  it('leaves the shore alone on any day but a storm', () => {
    const state = stateOf();
    for (const weather of ['clear', 'rain', 'heatwave'] as const) stormFor(state, 24 * 20, weather);
    expect(state.stormHits.size).toBe(0);
    expect(state.condition.size).toBe(0);
  });

  it('dents what it hits, and breaks what can break', () => {
    const state = stateOf();
    stormFor(state, 24);
    expect(state.stormHits.size).toBeGreaterThan(0);
    for (const key of state.stormHits.keys()) {
      expect(conditionOf(state.condition, key)).toBeLessThan(1);
      const venue = state.venueIndex.get(key)!;
      expect(isBroken(state.breakdowns, venue)).toBe(venues[venue]!.reliability !== undefined);
    }
  });

  it('batters no more than its share in a day, and hits nobody twice', () => {
    const state = stateOf();
    const lastHit = new Map<string, number>();
    for (let hour = 0; hour < 24 * 30; hour++) {
      const now = hour * TICKS_PER_HOUR;
      batterTheShore(state, at(now));
      expect(recentStormHits(state.stormHits, now).size).toBeLessThanOrEqual(MOST_HITS_A_DAY);
      for (const [key, tick] of state.stormHits) {
        const before = lastHit.get(key);
        if (before !== undefined && before !== tick) {
          expect(tick - before).toBeGreaterThanOrEqual(TICKS_PER_DAY);
        }
        lastHit.set(key, tick);
      }
    }
    expect(lastHit.size).toBeGreaterThan(MOST_HITS_A_DAY);
  });

  it('spares a building behind scaffolding', () => {
    const state = stateOf();
    state.renovating = new Map(venues.map((venue) => [venue.key, 1e9]));
    stormFor(state, 24 * 10);
    expect(state.stormHits.size).toBe(0);
  });

  it('only breaks things where nothing ages, and says so only for those', () => {
    const state = stateOf(false);
    stormFor(state, 24 * 10);
    expect(state.condition.size).toBe(0);
    for (const key of state.stormHits.keys()) {
      expect(venues[state.venueIndex.get(key)!]!.reliability).toBeDefined();
    }
  });
});

describe('recentStormHits', () => {
  it('forgets a hit after a day', () => {
    const hits = new Map([
      ['old', 0],
      ['new', TICKS_PER_DAY],
    ]);
    expect([...recentStormHits(hits, TICKS_PER_DAY + 5).keys()]).toEqual(['new']);
  });
});
