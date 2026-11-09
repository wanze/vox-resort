import { describe, expect, it } from 'vitest';
import {
  answer,
  morningStops,
  NO_STOPS,
  offerStop,
  PLANNING,
  shownStop,
  stop,
  weekStop,
  type PausePrefs,
} from './stops';

const ALL: PausePrefs = { pauseWeek: true, pauseOffers: true };

// Day 7 is a Monday, as day 0 is.
const MONDAY = 7;

describe('stopping the game', () => {
  it('remembers the speed the first stop interrupted, and gives it back with the last', () => {
    const one = stop(NO_STOPS, [weekStop(MONDAY)], 'fast');
    const two = stop(one, [offerStop(3)], 'paused');
    expect(two.resume).toBe('fast');
    const first = answer(two, 'week:7');
    expect(first.resume).toBeNull();
    expect(answer(first.stops, 'offer:3')).toEqual({ stops: NO_STOPS, resume: 'fast' });
  });

  it('gives back no speed when the game was already paused', () => {
    const paused = stop(NO_STOPS, [weekStop(MONDAY)], 'paused');
    expect(answer(paused, 'week:7').resume).toBeNull();
  });

  it('queues a stop once, and answers only one that waits', () => {
    const once = stop(NO_STOPS, [offerStop(3)], 'normal');
    expect(stop(once, [offerStop(3)], 'normal')).toBe(once);
    expect(answer(once, 'week:7')).toEqual({ stops: once, resume: null });
  });

  it('keeps the pause while planning, and shows what waits behind it', () => {
    const planning = stop(stop(NO_STOPS, [PLANNING], 'rush'), [offerStop(4)], 'paused');
    expect(shownStop(planning)).toMatchObject({ kind: 'offer', offer: 4 });
    const offerDone = answer(planning, 'offer:4');
    expect(offerDone.resume).toBeNull();
    expect(shownStop(offerDone.stops)).toBeNull();
    expect(answer(offerDone.stops, 'planning').resume).toBe('rush');
  });
});

describe('the morning stops', () => {
  it('pins up the week on a Monday with somewhere to hold events', () => {
    expect(morningStops({ day: MONDAY, stage: true }, ALL)).toEqual([weekStop(MONDAY)]);
  });

  it('stops for no week on another day, with no stage, or when the player said not to', () => {
    expect(morningStops({ day: MONDAY + 1, stage: true }, ALL)).toEqual([]);
    expect(morningStops({ day: MONDAY, stage: false }, ALL)).toEqual([]);
    expect(morningStops({ day: MONDAY, stage: true }, { ...ALL, pauseWeek: false })).toEqual([]);
  });
});
