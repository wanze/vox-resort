import { homelessCount, presentCount } from '../../guests/domain/guests';
import { isQuietNight } from '../../sim/domain/fastNight';
import { isStaffNight } from '../../sim/domain/staffNight';
import type { SimNow } from './simNow';
import type { SimState } from './simState';
import { eveningOf } from './staffing';

// Off shift is gone enough: a worker still walking home falls behind the clock, but has nothing
// left to do, and the walk home is up to two hours on the reference resort.
const onShift = (resort: SimState): number => resort.onShift.reduce((sum, each) => sum + each, 0);

// Once a frame, so the guests are only counted inside the night: by day it answers at once.
export function quietNightNow(resort: SimState, clock: SimNow): boolean {
  if (!isStaffNight(clock.tickOfDay) || onShift(resort) > 0) return false;
  const { guests, router } = resort;
  const present = presentCount(guests);
  const evening = eveningOf(resort, clock);
  return isQuietNight({
    tickOfDay: clock.tickOfDay,
    staffOnShift: 0,
    awake: Math.max(0, present - homelessCount(guests) - router.asleepCount),
    present,
    eventOn: evening.eventOn,
    lateOpen: evening.lateOpen,
  });
}
