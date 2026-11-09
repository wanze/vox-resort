import { describe, expect, it } from 'vitest';
import {
  accept,
  createBookings,
  demandOn,
  offered,
  type BookingsState,
} from '../../bookings/domain/bookings';
import type { Offer } from '../../bookings/domain/offers';
import { createEvents } from '../../events/domain/eventRuns';
import { ceremonyOf, occurrencesOn } from '../../events/domain/programme';
import { createGuests, presentCount } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { arrivalsDueBy, ARRIVAL_WAVES, bedsOn, CHECK_IN_TICK } from '../../sim/domain/checkIn';
import { startDay } from '../../sim/domain/dayReport';
import { createHappiness } from '../../sim/domain/happiness';
import { createLedger } from '../../sim/domain/ledger';
import { createCarrying } from '../../sim/domain/litter';
import { createNeeds } from '../../sim/domain/needs';
import { arrivalsFor, bookingsWanted, ratingFor } from '../../sim/domain/rating';
import {
  ADVANCE_BOOKING_DAYS,
  firstSeason,
  lastNightOf,
  phaseEffect,
  SEASON_DAYS,
} from '../../sim/domain/season';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { expectationFor } from '../../sim/domain/expectations';
import { createDay, createThoughts, stayCount } from '../../sim/domain/thoughts';
import type { Venue } from '../../sim/domain/venues';
import { admitLaterWaves, admitWave, runDay, sendDepartures, type ArrivalsState } from './arrivals';
import { bookedPartyLeft } from './bookingSteps';
import type { SimNow } from './simNow';

const HOMES = [
  { key: 'villa#1', id: 'villa', label: 'Villa', beds: 12 },
  { key: 'bungalow#2', id: 'bungalow', label: 'Bungalow', beds: 8 },
];
const ARRIVAL_NODE = 7;

function stateOf(away: boolean) {
  const guests = createGuests({
    count: 40,
    homes: HOMES,
    variants: 2,
    childVariant: 1,
    seed: 4,
    away,
  });
  const admitted: [number, number][] = [];
  const sentHome: number[] = [];
  const state: ArrivalsState = {
    router: {
      arrivalNode: ARRIVAL_NODE,
      receptionReachable: true,
      admit: (person, node) => admitted.push([person, node]),
      sendHome: (person) => sentHome.push(person),
    },
    guests,
    needs: createNeeds(guests, 1),
    happiness: createHappiness(guests.count),
    lodgings: [],
    scenery: { tilesX: 0, tilesZ: 0, value: new Float32Array(0) },
    prices: {},
    condition: new Map(),
    lastNightNoise: new Map(),
    closing: new Map(),
    renovating: new Map(),
    constructing: new Map(),
    events: createEvents(guests.count),
    homeEarly: new Set(),
    nightOwls: new Set(),
    carrying: createCarrying(guests.count),
    thoughts: createThoughts(guests.count),
    thoughtDay: createDay(),
    venues: [],
    unreachable: new Set(),
    bookings: createBookings(),
    today: startDay(0),
    rating: ratingFor({ happiness: 1, present: 1, housed: 1, cleanliness: 1 }),
    open: true,
    season: null,
    arrivalsPlanned: 10,
    arrivalsAdmitted: 0,
    newcomers: [],
    arrivals: createRandom(8),
    beds: { total: 20, taken: 0 },
  };
  return { state, admitted, sentHome };
}

const nowAt = (ticks: number): SimNow => ({
  ticks,
  day: Math.floor(ticks / TICKS_PER_DAY),
  tickOfDay: ticks % TICKS_PER_DAY,
  weather: 'clear',
  forcedWeather: null,
});

