import { type Crowd, createCrowd, takeOffPlot } from '../../crowd/domain/crowd';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import {
  type EventsState,
  type PartyRuns,
  createEvents,
  createPartyRuns,
} from '../../events/domain/eventRuns';
import {
  BUILT_INS,
  type EventSite,
  type Occurrence,
  withBuiltIns,
} from '../../events/domain/programme';
import { stageKeysOf } from '../../events/domain/sites';
import { stageRank } from '../../events/domain/welcome';
import {
  type Guests,
  bedCount,
  checkOutParty,
  createGuests,
  makeBeds,
  paceOf,
} from '../../guests/domain/guests';
import { type LandRights, rightsOf } from '../../land/domain/landRights';
import { type Random, createRandom } from '../../layout/domain/random';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import type { Shore } from '../../layout/domain/shoreline';
import type { VenueNames } from '../../naming/domain/venueNames';
import { type Footfall, createFootfall } from '../../overlays/domain/overlays';
import type { Plot } from '../../resort-prep/domain/prepareResort';
import { type Breakdowns, createBreakdowns } from '../../sim/domain/breakdowns';
import {
  type DayCounts,
  type DayReport,
  countDeparture,
  countReview,
  startDay,
} from '../../sim/domain/dayReport';
import type { Depot } from '../../sim/domain/depots';
import type { Gateway } from '../../sim/domain/gateways';
import { type Happiness, createHappiness } from '../../sim/domain/happiness';
import { type Ledger, OPENING_BALANCE, createLedger } from '../../sim/domain/ledger';
import { type Carrying, type Litter, createCarrying, createLitter } from '../../sim/domain/litter';
import type { Lodging } from '../../sim/domain/lodgings';
import { type Needs, createNeeds, relieve } from '../../sim/domain/needs';
import { LATE_NIGHT_RELIEF, isBedtime } from '../../sim/domain/night';
import { factorOf, LIST_PRICES, venuePull, type Prices } from '../../sim/domain/pricing';
import { type Rating, ratingFor } from '../../sim/domain/rating';
import { type Review, keepReview } from '../../sim/domain/reviews';
import { type Router, createRouter } from '../../sim/domain/router';
import { type Photos, createPhotos, forgetPhotos } from '../../sim/domain/photos';
import type { SceneryField } from '../../sim/domain/scenery';
import type { ShadeMap } from '../../sim/domain/shade';
import {
  AUTO_HIRING,
  type Hiring,
  type Roster,
  type Staff,
  onDuty,
  rosterFor,
  rosterOf,
  staffPool,
  workplacesOf,
} from '../../sim/domain/staff';
import { type StaffRouter, type StaffZones, createStaffRouter } from '../../sim/domain/staffRouter';
import type { VenueTakings } from '../../sim/domain/takings';
import {
  type ThoughtTally,
  type Thoughts,
  createDay,
  createThoughts,
} from '../../sim/domain/thoughts';
import { type Upkeep, createUpkeep } from '../../sim/domain/upkeep';
import type { Venue } from '../../sim/domain/venues';
import type { Moment, Views } from '../../sim/domain/views';
import type { Weather } from '../../sim/domain/weather';
import { NO_ZONE, type Zones, createZones, zoneAt } from '../../sim/domain/zones';
import { NO_HOSTED } from './eventSteps';
import { NO_MOMENT, photoPause } from './photoSteps';
import type { PlotFacts } from './plotFacts';
import { litterWindowOf, rezone } from './staffing';
import { hear, reviewOfParty, stepLitterAt, visitMade } from './visits';
import { isOutTonight } from './nights';

export interface CrowdHolder {
  readonly crowd: Crowd;
}

