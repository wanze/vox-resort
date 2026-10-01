import { it } from 'vitest';
import { ORIGINAL_TYPES, venueOf } from '../src/features/catalog/domain/objectTypes';
import { seatSiteOf } from '../src/features/catalog/domain/placementFacts';
import {
  createCrowd,
  isWaiting,
  MAX_STEP,
  stepCrowd,
  takeOffPlot,
  type Crowd,
} from '../src/features/crowd/domain/crowd';
import { crowdSizeFor } from '../src/features/crowd/domain/crowdSize';
import { seatSpotsFor } from '../src/features/crowd/domain/seating';
import { walkNetworkFor, type WalkNetwork } from '../src/features/crowd/domain/walkNetwork';
import {
  bedCount,
  checkOutParty,
  createGuests,
  homelessCount,
  presentCount,
  unmadeCount,
  type Guests,
} from '../src/features/guests/domain/guests';
import { elevationFor, levelAt } from '../src/features/layout/domain/elevation';
import { createRandom } from '../src/features/layout/domain/random';
import { clampParams, generateResort } from '../src/features/layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../src/features/layout/domain/resortLayout';
import { shoreFor } from '../src/features/layout/domain/shoreline';
import {
  arrivalsDueBy,
  CHECK_IN_TICK,
  checkInDue,
  freeBedsOn,
  runCheckIn,
  wavesDue,
} from '../src/features/sim/domain/checkIn';
import { crowdScaleFor } from '../src/features/sim/domain/crowdRate';
import { demandFor, type DemandLine } from '../src/features/sim/domain/demand';
import { gatewaysOn } from '../src/features/sim/domain/gateways';
import { ageHappiness, createHappiness, meanHappiness } from '../src/features/sim/domain/happiness';
import { lodgingsOn } from '../src/features/sim/domain/lodgings';
import {
  createNeeds,
  decayNeeds,
  strongestNeed,
  type Needs,
} from '../src/features/sim/domain/needs';
import { arrivalsFor, ratingFor } from '../src/features/sim/domain/rating';
import { reviewFor } from '../src/features/sim/domain/reviews';
import { createRouter, type Router } from '../src/features/sim/domain/router';
import { SPEED_DAY_SECONDS, TICKS_PER_DAY } from '../src/features/sim/domain/simClock';
import {
  createDay,
  createThoughts,
  loudest,
  tallyInto,
  think,
} from '../src/features/sim/domain/thoughts';
import { createUpkeep } from '../src/features/sim/domain/upkeep';
import { venuesOn, type Venue } from '../src/features/sim/domain/venues';

const [TILES_X, TILES_Z] = (process.env.SIM_PLOT ?? '112x100').split('x').map(Number) as [
  number,
  number,
];
const SEED = Number(process.env.SIM_SEED ?? 1);
const DAYS = Number(process.env.SIM_DAYS ?? 2);

// The frames a normal-speed tick runs, so walks take as long as they do in the app.
const FRAMES_PER_TICK = Math.round(
  (crowdScaleFor('normal') * SPEED_DAY_SECONDS.normal) / TICKS_PER_DAY / MAX_STEP,
);

const OPENS_AT = 8 * 60;
const HOUR = 60;
const LOUNGERS_LOOKED_AT = 16 * HOUR;

const TYPES = ORIGINAL_TYPES.map((type) => ({
  id: type.id,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  category: type.category,
  placement: type.model.placement,
}));

const ITEMS: LayoutItem[] = ORIGINAL_TYPES.map((type) => ({
  id: type.id,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  width: type.model.width,
  depth: type.model.depth,
  category: type.category,
  doors: type.venue?.doors ?? [],
}));

const hourOf = (tick: number): number => Math.floor((tick % TICKS_PER_DAY) / HOUR);

function plotOf() {
  const plan = generateResort(
    TYPES,
    clampParams({ tilesX: TILES_X, tilesZ: TILES_Z, seed: SEED, density: 0.7 }),
  );
  const layout = layoutResort(ITEMS, plan);
  const elevation = elevationFor(plan);
  const standing = [...layout.placements, ...layout.props];
  const network = walkNetworkFor({
    paved: layout.paths,
    levelOf: (x, z) => levelAt(elevation, x, z),
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
    obstacles: standing,
    seats: seatSpotsFor(standing.map(seatSiteOf)),
  });
  const homes = layout.placements
    .map((placement) => ({ placement, venue: venueOf(placement.id) }))
    .filter(({ venue }) => venue?.role === 'lodging' && (venue.beds ?? 0) > 0)
    .map(({ placement, venue }) => ({
      key: placement.key,
      id: placement.id,
      label: placement.id,
      beds: venue!.beds!,
    }))
    .toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key));
  return { layout, network, homes, population: crowdSizeFor(layout.paths.length) };
}

interface BeachNow {
  onLounger: number;
  onSand: number;
  walkingOnSand: number;
  headingThere: number;
}