describe('admitWave', () => {
  it('admits nobody to a closed resort and counts the wave as admitted', () => {
    const { state, admitted } = stateOf(true);
    state.open = false;
    admitWave(state, 0, 0);
    expect(presentCount(state.guests)).toBe(0);
    expect(admitted).toEqual([]);
    expect(state.arrivalsAdmitted).toBe(arrivalsDueBy(10, 0));
  });

  it('admits up to the wave at the arrival node, each party listed once', () => {
    const { state, admitted } = stateOf(true);
    state.carrying.nodes.fill(3);
    state.events.glow.fill(0.5);
    admitWave(state, 0, 0);
    const people = admitted.map(([person]) => person);
    expect(people.length).toBeGreaterThan(0);
    // A party is never split, so only the last one in may take the count past the wave.
    const last = state.guests.parties[state.newcomers.at(-1)!]!.members.length;
    expect(people.length - last).toBeLessThan(arrivalsDueBy(10, 0));
    expect(admitted.every(([, node]) => node === ARRIVAL_NODE)).toBe(true);
    for (const person of people) {
      expect(state.guests.present[person]).toBe(1);
      expect(state.carrying.nodes[person]).toBe(0);
      expect(state.events.glow[person]).toBe(0);
    }
    const parties = [...new Set(people.map((person) => state.guests.party[person]!))];
    expect(state.newcomers).toEqual(parties);
    expect(state.today.arrived).toBe(people.length);
    expect(state.arrivalsAdmitted).toBe(people.length);
  });

  it('has the arrivals expect what the stars and the price of their bed promised', () => {
    const { state, admitted } = stateOf(true);
    state.happiness.expects.fill(0.9);
    admitWave(state, 0, 0);
    expect(state.rating.stars).toBe(5);
    expect(admitted.length).toBeGreaterThan(0);
    for (const [person] of admitted) {
      expect(state.happiness.expects[person]).toBeCloseTo(expectationFor(5, 1));
    }
  });
});

describe('sendDepartures', () => {
  it('sends home only the guests whose nights are up', () => {
    const { state, sentHome } = stateOf(false);
    const day = 4;
    const { guests } = state;
    const due = Array.from({ length: guests.count }, (_, person) => person).filter(
      (person) =>
        guests.present[person] === 1 && guests.arrivedOn[person]! + guests.nights[person]! < day,
    );
    expect(due.length).toBeGreaterThan(0);
    expect(due.length).toBeLessThan(presentCount(guests));
    sendDepartures(state, day);
    expect(sentHome).toEqual(due);
  });
});

describe('runDay', () => {
  it('forgets last night and plans the day by the rating and the free beds', () => {
    const { state } = stateOf(true);
    state.open = false;
    state.homeEarly.add(1);
    state.nightOwls.add(2);
    state.events.tired.add(3);
    state.newcomers = [4];
    const planned = arrivalsFor(state.rating, bedsOn(state.guests));
    runDay(state, 1);
    expect(state.homeEarly.size).toBe(0);
    expect(state.nightOwls.size).toBe(0);
    expect(state.events.tired.size).toBe(0);
    expect(state.newcomers).toEqual([]);
    expect(planned).toBeGreaterThan(0);
    expect(state.arrivalsPlanned).toBe(planned);
  });

  it('gives no bed in a lodging closed for renovation, and leaves its free beds as they were', () => {
    const { state: open } = stateOf(true);
    const state = { ...open, closing: new Map([['villa#1', 500]]) };
    state.arrivalsPlanned = 30;
    runDay(state, 1);
    const housed = (home: number) =>
      Array.from(state.guests.home).filter(
        (each, person) => each === home && state.guests.present[person] === 1,
      ).length;
    expect(housed(1)).toBeGreaterThan(0);
    expect(housed(0)).toBe(0);
    expect(state.guests.freeBeds[0]).toBe(12);
  });
});

