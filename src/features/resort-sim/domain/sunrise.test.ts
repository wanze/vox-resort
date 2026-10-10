import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { isEarlyRiser } from '../../sim/domain/night';
import type { Weather } from '../../sim/domain/weather';
import { beachIndexOf } from './eventSteps';
import { plotFactsOf } from './plotFacts';
import type { SimNow } from './simNow';
import { createSimState, type SimState } from './simState';
import { dawnStayOf, sendToTheSunrise, WATCHED_UNTIL } from './sunrise';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const plot = { ...world, layout: world };
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());

const freshState = (): SimState =>
  createSimState({
    plan,
    plot,
    shore,
    facts,
    population: 200,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
  });

const HOUR = 60;
const DAY = 1440;

const at = (tickOfDay: number, weather: Weather = 'clear'): SimNow => ({
  ticks: DAY + tickOfDay,
  day: 1,
  tickOfDay,
  weather,
  forcedWeather: null,
});

const partiesOf = (state: SimState, early: boolean): number[] =>
  state.guests.parties.flatMap((party, index) =>
    isEarlyRiser(index) === early && party.wheelchair < 0 ? [index] : [],
  );

const headingToBeach = (state: SimState, party: number): boolean =>
  state.router.goalOf(state.guests.parties[party]!.members[0]!)?.label === 'Beach';

describe('dawnStayOf', () => {
  const state = freshState();
  const beach = beachIndexOf(state);
  const [early] = partiesOf(state, true);
  const [late] = partiesOf(state, false);

  it('keeps an early riser on the sand through the first hour of the sun', () => {
    expect(beach).toBeGreaterThanOrEqual(0);
    expect(dawnStayOf(state, early!, beach, DAY + 5.5 * HOUR)).toBe(DAY + WATCHED_UNTIL);
    expect(WATCHED_UNTIL).toBe(7 * HOUR);
  });

  it('keeps nobody else, nowhere else and at no other hour', () => {
    expect(dawnStayOf(state, late!, beach, DAY + 5.5 * HOUR)).toBe(-1);
    expect(dawnStayOf(state, early!, 0, DAY + 5.5 * HOUR)).toBe(-1);
    expect(dawnStayOf(state, early!, beach, DAY + WATCHED_UNTIL)).toBe(-1);
    expect(dawnStayOf(state, early!, beach, DAY + 4 * HOUR)).toBe(-1);
  });
});

describe('sendToTheSunrise', () => {
  it('sends the early risers to the beach before the sun is up, and nobody else', () => {
    const state = freshState();
    sendToTheSunrise(state, at(5 * HOUR + 10));
    const early = partiesOf(state, true);
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((party) => headingToBeach(state, party))).toBe(true);
    expect(partiesOf(state, false).some((party) => headingToBeach(state, party))).toBe(false);
  });

  it('sends nobody once the sun is up, or in the rain', () => {
    const late = freshState();
    sendToTheSunrise(late, at(6 * HOUR));
    const wet = freshState();
    sendToTheSunrise(wet, at(5 * HOUR + 10, 'rain'));
    for (const state of [late, wet]) {
      expect(partiesOf(state, true).some((party) => headingToBeach(state, party))).toBe(false);
    }
  });
});
