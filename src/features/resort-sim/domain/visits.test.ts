import { beforeEach, describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { priceOf } from '../../catalog/domain/prices';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { mishap } from '../../sim/domain/incidents';
import { loudest } from '../../sim/domain/thoughts';
import type { Venue } from '../../sim/domain/venues';
import { plotFactsOf } from './plotFacts';
import { createSimState, type SimState } from './simState';
import { visitMade } from './visits';

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
    population: 60,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
  });

const PERSON = 0;
// A stage, so an event can be held where a visit is otherwise paid for.
const priced = facts.venues.find((venue) => priceOf(venue.id) > 0 && venue.stage === true)!;
const bathing = facts.venues.find((venue) => venue.bathing === true)!;
const dry = facts.venues.find((venue) => venue.bathing !== true && venue.role !== 'activity')!;
const indexOf = (venue: Venue): number => facts.venueIndex.get(venue.key)!;
const health = (state: SimState): number => state.needs.level.health[PERSON]!;

// A tick on which the person would come to grief in water nobody watches.
const unluckyTick = Array.from({ length: 100_000 }, (_, tick) => tick).find((tick) =>
  mishap(PERSON, tick, false),
)!;

describe('visitMade', () => {
  let state: SimState;
  beforeEach(() => {
    state = freshState();
  });

  it('takes the price of a visit and counts it to the venue', () => {
    visitMade(state, PERSON, priced, 1);
    expect(state.ledger.today.visit).toBe(priceOf(priced.id));
    expect(state.takings.get(priced.key)).toBe(priceOf(priced.id));
  });

  it('charges nothing for a visit to an event held there', () => {
    const occurrence = {
      booking: 0,
      kind: 'welcome' as const,
      site: { kind: 'stage' as const, venue: priced.key },
      day: 0,
      start: 0,
      end: 60,
    };
    const party = state.guests.party[PERSON]!;
    const run = {
      occurrence,
      phase: 'running' as const,
      parties: [party],
      attended: new Set<number>(),
      paid: 0,
      salt: 0,
    };
    state.events.runs = [run];
    visitMade(state, PERSON, priced, 1);
    expect(state.ledger.today.visit).toBe(0);
    expect(state.takings.has(priced.key)).toBe(false);
  });

  it('has the guest think about a filthy venue', () => {
    state.upkeep.level[indexOf(priced)] = 0;
    visitMade(state, PERSON, priced, 1);
    expect(loudest(state.thoughtDay, 5)).toContainEqual(
      expect.objectContaining({ kind: 'filthy', subject: priced.label }),
    );
  });

  it('risks a mishap in the water, never on dry land', () => {
    expect(unluckyTick).toBeDefined();
    visitMade(state, PERSON, dry, unluckyTick);
    expect(health(state)).toBe(freshState().needs.level.health[PERSON]);
    visitMade(state, PERSON, bathing, unluckyTick);
    expect(health(state)).toBeLessThan(freshState().needs.level.health[PERSON]!);
  });
});
