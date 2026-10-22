import { beforeEach, describe, expect, it, vi } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { familyOf } from '../../catalog/domain/objectTypes';
import { chargeOf, priceOf } from '../../catalog/domain/prices';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { archetypeOf } from '../../sim/domain/archetypes';
import { mishap, UNWATCHED_UNEASE } from '../../sim/domain/incidents';
import { MUSIC_FLOOR, NOISE, nuisanceFor } from '../../sim/domain/nuisance';
import { NO_HOME } from '../../guests/domain/homes';
import { CROWD_UNEASE, CRUSHED_AT } from '../../sim/domain/pathCrowds';
import { loudest, REPEAT_TICKS, stayCount, type ThoughtKind } from '../../sim/domain/thoughts';
import type { Venue } from '../../sim/domain/venues';
import { plotFactsOf } from './plotFacts';
import { createSimState, type SimState } from './simState';
import { paidShareFor } from './dayClose';
import { DETOUR_UPSET } from '../../sim/domain/condition';
import { DARK_UNEASE } from '../../sim/domain/lamplight';
import {
  frightenInTheCrowd,
  frightenInTheDark,
  gloomOf,
  hear,
  hearSurroundings,
  judgeTheNight,
  nuisanceNow,
  visitMade,
  walkingNode,
} from './visits';

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
const food = facts.venues.find((venue) => venue.role === 'food')!;
const toilets = facts.venues.find((venue) => (venue.smell ?? 0) > 0)!;
// Moved against the tables, so the case does not hang on where the reference resort put them.
const besideTheTables = nuisanceFor(
  facts.venues.map((venue) =>
    venue === toilets ? { ...venue, tileX: food.tileX + food.tilesX, tileZ: food.tileZ } : venue,
  ),
);
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

  it('charges the price the player set, and grumbles when it is far above what the stars justify', () => {
    state.prices = { [familyOf(priced.id)]: 2 };
    visitMade(state, PERSON, priced, 1);
    expect(state.ledger.today.visit).toBe(chargeOf(priced.id, 2));
    expect(loudest(state.thoughtDay, 5)).toContainEqual(
      expect.objectContaining({ kind: 'not-worth-it', subject: priced.label }),
    );
  });

  it('says nothing about a price the stars justify', () => {
    state.prices = { [familyOf(priced.id)]: 1.1 };
    visitMade(state, PERSON, priced, 1);
    expect(state.ledger.today.visit).toBe(chargeOf(priced.id, 1.1));
    expect(loudest(state.thoughtDay, 5).map((tally) => tally.kind)).not.toContain('not-worth-it');
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

  it('leaves a swimmer nobody watched uneasy, as cautious as their party is, and says so', () => {
    visitMade(state, PERSON, dry, 1);
    expect(state.happiness.unease[PERSON]).toBe(0);
    visitMade(state, PERSON, bathing, 1);
    const caution = archetypeOf(state.guests, PERSON).caution;
    expect(state.happiness.unease[PERSON]).toBeCloseTo(UNWATCHED_UNEASE * caution);
    expect(heard(state, 'unwatched')).toBe(1);
  });

  it('has a diner beside filthy toilets smell them, and like it less', () => {
    state.nuisance = besideTheTables;
    state.upkeep.level[indexOf(toilets)] = 0;
    visitMade(state, PERSON, food, 1);
    expect(heard(state, 'smelly')).toBe(1);
    const scrubbed = freshState();
    scrubbed.nuisance = besideTheTables;
    visitMade(scrubbed, PERSON, food, 1);
    expect(heard(scrubbed, 'smelly')).toBe(0);
    expect(state.happiness.level[PERSON]).toBeLessThan(scrubbed.happiness.level[PERSON]!);
  });
});

const heard = (state: SimState, kind: ThoughtKind): number =>
  loudest(state.thoughtDay, 99)
    .filter((each) => each.kind === kind)
    .reduce((total, each) => total + each.count, 0);
