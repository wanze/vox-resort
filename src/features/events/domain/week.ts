import { TICKS_PER_DAY } from '../../sim/domain/simClock';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES: { readonly [day in Weekday]: string } = {
  0: 'Mon',
  1: 'Tue',
  2: 'Wed',
  3: 'Thu',
  4: 'Fri',
  5: 'Sat',
  6: 'Sun',
};

export const START_STEP = 30;

// The opening guests arrived on negative days, so a plain `%` would answer -1.
export function weekdayOf(day: number): Weekday {
  return (((Math.floor(day) % 7) + 7) % 7) as Weekday;
}

export function minuteOf(tick: number): number {
  return ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

export function dayAt(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

export function tickAt(day: number, minute: number): number {
  return day * TICKS_PER_DAY + minute;
}

export function clockWords(minute: number): string {
  const within = minuteOf(minute);
  const hour = String(Math.floor(within / 60)).padStart(2, '0');
  return `${hour}:${String(within % 60).padStart(2, '0')}`;
}

export function dayWords(day: number): string {
  return `${WEEKDAY_NAMES[weekdayOf(day)]} ${day}`;
}