export interface SimState {
  readonly plot: Plot;
  readonly crowd: CrowdHolder;
  // A second crowd: a guest's variant indexes the guest models, and HUD counts are about guests.
  readonly staff: CrowdHolder;
  // Rebuilt rather than updated on an edit: its flow fields are indexed by node, and an edit
  // renumbers nodes.
  readonly staffRouter: StaffRouter;
  readonly staffPool: Staff;
  hiring: Hiring;
  // A factor per family on the list price, set on the Prices tab.
  prices: Prices;
  recommended: Roster;
  roster: Roster;
  // Read late by the staff router, so an edit swaps it rather than writing into it.
  duty: Uint8Array;
  // Per tile of the plan, so it survives every edit without being carried; never replaced.
  readonly zones: Zones;
  // Null on a plot that owns all of itself; bought into in place, and saved from here.
  readonly rights: LandRights | null;
  // Dealt afresh by rezone, and read late by the staff router, as the duty is.
  zoneOf: Int8Array;
  venueZones: Int32Array;
  lodgingZones: Int32Array;
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  // Replaced by a load; an edit keeps it, dropping the bookings of a stage pulled down.
  events: EventsState;
  // Per venue, refreshed once a frame, so the staff router's question is an array read.
  eventBooked: Uint8Array;
  eventShowing: Uint8Array;
  // A resident DJ plays while the venue is open: a show with or without an animator. Refreshed
  // with the clock, as the first resort is built before the clock exists.
  djOn: Uint8Array;
  hosted: readonly { readonly venue: number; readonly until: number }[];
  // Per party, the run it is invited to: the router asks per guest per tick.
  invited: PartyRuns;
  // Per party, kept up from noon for tonight's show.
  keen: Uint8Array;
  keenShow: Occurrence | null;
  // Per party, the tick its night out ends, or -1: hashed afresh every hour, so never saved.
  nightOutUntil: Int32Array;
  // Out tonight, but nothing late served them; cleared at check-in.
  readonly homeEarly: Set<number>;
  // Still out at ten, so they wake tired; cleared at check-in.
  readonly nightOwls: Set<number>;
  // Today's runs called off or put off, so nobody is kept up for them; cleared at check-in.
  readonly settled: Set<string>;
  // The lanterns stay on the sand on a fireworks night.
  fireworksNight: boolean;
  // Replaced wholesale on an edit rather than patched, so it cannot drift from what stands.
  venues: readonly Venue[];
  // By key, which a rename keeps, so it is replaced only with the venues on an edit.
  venueIndex: ReadonlyMap<string, number>;
  // The venues as the router lists them, the beach last: where an event can be held.
  siteVenues: readonly Venue[];
  // By key like venueIndex, so the beach, which no venue list holds, is found too.
  siteVenueIndex: ReadonlyMap<string, number>;
  // Only the venues that hire craft out, at their venueIndex, so a hire costs no scan of all.
  rentalVenues: ReadonlyMap<string, number>;
  // Biggest first, sorted once per edit rather than each time the events are asked.
  stages: readonly EventSite[];
  // The owned sand.
  beachTiles: number;
  // Drawn once per venue and carried by key, so building a second bar never renames the first.
  names: VenueNames;
  lodgings: readonly Lodging[];
  // Homes are sorted by beds, lodgings stand in placement order; rebuilt with both on an edit.
  homeOfLodging: Int32Array;
  gateways: readonly Gateway[];
  depots: readonly Depot[];
  // Dirt is carried across by key when venues are replaced, so paving one tile does not scrub the
  // plot.
  upkeep: Upkeep;
  // Carried by key like the dirt, so paving a tile does not mend a broken slide.
  breakdowns: Breakdowns;
  // Replaced on an edit rather than patched: a moved tree takes its reach with it.
  scenery: SceneryField;
  // Replaced on an edit, as the scenery is.
  views: Views;
  // Refreshed once a frame from the clock, so a guest reaching a node reads an object, not the
  // clock.
  moment: Moment;
  // Kept across an edit but for the heat, which is per node.
  readonly photos: Photos;
  // Replaced on an edit, as the scenery is.
  shade: ShadeMap;
  // Kept across an edit, pruned to what is still paved or open sand: planting a hedge does not
  // sweep the plot.
  readonly litter: Litter;
  // Per node, so replaced empty on an edit, which renumbers nodes.
  footfall: Footfall;
  // Per guest body, never replaced: a wrapper in hand outlasts an edit.
  readonly carrying: Carrying;
  // Per guest body too, and forgotten at check-in, when the body becomes somebody else.
  readonly thoughts: Thoughts;
  // Cleared each morning with the router's counters, so the panel speaks for today.
  readonly thoughtDay: Map<string, ThoughtTally>;
  reviews: readonly Review[];
  // From one check-in to the next, as the books run.
  today: DayCounts;
  history: readonly DayReport[];
  // Replaced on an edit, as the scenery is.
  binCover: Uint8Array;
  unreachable: ReadonlySet<string>;
  rating: Rating;
  // Gates arrivals only: a closed resort still rates and says goodbye to the guests it has.
  open: boolean;
  // Sized once a day by the rating and let in over the waves. A wave nobody could come in is
  // counted as admitted, so its share is not carried into the next one.
  arrivalsPlanned: number;
  arrivalsAdmitted: number;
  // The parties checked in since the last 11:00 check-in, so yesterday's until then, for an event
  // that calls latecomers.
  newcomers: number[];
  // Per resort: two plots must not share a sequence.
  arrivals: Random;
  ledger: Ledger;
  readonly takings: VenueTakings;
  beds: { readonly total: number; readonly taken: number };
  // Rebuilt rather than updated on an edit: its flow fields are indexed by node, and an edit
  // renumbers nodes.
  readonly router: Router;
  readonly plan: ResortPlan;
  readonly shore: Shore | null;
}

