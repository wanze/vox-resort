import type { PartyKind } from '../../guests/domain/parties';
import { mix } from './night';
import { TICKS_PER_DAY } from './simClock';

// Every family has children, and no child is taken to a club.
export const NIGHT_OUT_SHARE: { readonly [kind in PartyKind]: number } = {
  friends: 0.6,
  solo: 0.4,
  couple: 0.35,
  family: 0,
};

const HOUR = 60;
const NOON = 12 * HOUR;
const LATE_BEDTIME_FROM = 23 * HOUR;
const LATE_BEDTIME_SPREAD = 150;

// As the events' LATE_FROM: whoever is still up past ten wakes tired, whatever kept them up.
const TIRED_FROM = 22 * HOUR;

// Salted apart from bedtimeOf's draws, so going out says nothing about the usual bedtime.
const drawOf = (party: number, day: number, salt: number): number =>
  mix(party * 4 + Math.trunc(day) * 2_654_435_761 + salt);

export function goesOut(party: number, day: number, kind: PartyKind, children: number): boolean {
  if (children > 0) return false;
  return drawOf(party, day, 3) / 2 ** 32 < NIGHT_OUT_SHARE[kind];
}

export function lateBedtimeOf(party: number, day: number): number {
  return (LATE_BEDTIME_FROM + (drawOf(party, day, 2) % LATE_BEDTIME_SPREAD)) % TICKS_PER_DAY;
}

// On the night that starts on `day`, so a bedtime past midnight lands on the next day.
export function outUntil(party: number, day: number): number {
  const bedtime = lateBedtimeOf(party, day);
  return (
    Math.trunc(day) * TICKS_PER_DAY + bedtime + (bedtime < LATE_BEDTIME_FROM ? TICKS_PER_DAY : 0)
  );
}

// From noon to noon, so the small hours still belong to the evening before.
export function nightOf(ticks: number): number {
  return Math.floor((ticks - NOON) / TICKS_PER_DAY);
}

export const isPastTen = (tickOfDay: number): boolean =>
  tickOfDay >= TIRED_FROM || tickOfDay < NOON;

function childrenIn(child: Uint8Array, members: readonly number[]): number {
  let children = 0;
  for (const member of members) children += child[member]!;
  return children;
}

// Into an array kept per party, so an hourly refresh allocates nothing; -1 stays in.
export function planNightsOut(
  parties: readonly { readonly kind: PartyKind; readonly members: readonly number[] }[],
  child: Uint8Array,
  night: number,
  into: Int32Array,
): void {
  into.fill(-1);
  for (let party = 0; party < parties.length; party++) {
    const { kind, members } = parties[party]!;
    if (goesOut(party, night, kind, childrenIn(child, members)))
      into[party] = outUntil(party, night);
  }
}