const housed = (state: SimState): number[] =>
  Array.from({ length: state.guests.count }, (_, person) => person).filter(
    (person) => state.guests.present[person] === 1 && state.guests.home[person] !== NO_HOME,
  );

describe('hear', () => {
  it('dents the mood of a guest sent elsewhere by a renovation, once for each time it is heard', () => {
    const state = freshState();
    const before = state.happiness.level[PERSON]!;
    hear(state, 10, PERSON, 'renovating', 'Bakery');
    hear(state, 20, PERSON, 'renovating', 'Bakery');
    expect(state.happiness.level[PERSON]).toBeCloseTo(before - DETOUR_UPSET);
    hear(state, 10 + REPEAT_TICKS, PERSON, 'renovating', 'Bakery');
    expect(state.happiness.level[PERSON]).toBeCloseTo(before - 2 * DETOUR_UPSET);
    hear(state, 30, PERSON + 1, 'closed', 'Bakery');
    expect(state.happiness.level[PERSON + 1]).toBeCloseTo(before);
  });
});

describe('judgeTheNight', () => {
  it('grumbles at a dear bed to a glum guest, and never praises it to a happy one', () => {
    const glum = freshState();
    glum.happiness.level.fill(0.2);
    judgeTheNight(glum, 1);
    const happy = freshState();
    happy.happiness.level.fill(0.9);
    judgeTheNight(happy, 1);

    const people = housed(glum);
    const dear = people.filter((person) => paidShareFor(glum, glum.guests.home[person]!) > 1.05);
    expect(dear.length).toBeGreaterThan(0);
    expect(heard(glum, 'not-worth-it')).toBe(dear.length);
    expect(heard(happy, 'not-worth-it')).toBe(0);
    expect(heard(happy, 'good-value')).toBe(people.length - dear.length);
  });

  it('praises a bed at list price to a happy guest, naming the lodging', () => {
    const state = freshState();
    state.lodgings = [];
    state.happiness.level.fill(0.9);
    judgeTheNight(state, 1);
    expect(heard(state, 'good-value')).toBe(housed(state).length);
    const home = state.guests.homes[state.guests.home[housed(state)[0]!]!]!;
    expect(loudest(state.thoughtDay, 99).map((each) => each.subject)).toContain(
      state.names.get(home.key) ?? home.label,
    );
  });

  it('has a guest kept awake all night say so of the lodging, and like the stay less', () => {
    const [sleeper] = housed(freshState());
    const noisy = freshState();
    noisy.nightNoise.heard[sleeper!] = 10;
    judgeTheNight(noisy, 1);
    const quiet = freshState();
    judgeTheNight(quiet, 1);
    expect(heard(noisy, 'noisy')).toBe(1);
    expect(heard(quiet, 'noisy')).toBe(0);
    const home = noisy.guests.homes[noisy.guests.home[sleeper!]!]!;
    const said = loudest(noisy.thoughtDay, 99).find((each) => each.kind === 'noisy');
    expect(said?.subject).toBe(noisy.names.get(home.key) ?? home.label);
    expect(noisy.happiness.level[sleeper!]).toBeLessThan(quiet.happiness.level[sleeper!]!);
    expect(noisy.happiness.stay[sleeper!]).toBeLessThan(quiet.happiness.stay[sleeper!]!);
  });
});

describe('nuisanceNow', () => {
  it('plays an empty club with a DJ at the music floor, and silent without', () => {
    const state = freshState();
    const club = state.venues.findIndex((venue) => venue.id === 'night-club-b');
    expect(nuisanceNow(state, club, NOISE)).toBe(0);
    state.djOn[club] = 1;
    expect(nuisanceNow(state, club, NOISE)).toBe(MUSIC_FLOOR);
  });
});