// Fixed so a run replays, and one per draw so retuning one never reshuffles another.
const CROWD_SEED = 1;

const GUEST_SEED = 5;

const NEEDS_SEED = 6;

const DWELL_SEED = 7;

const ARRIVALS_SEED = 8;

const STAFF_SEED = 9;

type KeptFacts = Pick<
  SimState,
  | 'names'
  | 'venues'
  | 'siteVenues'
  | 'beachTiles'
  | 'lodgings'
  | 'homeOfLodging'
  | 'gateways'
  | 'depots'
  | 'scenery'
  | 'views'
  | 'shade'
  | 'binCover'
  | 'unreachable'
  | 'venueIndex'
  | 'siteVenueIndex'
  | 'rentalVenues'
  | 'stages'
>;

// One list for the first build and every edit, so neither can forget a fact the other keeps.
export const keptFactsOf = (facts: PlotFacts): KeptFacts => ({
  names: facts.names,
  venues: facts.venues,
  siteVenues: facts.siteVenues,
  beachTiles: facts.beachTiles,
  lodgings: facts.lodgings,
  homeOfLodging: facts.homeOfLodging,
  gateways: facts.gateways,
  depots: facts.depots,
  scenery: facts.scenery,
  views: facts.views,
  shade: facts.shade,
  binCover: facts.binCover,
  unreachable: facts.unreachable,
  venueIndex: facts.venueIndex,
  siteVenueIndex: facts.siteVenueIndex,
  rentalVenues: facts.rentalVenues,
  stages: facts.stages,
});

// A party no lodging could take starts away, but createCrowd deals every body onto the paving.
function keepAwayOffThePlot(guests: Guests, crowd: Crowd): void {
  for (let person = 0; person < crowd.count; person++) {
    if (guests.present[person] === 1) continue;
    takeOffPlot(crowd, person, crowd.x[person]!, crowd.y[person]!, crowd.z[person]!);
  }
}

const liveRightsOf = (plan: ResortPlan): LandRights | null =>
  plan.land ? rightsOf(plan.land) : null;

export interface SimParts {
  readonly plan: ResortPlan;
  readonly plot: Plot;
  readonly shore: Shore | null;
  readonly facts: PlotFacts;
  readonly population: number;
  readonly away: boolean;
  readonly guestVariants: number;
  readonly childVariant: number;
  readonly staffVariants: number;
  // Late-bound: the first resort is built before the clock is.
  readonly clock: {
    readonly ticks: () => number;
    readonly tickOfDay: () => number;
    readonly weather: () => Weather;
    // Off while the clock is paused, which is how a bench runs, so its scenes replay unchanged;
    // absent, nobody stops for a photo.
    readonly photosOn?: () => boolean;
  };
}

function guestsOf(parts: SimParts) {
  const { population, facts } = parts;
  const guests = createGuests({
    count: population,
    homes: facts.homes,
    variants: parts.guestVariants,
    childVariant: parts.childVariant,
    seed: GUEST_SEED,
    away: parts.away,
  });
  return {
    guests,
    needs: createNeeds(guests, NEEDS_SEED),
    happiness: createHappiness(population),
    arrivals: createRandom(ARRIVALS_SEED),
    carrying: createCarrying(population),
  };
}

function staffOf(venues: readonly Venue[], network: WalkNetwork, lodgings: readonly Lodging[]) {
  // The pool is meshed once per resort; the roster follows the plot, putting bodies on and off it.
  const employed = staffPool();
  const recommended = rosterFor(workplacesOf(venues, network.posts, lodgings));
  const roster = rosterOf(AUTO_HIRING, recommended);
  return { employed, recommended, roster, duty: onDuty(employed, roster) };
}