function beachNow(guests: Guests, router: Router, crowd: Crowd): BeachNow {
  const now = { onLounger: 0, onSand: 0, walkingOnSand: 0, headingThere: 0 };
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1 || router.isAsleep(person)) continue;
    const stay = router.stayOf(person);
    if (stay === 'resting' && isWaiting(crowd, person)) {
      if (crowd.seat[person]! >= 0) now.onLounger++;
      else now.onSand++;
    } else if (stay === 'arriving' || stay === 'leaving') {
      now.walkingOnSand++;
    } else if (router.goalOf(person)?.label === 'Beach' && router.visitOf(person) === null) {
      now.headingThere++;
    }
  }
  return now;
}

// Every lounger a pitch promised, by what its holder is doing: an empty one is the gap to close.
function loungerStates(guests: Guests, router: Router, crowd: Crowd): Map<string, number> {
  const saved = router.snapshot();
  const holders = new Map<string, number>();
  for (let person = 0; person < guests.count; person++) {
    if (saved.stays[person]! >= 0)
      holders.set(`${saved.stays[person]}:${saved.spotOf[person]}`, person);
  }
  const states = new Map<string, number>();
  const count = (state: string) => states.set(state, (states.get(state) ?? 0) + 1);
  saved.claims.forEach((claim, id) =>
    claim.pitch.spots.forEach((spot, index) => {
      if (spot.seat < 0) return;
      const holder = holders.get(`${id}:${index}`);
      if (holder === undefined) count('reserved, holder never came');
      else if (crowd.seat[holder] === spot.seat) count('lying on it');
      else if (router.stayOf(holder) === 'arriving') count('holder walking to it');
      else count(`holder on an errand to ${router.goalOf(holder)?.label ?? 'nowhere'}`);
    }),
  );
  return states;
}

function freeLoungers(network: WalkNetwork, crowd: Crowd): number {
  return network.beachSeats.filter((seat) => crowd.seatBy[seat] === -1).length;
}

