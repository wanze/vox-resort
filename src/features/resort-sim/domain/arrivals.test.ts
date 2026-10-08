import { describe, expect, it } from 'vitest';
import { createEvents } from '../../events/domain/eventRuns';
import { createGuests, presentCount } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { arrivalsDueBy, ARRIVAL_WAVES, bedsOn, CHECK_IN_TICK } from '../../sim/domain/checkIn';
import { startDay } from '../../sim/domain/dayReport';
import { createHappiness } from '../../sim/domain/happiness';
import { createCarrying } from '../../sim/domain/litter';
import { createNeeds } from '../../sim/domain/needs';
import { arrivalsFor, ratingFor } from '../../sim/domain/rating';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { createThoughts } from '../../sim/domain/thoughts';
import { admitLaterWaves, admitWave, runDay, sendDepartures, type ArrivalsState } from './arrivals';
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
    events: createEvents(guests.count),
    homeEarly: new Set(),
    nightOwls: new Set(),
    carrying: createCarrying(guests.count),
    thoughts: createThoughts(guests.count),
    today: startDay(0),
    rating: ratingFor({ happiness: 1, present: 1, housed: 1, cleanliness: 1 }),
    open: true,
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
