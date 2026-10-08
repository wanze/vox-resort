import { releaseStrength } from '../../balloons/domain/balloons';
import { isWet } from '../../weather/domain/rainfall';
import type { ClockSnapshot } from './resortSnapshot';
import {
  advanceClock,
  clockLabel,
  createSimClock,
  dayOf,
  followTime,
  TICKS_PER_DAY,
  timeOf,
  withSpeed,
  withTime,
  type SimClock,
  type SimSpeed,
} from './simClock';
import { weatherOn, type Weather } from './weather';

export interface ResortClock {
  readonly time: number;
  readonly day: number;
  readonly weather: Weather;
  readonly forcedWeather: Weather | null;
  readonly tickOfDay: number;
  readonly ticks: number;
  readonly label: string;
  readonly speed: SimSpeed;
  readonly balloonReadiness: number;
  // Real seconds, as the lightning flashes by, so the thunder follows the same strikes.
  readonly running: number;
  // `pace` slows the simulated time alone, for a show on screen; the lightning keeps real time.
  advance(elapsedSeconds: number, pace?: number): number;
  follow(time: number, elapsedSeconds: number): number;
  restart(time: number): void;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  // Kept on the clock, not in weather.ts, so weatherOn stays pure; saved with the clock.
  setWeather(weather: Weather | null): void;
  snapshot(): ClockSnapshot;
  restore(saved: ClockSnapshot): void;
}

export function createResortClock(startTime: number, weatherSeed: number): ResortClock {
  let clock: SimClock = createSimClock(0, startTime);
  let forced: Weather | null = null;
  const weatherNow = (): Weather => forced ?? weatherOn(dayOf(clock), weatherSeed);
  // Real seconds, not simulated: the clock opens paused and a storm must still flash.
  let running = 0;

  return {
    get time() {
      return timeOf(clock);
    },
    get day() {
      return dayOf(clock);
    },
    get weather() {
      return weatherNow();
    },
    get forcedWeather() {
      return forced;
    },
    get tickOfDay() {
      return clock.ticks % TICKS_PER_DAY;
    },
    get ticks() {
      return clock.ticks;
    },
    get label() {
      return clockLabel(clock);
    },
    get speed() {
      return clock.speed;
    },
    get balloonReadiness() {
      // Flights already in the air finish, so a shower at dusk empties the sky gradually.
      return isWet(weatherNow()) ? 0 : releaseStrength(timeOf(clock));
    },
    get running() {
      return running;
    },
    advance(elapsedSeconds, pace = 1) {
      running += elapsedSeconds;
      const advanced = advanceClock(clock, elapsedSeconds * pace);
      clock = advanced.clock;
      return advanced.ticks;
    },
    follow(next, elapsedSeconds) {
      running += elapsedSeconds;
      const followed = followTime(clock, next);
      clock = followed.clock;
      return followed.ticks;
    },
    restart(next) {
      clock = withSpeed(createSimClock(0, next), clock.speed);
    },
    setTime(next) {
      clock = withTime(clock, next);
    },
    setSpeed(next) {
      clock = withSpeed(clock, next);
    },
    setWeather(next) {
      forced = next;
    },
    snapshot() {
      return { ticks: clock.ticks, speed: clock.speed, carry: clock.carry, forced };
    },
    restore(saved) {
      clock = { ticks: saved.ticks, speed: saved.speed, carry: saved.carry };
      forced = saved.forced;
    },
  };
}