const ranked = (tally: ReadonlyMap<string, number>): string =>
  [...tally]
    .toSorted((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');

const percentile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

const DEMAND_LINES: readonly DemandLine[] = [
  'beds',
  'energy',
  'hunger',
  'thirst',
  'fun',
  'hygiene',
  'health',
];

// The facts the showcase counts, less what the bars do not read: nothing here breaks or shuts.
function demandNow(guests: Guests, needs: Needs, router: Router, venues: readonly Venue[]): string {
  const wanting = { hunger: 0, thirst: 0, energy: 0, fun: 0, hygiene: 0, health: 0 };
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    const want = strongestNeed(needs, guests, person);
    if (want) wanting[want.need]++;
  }
  const demand = demandFor({
    venues,
    lodgings: [],
    present: presentCount(guests),
    homeless: homelessCount(guests),
    bedsFree: freeBedsOn(guests),
    bedsTotal: bedCount(guests).beds,
    bedsUnmade: unmadeCount(guests),
    wanting,
    balks: router.dayBalks(),
    visits: router.dayVisits(),
    unreachable: new Set(),
    cleanliness: new Map(),
  });
  return DEMAND_LINES.map((line) => `${line} ${demand.lines[line].pressure.toFixed(2)}`).join(', ');
}

it('reports a few days on a generated plot', () => {
  const { layout, network, homes, population } = plotOf();
  const venues = venuesOn(layout.placements);
  const guests = createGuests({ count: population, homes, variants: 4, childVariant: 3, seed: 7 });
  const needs = createNeeds(guests, 13);
  const happiness = createHappiness(population);
  const thoughts = createThoughts(population);
  // Nobody cleans here, so it is reset every hour: this reports the guests, not the staff.
  const upkeep = createUpkeep(venues.length);
  let heard = createDay();
  let tick = OPENS_AT;
  const stars: number[] = [];

  let crowd: Crowd | null = null;
  const router: Router = createRouter({
    guests,
    needs,
    venues,
    lodgings: lodgingsOn(layout.placements),
    gateways: gatewaysOn(layout.placements),
    network,
    onLeave: (person) => {
      const party = guests.party[person]!;
      const members = guests.parties[party]!.members.filter(
        (member) => guests.present[member] === 1 && guests.party[member] === party,
      );
      if (members.length > 0) {
        const review = reviewFor({
          thoughts,
          members,
          spokesperson: members[0]!,
          party,
          family: '',
          partyKind: guests.parties[party]!.kind,
          name: '',
          nights: guests.nights[members[0]!]!,
          happiness: (member) => happiness.stay[member]!,
        });
        stars.push(review.stars);
      }
      for (const member of checkOutParty(guests, party)) {
        router.forget(member);
        takeOffPlot(crowd!, member, crowd!.x[member]!, crowd!.y[member]!, crowd!.z[member]!);
      }
    },
    onThought: (person, kind, subject) => {
      if (think(thoughts, person, kind, subject, tick)) tallyInto(heard, kind, subject);
    },
    tickOfDay: () => tick % TICKS_PER_DAY,
    crowd: () => crowd!,
    upkeep: () => upkeep,
    seed: 19,
  });
  crowd = createCrowd({
    network,
    count: population,
    variants: 4,
    seed: 4,
    routeOf: (person, at) => router.step(person, at),
    offTheSand: (person) => router.offTheSand(person),
    roamsBeach: false,
  });
  for (let person = 0; person < population; person++) {
    if (guests.present[person] === 1) continue;
    takeOffPlot(crowd, person, crowd.x[person]!, crowd.y[person]!, crowd.z[person]!);
  }

  console.log(
    `Plot ${TILES_X}x${TILES_Z} seed ${SEED}: ${population} guests, ${bedCount(guests).beds} beds, ` +
      `${venues.length} venues, ${network.beachSeats.length} loungers, ${network.gates.length} gate tiles onto the beach`,
  );

  const arrivals = createRandom(41);
  let rating = ratingFor({ happiness: null, present: 0, housed: 0 });
  let planned = 0;
  let admitted = 0;
  const setOffAt = new Int32Array(population).fill(-1);
  const trips: number[] = [];
  let changedMind = 0;

  // Through the last day's check-in, where its summary is printed.
  for (const end = DAYS * TICKS_PER_DAY + CHECK_IN_TICK; tick <= end; tick++) {
    for (let frame = 0; frame < FRAMES_PER_TICK; frame++) stepCrowd(crowd, MAX_STEP);
    decayNeeds(needs, guests, 1, undefined, (person) => router.isAsleep(person));
    router.tick(tick);
    ageHappiness(happiness, needs, guests, (person) => router.isWaitingAt(person), 1);
    if (tick % HOUR === 0) upkeep.level.fill(1);

    for (let person = 0; person < population; person++) {
      const toBeach = router.goalOf(person)?.label === 'Beach' && router.visitOf(person) === null;
      if (toBeach && setOffAt[person] === -1) setOffAt[person] = tick;
      if (toBeach || setOffAt[person] === -1) continue;
      if (router.visitOf(person)?.venue.label === 'Beach') trips.push(tick - setOffAt[person]!);
      else changedMind++;
      setOffAt[person] = -1;
    }

    const day = Math.floor(tick / TICKS_PER_DAY);
    if (checkInDue(tick, tick)) {
      const beds = bedCount(guests);
      rating = ratingFor({
        happiness: meanHappiness(happiness, guests),
        present: presentCount(guests),
        housed: beds.taken,
      });
      if (day > 0) {
        const visits = new Map<string, number>();
        for (const [key, count] of router.dayVisits()) {
          const id = key.split('#')[0]!;
          visits.set(id, (visits.get(id) ?? 0) + count);
        }
        const sorted = trips.toSorted((a, b) => a - b);
        const said = loudest(heard, 5).map(
          (each) => `${each.kind} ${each.subject ?? ''} ${each.count}`,
        );
        console.log(
          [
            `Day ${day - 1} ends: ${rating.stars} stars, mean mood ${rating.happiness.toFixed(2)}`,
            `  visits: ${ranked(visits)}`,
            `  walks to the beach: ${sorted.length}, median ${percentile(sorted, 0.5)} min, ` +
              `p90 ${percentile(sorted, 0.9)} min; ${changedMind} changed their mind`,
            `  loudest thoughts: ${said.join(', ') || 'none'}`,
            `  demand: ${demandNow(guests, needs, router, venues)}`,
          ].join('\n'),
        );
      }
      trips.length = 0;
      changedMind = 0;
      router.forgetTheDay();
      heard = createDay();
      planned = arrivalsFor(rating, freeBedsOn(guests));
      admitted = 0;
      for (let person = 0; person < guests.count; person++) {
        if (guests.present[person] !== 1) continue;
        if (guests.arrivedOn[person]! + guests.nights[person]! >= day) continue;
        router.sendHome(person);
      }
    }
    for (const wave of wavesDue(tick, tick)) {
      const arrived = runCheckIn({
        guests,
        needs,
        happiness,
        rating,
        day,
        random: arrivals,
        room: arrivalsDueBy(planned, wave) - admitted,
      });
      admitted += arrived.length;
      for (const person of arrived) router.admit(person, router.arrivalNode);
    }

    const hour = hourOf(tick);
    if (tick % HOUR !== 0 || hour < 9 || hour > 20) continue;
    const beach = beachNow(guests, router, crowd);
    console.log(
      `  ${String(hour).padStart(2)}:00  on loungers ${beach.onLounger}, on sand ${beach.onSand}, ` +
        `walking the sand ${beach.walkingOnSand}, heading there ${beach.headingThere}, ` +
        `free loungers ${freeLoungers(network, crowd)}`,
    );
    if (tick % TICKS_PER_DAY === LOUNGERS_LOOKED_AT) {
      console.log(`         loungers: ${ranked(loungerStates(guests, router, crowd))}`);
    }
  }
  console.log(
    `Reviews, 1 to 5 stars: ${[1, 2, 3, 4, 5].map((each) => stars.filter((star) => star === each).length).join(' / ')}`,
  );
});