describe('frightenInTheDark', () => {
  let state: SimState;
  beforeEach(() => {
    state = freshState();
    state.guests.present[PERSON] = 1;
  });

  const nodeWhere = (unlit: number): number => facts.unlit.indexOf(unlit);
  const standAt = (node: number): void => {
    state.crowd.crowd.node[PERSON] = node;
  };
  const unease = (): number => state.happiness.unease[PERSON]!;

  it('lights most of the reference paths and leaves a few stretches dark', () => {
    const dark = facts.unlit.filter((unlit) => unlit === 1).length;
    expect(nodeWhere(0)).toBeGreaterThanOrEqual(0);
    expect(dark).toBeGreaterThan(0);
    expect(dark / facts.unlit.length).toBeLessThan(0.2);
  });

  it('frightens a guest deep in a dark stretch at midnight, and nobody by day', () => {
    standAt(nodeWhere(1));
    expect(gloomOf(state, PERSON, 1)).toBe(1);
    frightenInTheDark(state, 0);
    expect(unease()).toBe(0);
    frightenInTheDark(state, 1);
    expect(unease()).toBeCloseTo(DARK_UNEASE * archetypeOf(state.guests, PERSON).caution);
  });

  it('leaves a guest near a light at ease', () => {
    standAt(nodeWhere(0));
    frightenInTheDark(state, 1);
    expect(unease()).toBe(0);
  });

  it('frightens nobody who is not here', () => {
    standAt(nodeWhere(1));
    state.guests.present[PERSON] = 0;
    frightenInTheDark(state, 1);
    expect(unease()).toBe(0);
  });
});

describe('a crowded path', () => {
  let state: SimState;
  let held = false;
  beforeEach(() => {
    state = freshState();
    held = false;
    state.guests.present[PERSON] = 1;
    vi.spyOn(state.router, 'holds').mockImplementation((person) => held && person === PERSON);
    vi.spyOn(state.router, 'isAsleep').mockReturnValue(false);
  });

  const NOON = 12 * 60;
  const packedAt = (unlit: number): number => {
    const node = facts.unlit.indexOf(unlit);
    state.crowd.crowd.node[PERSON] = node;
    state.pathCrowds.density[node] = CRUSHED_AT;
    return node;
  };
  const heardBy = (kind: ThoughtKind): number => stayCount(state.thoughts, PERSON, kind);

  it('finds the node of a guest on their feet, and none for one the router holds', () => {
    const node = packedAt(0);
    expect(walkingNode(state, PERSON)).toBe(node);
    held = true;
    expect(walkingNode(state, PERSON), 'queueing, asleep or inside').toBe(-1);
    held = false;
    state.guests.present[PERSON] = 0;
    expect(walkingNode(state, PERSON)).toBe(-1);
  });

  it('is heard by a packed guest as the hours turn, but not by one in a line', () => {
    packedAt(0);
    hearSurroundings(state, NOON);
    hearSurroundings(state, NOON + REPEAT_TICKS);
    expect(heardBy('crowded')).toBe(2);
    held = true;
    hearSurroundings(state, NOON + 2 * REPEAT_TICKS);
    expect(heardBy('crowded')).toBe(2);
  });

  it('unsettles a packed guest by their caution, and nobody the router holds', () => {
    packedAt(0);
    frightenInTheCrowd(state);
    const caution = archetypeOf(state.guests, PERSON).caution;
    expect(state.happiness.unease[PERSON]).toBeCloseTo(CROWD_UNEASE * caution);
    const queueing = freshState();
    state = queueing;
    state.guests.present[PERSON] = 1;
    vi.spyOn(state.router, 'holds').mockReturnValue(true);
    packedAt(0);
    frightenInTheCrowd(state);
    expect(state.happiness.unease[PERSON]).toBe(0);
  });

  it('gives way to a dark path, which is the fright that counts', () => {
    packedAt(1);
    hearSurroundings(state, 0);
    expect(heardBy('dark')).toBe(1);
    expect(heardBy('crowded')).toBe(0);
  });
});