function eventsOf(population: number, venues: readonly Venue[]): EventsState {
  const events = createEvents(population);
  events.programme = withBuiltIns(
    events.programme,
    BUILT_INS,
    stageKeysOf(venues),
    stageRank(venues),
  );
  return events;
}

// The routers' callbacks read the state, never a crowd or a list of their own: a relocate, a load
// and an edit replace those on it.
export function createSimState(parts: SimParts): SimState {
  const { plan, plot, facts, population, clock } = parts;
  const { network, venues, lodgings } = facts;
  const { guests, needs, happiness, arrivals, carrying } = guestsOf(parts);
  const upkeep = createUpkeep(venues.length);
  const breakdowns = createBreakdowns(venues.length);
  const litter = createLitter(plan.tilesX, plan.tilesZ);
  const beds = bedCount(guests);
  const router = createRouter({
    guests,
    needs,
    venues,
    lodgings,
    gateways: facts.gateways,
    network,
    onLeave: (person) => {
      const party = guests.party[person]!;
      // Before check-out, which clears who was here.
      const review = reviewOfParty(resort, party);
      if (review) {
        resort.reviews = keepReview(resort.reviews, review);
        resort.today = countReview(resort.today, review.stars);
      }
      const left = checkOutParty(guests, party, true);
      resort.today = countDeparture(resort.today, left.length);
      const people = resort.crowd.crowd;
      for (const member of left) {
        // Every member: a visit left standing would walk an empty body out of the door.
        router.forget(member);
        forgetPhotos(resort.photos, member);
        takeOffPlot(people, member, people.x[member]!, people.y[member]!, people.z[member]!);
      }
    },
    tickOfDay: clock.tickOfDay,
    weather: clock.weather,
    // Safe: the crowd is built on the next statement, and nothing calls the router before a frame.
    crowd: () => resort.crowd.crowd,
    // Late-bound: an edit replaces the upkeep, and a stale one would soil venues that no longer
    // stand.
    upkeep: () => resort.upkeep,
    breakdowns: () => resort.breakdowns,
    shade: () => resort.shade,
    // The synthetic beach is past the venue list, and an unknown id is at list price.
    priceAppeal: (venue) => venuePull(factorOf(resort.prices, resort.venues[venue]?.id ?? '')),
    // A hash, not the router's stream: a draw from it would move every seeded scene after it.
    onVisited: (person, venue) => visitMade(resort, person, venue, clock.ticks()),
    onThought: (person, kind, subject) => hear(resort, clock.ticks(), person, kind, subject),
    upLate: (party) =>
      resort.invited.end[party]! >= 0 ||
      resort.keen[party] === 1 ||
      isOutTonight(resort, party, clock.ticks()),
    // An invited or keen party is the event's, and chooses as it always did.
    outLate: (party) =>
      isOutTonight(resort, party, clock.ticks()) &&
      isBedtime(party, clock.tickOfDay()) &&
      resort.invited.end[party]! < 0 &&
      resort.keen[party] !== 1,
    onNightOver: (party) => resort.homeEarly.add(party),
    eventStay: (person, venue) => {
      const party = guests.party[person]!;
      return resort.invited.venue[party] === venue ? resort.invited.end[party]! : -1;
    },
    onWoke: (person) => {
      const party = guests.party[person]!;
      if (resort.events.tired.has(party) || resort.nightOwls.has(party)) {
        relieve(needs, person, LATE_NIGHT_RELIEF);
      }
    },
    seed: DWELL_SEED,
  });
  const crowd = createCrowd({
    network,
    count: population,
    variants: parts.guestVariants,
    variantOf: (i) => guests.variant[i] ?? 0,
    routeOf: (person, at) => {
      stepLitterAt(resort, person, at);
      return router.step(person, at);
    },
    offTheSand: (person) => router.offTheSand(person),
    paceOf: (i) => paceOf(guests, i),
    pausesAt: (person, node) =>
      clock.photosOn?.() === true ? photoPause(resort, person, node, clock.ticks()) : null,
    roamsBeach: false,
    seed: CROWD_SEED,
  });
  keepAwayOffThePlot(guests, crowd);
  const { employed, recommended, roster, duty } = staffOf(venues, network, lodgings);
  // Getters, so the router reads the latest deal without an object built per question.
  const staffZones: StaffZones = {
    get zoneOf() {
      return resort.zoneOf;
    },
    get venueZones() {
      return resort.venueZones;
    },
    get lodgingZones() {
      return resort.lodgingZones;
    },
    tileZone: (tileX, tileZ) => zoneAt(resort.zones, tileX, tileZ),
  };
  // Built once: the guests and the lodging map are read through the resort, which a load and an
  // edit replace.
  const housekeeping = {
    unmadeAt: (lodging: number) => resort.guests.unmade[resort.homeOfLodging[lodging] ?? -1] ?? 0,
    make: (lodging: number, most: number) => {
      makeBeds(resort.guests, resort.homeOfLodging[lodging] ?? -1, most);
    },
  };
  const staffRouter = createStaffRouter({
    staff: employed,
    venues,
    network,
    upkeep: () => resort.upkeep,
    breakdowns: () => resort.breakdowns,
    crowd: () => resort.staff.crowd,
    weather: clock.weather,
    tickOfDay: clock.tickOfDay,
    duty: () => resort.duty,
    litter: () => resort.litter,
    litterWindow: () => litterWindowOf(resort),
    // Asked only when a show or a watch is picked, so the lookup by key costs nothing per tick.
    occupants: (venue) => resort.router.occupancyOf(resort.venues[venue]!.key)?.inside ?? 0,
    zones: () => staffZones,
    lodgings,
    beds: () => housekeeping,
    depots: facts.depots,
    supplyNode: () => resort.router.arrivalNode,
    onClockedOff: (worker) => {
      const workers = resort.staff.crowd;
      takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
    },
    booked: (venue) => resort.eventBooked[venue] === 1,
    hosting: () => resort.hosted,
    seed: STAFF_SEED,
  });
  const workers = createCrowd({
    network,
    count: employed.count,
    variants: parts.staffVariants,
    variantOf: (worker) => employed.variant[worker] ?? 0,
    routeOf: (worker, at) => staffRouter.step(worker, at),
    roamsBeach: false,
    seed: STAFF_SEED,
  });
  for (let worker = 0; worker < employed.count; worker++) {
    if (duty[worker] === 1) continue;
    takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
  }
  // A plot with no paving is a building site; a generated one is a resort already running,
  // and the benchmark must see it running.
  const building = plot.layout.paths.length === 0;

  const resort: SimState = {
    plan,
    plot,
    crowd: { crowd },
    staff: { crowd: workers },
    staffRouter,
    staffPool: employed,
    hiring: AUTO_HIRING,
    prices: LIST_PRICES,
    recommended,
    roster,
    duty,
    zones: createZones(plan.tilesX, plan.tilesZ),
    rights: liveRightsOf(plan),
    zoneOf: new Int8Array(employed.count).fill(NO_ZONE),
    venueZones: new Int32Array(venues.length),
    lodgingZones: new Int32Array(lodgings.length),
    guests,
    needs,
    happiness,
    events: eventsOf(population, venues),
    eventBooked: new Uint8Array(venues.length),
    eventShowing: new Uint8Array(venues.length),
    djOn: new Uint8Array(venues.length),
    hosted: NO_HOSTED,
    invited: createPartyRuns(guests.parties.length),
    keen: new Uint8Array(guests.parties.length),
    keenShow: null,
    nightOutUntil: new Int32Array(guests.parties.length).fill(-1),
    homeEarly: new Set(),
    nightOwls: new Set(),
    settled: new Set(),
    fireworksNight: false,
    ...keptFactsOf(facts),
    upkeep,
    breakdowns,
    litter,
    footfall: createFootfall(network.nodes.length),
    moment: NO_MOMENT,
    photos: createPhotos(population, network.nodes.length),
    carrying,
    thoughts: createThoughts(population),
    thoughtDay: createDay(),
    reviews: [],
    // Every resort is built on a clock restarted at day 0, and a load restores its own counts.
    today: startDay(0),
    history: [],
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    open: !building,
    arrivalsPlanned: 0,
    arrivalsAdmitted: 0,
    newcomers: [],
    beds: { total: beds.beds, taken: beds.taken },
    router,
    arrivals,
    ledger: createLedger('sandbox', OPENING_BALANCE.sandbox),
    takings: new Map(),
    shore: parts.shore,
  };
  rezone(resort);
  return resort;
}
