import type { NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import { mix } from '../../random/domain/hash';
import { TICKS_PER_DAY } from './simClock';

// A tick is a simulated minute.
const TICKS_PER_HOUR = 60;

// Spread per party so six hundred people do not turn at once; the window ends at
// sunset (21:30) so the walk home can be watched.
const BEDTIME_HOUR = 19;
const BEDTIME_SPREAD_HOURS = 2.5;
const WAKE_HOUR = 7;
const WAKE_SPREAD_HOURS = 2;

// Energy is filled completely because nothing else on the plot restores it.
export const NIGHT_RELIEF: readonly NeedRelief[] = [
  { need: 'energy', amount: 1 },
  { need: 'hygiene', amount: 0.5 },
];

// Derived from a hash of the party index rather than stored, so a save holds nothing
// and two runs of the same plot agree.
export function bedtimeOf(party: number): { readonly sleepAt: number; readonly wakeAt: number } {
  const sleepHash = mix(party * 2 + 1);
  const wakeHash = mix(party * 2 + 2);
  const sleepAt =
    (BEDTIME_HOUR * TICKS_PER_HOUR + (sleepHash % (BEDTIME_SPREAD_HOURS * TICKS_PER_HOUR))) %
    TICKS_PER_DAY;
  const wakeAt =
    (WAKE_HOUR * TICKS_PER_HOUR + (wakeHash % (WAKE_SPREAD_HOURS * TICKS_PER_HOUR))) %
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
