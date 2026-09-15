/**
 * When the resort goes to bed, when it gets up, and how full its beds are.
 *
 * ## Bedtime is a pure function of the party
 *
 * Nothing about sleep is stored. A party's bedtime and wake time are worked
 * out from its index with an integer hash, every time they are asked for, so a
 * save file has nothing to hold about them and two runs of the same plot agree.
 * A seeded generator would do the same job with state that had to be seeded,
 * stored and advanced in lockstep - for a number that never needs to change.
 */

import type { NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import { TICKS_PER_DAY } from './simClock';

/** Ticks in an hour: a tick is a simulated minute. */
const TICKS_PER_HOUR = 60;

/**
 * The hour the resort starts drifting home, and the hour it is up.
 *
 * Not one moment for everybody: a resort where six hundred people turn round on
 * the same tick is a fire drill. Each party gets its own bedtime spread over
 * {@link BEDTIME_SPREAD_HOURS} from this, drawn from the party index so it is the
 * same every night of their stay - somebody who goes to bed late goes to bed late
 * all week, which is a small thing that reads as character.
 *
 * Seven to half past nine, ending on a sunset at half past nine (`SUNSET_TIME`
 * in `lighting/domain/dayNight.ts`): every party has set off before dark, so
 * the walk back to the lodgings is something that can be watched. "Bedtime" is
 * when a party turns for home, not when the light goes out - at `normal` a walk
 * home across the reference plot is most of an hour.
 */
const BEDTIME_HOUR = 19;
const BEDTIME_SPREAD_HOURS = 2.5;
const WAKE_HOUR = 7;
const WAKE_SPREAD_HOURS = 2;

/**
 * What a night's sleep does for somebody, applied through `relieve` as they get
 * up.
 *
 * Energy is filled, because a night's sleep is what energy is for: a guest who
 * woke as tired as they went to bed would never be anything but tired, since
 * nothing else on the plot gives any back. Hygiene gets a generous share for the
 * shower before breakfast, which no model on the plot stands in for.
 */
export const NIGHT_RELIEF: readonly NeedRelief[] = [
  { need: 'energy', amount: 1 },
  { need: 'hygiene', amount: 0.5 },
];

/**
 * A well-mixed unsigned integer from a small one: the murmur3 finaliser.
 *
 * Mixed rather than taken modulo straight, because neighbouring party indices
 * would otherwise get neighbouring bedtimes, and parties are numbered in the
 * order they were drawn.
 */
function mix(value: number): number {
  let hash = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2_ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** The tick of the day this party turns in, and the tick it gets up. */
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

/**
 * Whether this party should be heading for bed at this tick of the day.
 *
 * True across midnight, which is the case worth being careful about: a bedtime
 * of 23:40 and a wake of 08:10 is a window that wraps, and a naive `>=` and `<`
 * would have that party awake all night and asleep all day.
 */
export function isBedtime(party: number, tickOfDay: number): boolean {
  const { sleepAt, wakeAt } = bedtimeOf(party);
  const tick = ((tickOfDay % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (sleepAt < wakeAt) return tick >= sleepAt && tick < wakeAt;
  return tick >= sleepAt || tick < wakeAt;
}

/**
 * The share of the resort's beds that have somebody in them, 0..1.
 *
 * What the windows are lit from. A plot with no beds at all returns 0, which is
 * a resort with nothing to light rather than a division by zero.
 */
export function occupiedShare(beds: number, taken: number): number {
  if (!(beds > 0) || !(taken > 0)) return 0;
  return Math.min(1, taken / beds);
}
