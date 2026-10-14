import type { NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import { mix, unitAt } from '../../random/domain/hash';
import { TICKS_PER_DAY } from './simClock';

// A tick is a simulated minute.
const TICKS_PER_HOUR = 60;

// Spread per party so six hundred people do not turn at once. Most walk home after sunset
// (21:30), past the lamps, and are in bed before the night-out crowd leaves at 23:00.
const BEDTIME_HOUR = 21;
const BEDTIME_SPREAD_HOURS = 2;
// Up at five for the sunrise, so in bed by ten.
const EARLY_BEDTIME_HOUR = 20;
const WAKE_HOUR = 7;
const WAKE_SPREAD_HOURS = 2;

// One party in ten: a few figures on the sand at dawn, few enough that the early morning is still
// the staff's. Up an hour before the sun (06:00) to walk to the beach in the half-light.
const EARLY_SHARE = 0.1;
export const EARLY_WAKE_FROM = 5 * TICKS_PER_HOUR;
const EARLY_SPREAD = 30;

// Its own seed, so rising early says nothing about the usual bedtime or a night out.
const EARLY_SEED = 0x5e1f_0a3d;

// Energy is filled completely because nothing else on the plot restores it.
export const NIGHT_RELIEF: readonly NeedRelief[] = [
  { need: 'energy', amount: 1 },
  { need: 'hygiene', amount: 0.5 },
];

// A hash rather than a draw: a draw from a seeded stream would move every seeded scene after it.
export const isEarlyRiser = (party: number): boolean => unitAt(EARLY_SEED, party) < EARLY_SHARE;

// Derived from a hash of the party index rather than stored, so a save holds nothing
// and two runs of the same plot agree.
export function bedtimeOf(party: number): { readonly sleepAt: number; readonly wakeAt: number } {
  const sleepHash = mix(party * 2 + 1);
  const wakeHash = mix(party * 2 + 2);
  const early = isEarlyRiser(party);
  const sleepAt =
    ((early ? EARLY_BEDTIME_HOUR : BEDTIME_HOUR) * TICKS_PER_HOUR +
      (sleepHash % (BEDTIME_SPREAD_HOURS * TICKS_PER_HOUR))) %
    TICKS_PER_DAY;
  const wakeAt = early
    ? EARLY_WAKE_FROM + (wakeHash % EARLY_SPREAD)
    : (WAKE_HOUR * TICKS_PER_HOUR + (wakeHash % (WAKE_SPREAD_HOURS * TICKS_PER_HOUR))) %
      TICKS_PER_DAY;
  return { sleepAt, wakeAt };
}

// Applied after NIGHT_RELIEF, which fills energy to 1: a party kept up past ten by an event
// wakes the worse for it.
export const LATE_NIGHT_RELIEF: readonly NeedRelief[] = [{ need: 'energy', amount: -0.3 }];

// The window can wrap past midnight. A party up late for an event is never in bed.
export function isBedtime(party: number, tickOfDay: number, upLate = false): boolean {
  if (upLate) return false;
  const { sleepAt, wakeAt } = bedtimeOf(party);
  const tick = ((tickOfDay % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (sleepAt < wakeAt) return tick >= sleepAt && tick < wakeAt;
  return tick >= sleepAt || tick < wakeAt;
}

export function occupiedShare(beds: number, taken: number): number {
  if (!(beds > 0) || !(taken > 0)) return 0;
  return Math.min(1, taken / beds);
}

// The last parties are in bed by eleven; the lamps go out one window at a time over the next hour
// and a half, and come back on as the house wakes. A few readers keep theirs lit all night.
const LIGHTS_OUT_FROM = 23 * TICKS_PER_HOUR;
const LIGHTS_OUT_SPAN = 90;
const LIGHTS_UP_FROM = 5 * TICKS_PER_HOUR + 30;
const LIGHTS_UP_SPAN = 60;
const NIGHT_READERS = 0.1;

const sinceTick = (tick: number, from: number): number =>
  (((tick - from) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;

export function lightsOnShare(tickOfDay: number): number {
  const out = sinceTick(tickOfDay, LIGHTS_OUT_FROM);
  const up = sinceTick(tickOfDay, LIGHTS_UP_FROM);
  if (out < sinceTick(LIGHTS_UP_FROM, LIGHTS_OUT_FROM)) {
    return Math.max(NIGHT_READERS, 1 - (1 - NIGHT_READERS) * (out / LIGHTS_OUT_SPAN));
  }
  return Math.min(1, NIGHT_READERS + (1 - NIGHT_READERS) * (up / LIGHTS_UP_SPAN));
}
