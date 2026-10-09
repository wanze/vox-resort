import type { EventStep } from '../../events/domain/eventRuns';
import { fadeFootfall, sampleFootfall } from '../../overlays/domain/overlays';
import { checkInDue } from '../../sim/domain/checkIn';
import { ageHappiness } from '../../sim/domain/happiness';
import { decayNeeds } from '../../sim/domain/needs';
import { fadePhotoHeat } from '../../sim/domain/photos';
import { cheerTheAudience } from '../../sim/domain/staff';
import { weatherEffect } from '../../sim/domain/weather';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import type { SimState } from './simState';
import { burnOnTheBeach, hearSurroundings, judgeTheNight, surroundingsOf } from './visits';
import { closeTheDay, payTheBills, rateTheDay } from './dayClose';
import { admitLaterWaves, runDay } from './arrivals';
import { markNightOwls, refreshDj, refreshNightOut } from './nights';
import { refreshKeen, runEvents } from './eventSteps';
import { refreshMoment } from './photoSteps';

// The checkInDue arithmetic over an hour: twelve ticks in a frame must not step over one.
const hourTurned = (from: number, to: number): boolean =>
  Math.floor(to / TICKS_PER_HOUR) > Math.floor((from - 1) / TICKS_PER_HOUR);

export interface SimHooks {
  readonly morning: () => void;
  readonly hourly: () => void;
  readonly heard: (steps: readonly EventStep[]) => void;
}

export function stepSim(resort: SimState, clock: SimNow, ticks: number, hooks: SimHooks): void {
  decayNeeds(resort.needs, resort.guests, ticks, weatherEffect(clock.weather), (person) =>
    resort.router.isAsleep(person),
  );
  // One tick at a time: a place freed on the first tick must let somebody in on the first.
  for (let tick = ticks; tick > 0; tick--) {
    resort.router.tick(clock.ticks - tick + 1);
    // Same tick as the guests', so a venue cleaned on the first tick is clean for whoever decides
    // next.
    resort.staffRouter.tick(clock.ticks - tick + 1);
  }
  // Once a frame, not once a tick: the inner loop is the router's, and a frame's sample is plenty.
  sampleFootfall(
    resort.footfall,
    resort.crowd.crowd.node,
    resort.guests.present,
    resort.happiness.level,
  );
  runEvents(resort, clock, ticks, hooks.heard);
  // After the events, so the fireworks starting this frame are in it.
  refreshMoment(resort, clock);
  // After the ticks, so a guest is charged for the line they were actually in.
  const { glow } = resort.events;
  ageHappiness(
    resort.happiness,
    resort.needs,
    resort.guests,
    (person) => resort.router.isWaitingAt(person),
    ticks,
    (person) => surroundingsOf(resort, person),
    (person) => glow[person]!,
  );
  // Over the whole run of ticks: twelve ticks in a frame must not step over the check-in hour.
  if (checkInDue(clock.ticks - ticks + 1, clock.ticks)) {
    payTheBills(resort);
    // Before the day closes, so the night's verdicts count towards the day that earned them.
    judgeTheNight(resort, clock.ticks);
    rateTheDay(resort);
    closeTheDay(resort, clock.day);
    runDay(resort, clock.day);
    resort.settled.clear();
    refreshKeen(resort, clock);
    refreshNightOut(resort, clock);
    // After the coaches and before the counters are wiped, which the advice reads.
    hooks.morning();
    resort.router.forgetTheDay();
    resort.thoughtDay.clear();
    fadeFootfall(resort.footfall);
    fadePhotoHeat(resort.photos);
  }
  // After the morning's wipe, so the first hour of a day is heard in that day.
  if (hourTurned(clock.ticks - ticks + 1, clock.ticks)) {
    hearSurroundings(resort, clock.ticks);
    burnOnTheBeach(resort, clock);
    refreshKeen(resort, clock);
    refreshNightOut(resort, clock);
    markNightOwls(resort, clock);
    hooks.hourly();
  }
  admitLaterWaves(resort, clock, ticks);
  refreshDj(resort, clock);
  // A booked event cheers its own audience, so a show on the same stage does not cheer them twice.
  cheerTheAudience(resort.needs, resort.guests.present, {
    performing: (venue) =>
      (resort.staffRouter.performingAt(venue) || resort.djOn[venue] === 1) &&
      resort.eventShowing[venue] !== 1,
    venueOf: (person) => resort.router.venueIndexOf(person),
    waiting: (person) => resort.router.isWaitingAt(person),
    venues: resort.venues.length,
    hours: ticks / TICKS_PER_HOUR,
  });
}