describe('runDay in a season', () => {
  it('sends every guest home on the closing morning and books nobody', () => {
    const { state, sentHome } = stateOf(false);
    state.season = firstSeason(0);
    runDay(state, SEASON_DAYS);
    expect(state.season).toEqual({ ...firstSeason(0), state: 'closing' });
    expect(state.arrivalsPlanned).toBe(0);
    expect(sentHome).toHaveLength(presentCount(state.guests));
  });

  it('books more in the school holidays than early on, and none past the last night', () => {
    const early = stateOf(true).state;
    early.season = firstSeason(0);
    runDay(early, 2);
    const holidays = stateOf(true).state;
    holidays.season = firstSeason(0);
    runDay(holidays, 10);
    expect(holidays.arrivalsPlanned).toBeGreaterThan(early.arrivalsPlanned);
    const late = stateOf(true).state;
    late.season = firstSeason(0);
    runDay(late, 26);
    const { guests } = late;
    for (let person = 0; person < guests.count; person++) {
      if (guests.present[person] !== 1) continue;
      expect(guests.arrivedOn[person]! + guests.nights[person]! - 1).toBeLessThanOrEqual(
        lastNightOf(late.season),
      );
    }
  });

  it('brings the bookings taken over the break on the opening morning', () => {
    const opening = stateOf(true).state;
    opening.season = firstSeason(0);
    const beds = bedsOn(opening.guests);
    runDay(opening, 0);
    const later = stateOf(true).state;
    later.season = firstSeason(0);
    runDay(later, 2);
    const demand = phaseEffect('early').demand;
    expect(opening.arrivalsPlanned).toBe(
      arrivalsFor(opening.rating, beds, ADVANCE_BOOKING_DAYS * demand),
    );
    expect(opening.arrivalsPlanned).toBeGreaterThan(later.arrivalsPlanned);
  });

  it('counts the guests the beds could not take', () => {
    const { state } = stateOf(false);
    const beds = bedsOn(state.guests);
    runDay(state, 1);
    const wanted = bookingsWanted(state.rating, beds);
    expect(state.today.turnedAway ?? 0).toBe(Math.max(0, wanted - beds.free));
    expect(wanted).toBeGreaterThan(beds.free);
  });
});

describe('admitLaterWaves', () => {
  it('leaves the first wave to the check-in and admits the later ones', () => {
    const { state, admitted } = stateOf(true);
    admitLaterWaves(state, nowAt(CHECK_IN_TICK), 1);
    expect(admitted).toEqual([]);
    admitLaterWaves(state, nowAt(ARRIVAL_WAVES[1]!.tick), 1);
    expect(admitted.length).toBeGreaterThan(0);
  });
});

const partiesOf = (state: ArrivalsState): readonly string[] =>
  state.newcomers.map((index) => {
    const { kind, family, members } = state.guests.parties[index]!;
    const first = members[0]!;
    return `${kind} ${family} x${members.length} home ${state.guests.home[first]} for ${state.guests.nights[first]}`;
  });

describe('runDay with no group booked', () => {
  // Recorded before group bookings existed: the offer stream must never leak into the arrivals.
  it('admits the same parties, draw for draw', () => {
    const { state } = stateOf(true);
    state.season = firstSeason(0);
    runDay(state, 10);
    admitWave(state, 10, 1);
    admitWave(state, 10, 2);
    expect({
      parties: partiesOf(state),
      planned: state.arrivalsPlanned,
      next: state.arrivals.state(),
    }).toMatchInlineSnapshot(`
      {
        "next": 1511859836,
        "parties": [
          "family Casals x5 home 0 for 8",
        ],
        "planned": 5,
      }
    `);
  });
});

const groupOffer = (over: Partial<Offer> = {}): Offer => ({
  id: 1,
  operator: 'Sunshine Tours',
  kind: 'family',
  parties: 2,
  arrivesOn: 3,
  nights: 5,
  premium: 0.3,
  promisedStars: 4,
  bonusShare: 0.3,
  requirements: [],
  expiresOn: 2,
  ...over,
});

const bookedWith = (offer: Offer): BookingsState =>
  accept(offered(createBookings(), offer, 9), offer.id).state;

describe('runDay with a group booked', () => {
  it('checks the group in first, for its nights, and shrinks the ordinary arrivals', () => {
    // Fewer free beds than the opening morning's advance bookings want.
    const tight = () => {
      const { state } = stateOf(true);
      state.season = firstSeason(0);
      state.guests.freeBeds.set([6, 6]);
      return state;
    };
    const plain = tight();
    runDay(plain, 0);
    const state = tight();
    state.bookings = bookedWith(groupOffer({ arrivesOn: 0 }));
    runDay(state, 0);
    const [first, second] = state.newcomers;
    expect(state.bookings.partyOf.get(first!)).toBe(1);
    expect(state.bookings.partyOf.get(second!)).toBe(1);
    for (const party of [first!, second!]) {
      const { kind, members } = state.guests.parties[party]!;
      expect(kind).toBe('family');
      expect(state.guests.nights[members[0]!]).toBe(5);
    }
    expect(state.bookings.accepted[0]).toMatchObject({ state: 'staying', arrived: 2 });
    expect(state.bookings.accepted[0]!.expected).toBeGreaterThan(0);
    expect(state.arrivalsPlanned).toBeLessThan(plain.arrivalsPlanned);
  });

  it('turns away the parties the beds cannot take, and the booking fails at the door', () => {
    const { state } = stateOf(true);
    state.season = firstSeason(0);
    state.bookings = bookedWith(groupOffer({ parties: 12 }));
    runDay(state, 3);
    const [booking] = state.bookings.accepted;
    expect(booking!.arrived).toBeGreaterThan(0);
    expect(booking!.turnedAway).toBeGreaterThan(0);
    expect(booking!.arrived + booking!.turnedAway).toBe(12);
    expect(state.today.turnedAway ?? 0).toBeGreaterThan(0);
    expect(demandOn(state.bookings, 3)).toBeCloseTo(0.9);
  });

  it('has every booked guest complain of a promise the resort did not keep', () => {
    const { state, admitted } = stateOf(true);
    state.season = firstSeason(0);
    state.bookings = bookedWith(groupOffer({ requirements: [{ kind: 'flag', value: 'stage' }] }));
    runDay(state, 3);
    const booked = admitted
      .map(([person]) => person)
      .filter((person) => state.bookings.partyOf.has(state.guests.party[person]!));
    expect(booked.length).toBeGreaterThan(0);
    for (const person of booked) expect(stayCount(state.thoughts, person, 'promised')).toBe(1);
    expect(state.thoughtDay.get('promised|a stage')?.count).toBe(booked.length);
  });
});

const stageVenue = (key: string, capacity: number): Venue =>
  ({ key, id: key.split('#')[0], label: key, role: 'activity', capacity, stage: true }) as Venue;

describe('runDay with a wedding booked', () => {
  const wedding = (
    venues: readonly Venue[] = [],
    constructing: ReadonlyMap<string, number> = new Map(),
  ) => {
    const state: ArrivalsState = { ...stateOf(true).state, venues, constructing };
    state.season = firstSeason(0);
    state.bookings = bookedWith(
      groupOffer({ kind: 'wedding', parties: 3, requirements: [{ kind: 'flag', value: 'stage' }] }),
    );
    return state;
  };

  it('holds the ceremony the next afternoon, on the biggest stage standing', () => {
    const state = wedding([stageVenue('kids-club#1', 20), stageVenue('stage-plaza#2', 80)]);
    runDay(state, 3);
    expect(ceremonyOf(state.events.programme, 1)).toMatchObject({
      kind: 'wedding',
      site: { kind: 'stage', venue: 'stage-plaza#2' },
      repeat: { every: 'once', day: 4 },
      start: 15 * 60,
      group: 1,
    });
    expect(occurrencesOn(state.events.programme, 3)).toEqual([]);
  });

  it('holds none on a stage still building, or with no stage at all', () => {
    const building = wedding(
      [stageVenue('stage-plaza#2', 80)],
      new Map([['stage-plaza#2', 4 * TICKS_PER_DAY]]),
    );
    runDay(building, 3);
    expect(building.events.programme.bookings).toEqual([]);
    const bare = wedding();
    runDay(bare, 3);
    expect(bare.events.programme.bookings).toEqual([]);
  });

  it('holds none for a group turned away at the door', () => {
    const state = wedding([stageVenue('stage-plaza#2', 80)]);
    state.open = false;
    runDay(state, 3);
    expect(state.events.programme.bookings).toEqual([]);
  });

  it('takes the ceremony off the programme once the group has settled', () => {
    const state = wedding([stageVenue('stage-plaza#2', 80)]);
    runDay(state, 3);
    const resort = {
      bookings: state.bookings,
      ledger: createLedger('tycoon', 0),
      events: state.events,
    };
    const parties = [...state.bookings.accepted[0]!.staying];
    bookedPartyLeft(resort, parties[0]!, 4, 4);
    expect(ceremonyOf(resort.events.programme, 1)).not.toBeNull();
    for (const party of parties.slice(1)) bookedPartyLeft(resort, party, 4, 4);
    expect(resort.bookings.settled[0]?.id).toBe(1);
    expect(resort.events.programme.bookings).toEqual([]);
  });
});
