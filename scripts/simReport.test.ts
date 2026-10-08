import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import referenceJson from '../fixtures/reference-resort.json';
import { GUEST_NEEDS, type GuestNeed } from '../voxel-gen/voxelgen.ts';
import { ORIGINAL_TYPES } from '../src/features/catalog/domain/objectTypes';
import { buildCostOf } from '../src/features/catalog/domain/prices';
import { isWaiting, takeOffPlot, type Crowd } from '../src/features/crowd/domain/crowd';
import { crowdSizeFor, crowdSizeForOwned } from '../src/features/crowd/domain/crowdSize';
import type { WalkNetwork } from '../src/features/crowd/domain/walkNetwork';
import {
  bedCount,
  checkOutParty,
  homelessCount,
  presentCount,
  unmadeCount,
  type Guests,
} from '../src/features/guests/domain/guests';
import { clampParams, generateResort } from '../src/features/layout/domain/resortGenerator';
import {
  layoutResort,
  type LayoutItem,
  type Placement,
} from '../src/features/layout/domain/resortLayout';
import type { ResortPlan } from '../src/features/layout/domain/resortPlan';
import { ownedArea } from '../src/features/land/domain/landRights';
import type { Plot } from '../src/features/resort-prep/domain/prepareResort';
import { referenceWorldOf } from '../src/features/resort-prep/domain/referenceResort';
import { planOfWorld, type SavedWorld } from '../src/features/resort-prep/domain/savedWorld';
import { createHeadlessGame, framesPerTickAt } from '../src/features/resort-sim/domain/headless';
import type { SimNow } from '../src/features/resort-sim/domain/simNow';
import { CHECK_IN_TICK, freeBedsOn } from '../src/features/sim/domain/checkIn';
import { demandFor, type DemandLine } from '../src/features/sim/domain/demand';
import { createLedger, netOf, OPENING_BALANCE } from '../src/features/sim/domain/ledger';
import { strongestNeed, type Needs } from '../src/features/sim/domain/needs';
import type { Review } from '../src/features/sim/domain/reviews';
import type { Router } from '../src/features/sim/domain/router';
import { TICKS_PER_DAY, type SimSpeed } from '../src/features/sim/domain/simClock';
import { wagesFor } from '../src/features/sim/domain/staff';
import { maintenanceFor } from '../src/features/sim/domain/takings';
import { loudest } from '../src/features/sim/domain/thoughts';
import type { Venue } from '../src/features/sim/domain/venues';
import { WEATHERS, type Weather } from '../src/features/sim/domain/weather';

const [TILES_X, TILES_Z] = (process.env.SIM_PLOT ?? '112x100').split('x').map(Number) as [
  number,
  number,
];
const SEED = Number(process.env.SIM_SEED ?? 1);
const DAYS = Number(process.env.SIM_DAYS ?? 2);
// `entrance,reception,bungalow:3,snack-bar` keeps only those, the nearest to the reception first,
// so a small tycoon start can be run on the generated streets.
const KEEP = process.env.SIM_KEEP ?? '';
const PATH_TILES = process.env.SIM_PATHS === undefined ? null : Number(process.env.SIM_PATHS);
const OPENS_EMPTY = process.env.SIM_EMPTY === '1';
const QUIET = process.env.SIM_QUIET === '1';
// The JSON a save exports to: runs the player's own resort instead of a generated one.
const SAVE = process.env.SIM_SAVE ?? '';
// A generated plot moves with every model added to the catalogue; the reference resort only
// moves when somebody edits it, so a report stays comparable across plans.
const REFERENCE = !SAVE && process.env.SIM_PLOT === undefined && process.env.SIM_SEED === undefined;
// Rush caps the crowd's substeps, so guests there walk slower against the clock than at normal.
const SPEED = (process.env.SIM_SPEED ?? 'normal') as SimSpeed;

// Unset, the weather is the game's own forecast: `clear` pins it, so a rule can be compared alone.
const WEATHER = (process.env.SIM_WEATHER ?? null) as Weather | null;
if (WEATHER !== null && !WEATHERS.includes(WEATHER)) {
  throw new Error(`SIM_WEATHER is one of ${WEATHERS.join(', ')}, not ${WEATHER}`);
}

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

interface Ground {
  readonly plan: ResortPlan;
  readonly placements: readonly Placement[];
  readonly props: readonly Placement[];
  readonly paths: readonly Placement[];
  readonly rails: readonly Placement[];
  readonly population?: number;
}

function generatedGround(): Ground {
  const plan = generateResort(
    TYPES,
    clampParams({ tilesX: TILES_X, tilesZ: TILES_Z, seed: SEED, density: 0.7 }),
  );
  return { plan, ...layoutResort(ITEMS, plan) };
}

function worldGround(world: SavedWorld): Ground {
  return {
    plan: planOfWorld(world),
    placements: world.placements,
    props: world.props,
    paths: world.paths,
    rails: world.rails,
  };
}

// The save's own snapshot as exported from IndexedDB, typed arrays written out as plain arrays.
function savedGround(path: string): Ground {
  const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  return { ...worldGround(referenceWorldOf(snapshot.world)), population: snapshot.population };
}

// Started as a fresh game starts a saved world: the guests are the land's, not a snapshot's.
function referenceGround(): Ground {
  const ground = worldGround(referenceWorldOf(referenceJson));
  const land = ground.plan.land;
  return land ? { ...ground, population: crowdSizeForOwned(ownedArea(land, ground.plan)) } : ground;
}

function groundOf(): Ground {
  if (SAVE) return savedGround(SAVE);
  return REFERENCE ? referenceGround() : generatedGround();
}

function plotLabel(plan: ResortPlan): string {
  if (SAVE) return `Saved resort ${SAVE}`;
  if (REFERENCE) return `Reference resort ${plan.tilesX}x${plan.tilesZ}`;
  return `Plot ${TILES_X}x${TILES_Z} seed ${SEED}`;
}

function plotOf() {
  const ground = groundOf();
  const { plan } = ground;
  const layout = KEEP ? { ...ground, placements: kept(ground.placements), props: [] } : ground;
  const { placements, props, paths, rails } = layout;
  const plot: Plot = {
    layout: { placements, props, paths, rails, tilesX: plan.tilesX, tilesZ: plan.tilesZ },
    placements: [...placements],
    props: [...props],
    paths: [...paths],
    rails: [...rails],
  };
  const built = [
    ...[...placements, ...props].map((placement) => buildCostOf(placement.id)),
    (PATH_TILES ?? paths.length) * buildCostOf('path'),
  ];
  const population = ground.population ?? crowdSizeFor(paths.length);
  return { plan, plot, built, population };
}

function kept(placements: readonly Placement[]): Placement[] {
  const desk = placements.find((placement) => placement.id === 'reception') ?? placements[0]!;
  const distance = (placement: Placement) => Math.hypot(placement.x - desk.x, placement.z - desk.z);
  return KEEP.split(',').flatMap((entry) => {
    const [id, count] = entry.split(':');
    return placements
      .filter((placement) => placement.id === id)
      .toSorted((a, b) => distance(a) - distance(b))
      .slice(0, Number(count ?? 1));
  });
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

interface NeedDay {
  readonly level: Record<GuestNeed, number>;
  samples: number;
  dry: number;
}

const createNeedDay = (): NeedDay => ({
  level: { hunger: 0, thirst: 0, energy: 0, fun: 0, hygiene: 0, health: 0 },
  samples: 0,
  dry: 0,
});

// A need under this is as good as empty; a share of guests with one tells a resort that cannot
// keep up from one that merely has long walks.
const RUN_DRY = 0.05;

function sampleNeeds(day: NeedDay, guests: Guests, needs: Needs, router: Router): void {
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1 || router.isAsleep(person)) continue;
    day.samples++;
    let dry = false;
    for (const need of GUEST_NEEDS) {
      day.level[need] += needs.level[need][person]!;
      dry ||= needs.level[need][person]! < RUN_DRY;
    }
    if (dry) day.dry++;
  }
}

function needDayLine(day: NeedDay): string {
  const of = (total: number) => (day.samples > 0 ? total / day.samples : 0);
  const levels = GUEST_NEEDS.map((need) => `${need} ${of(day.level[need]).toFixed(2)}`);
  return `${levels.join(', ')}; ${Math.round(100 * of(day.dry))}% awake with one run dry`;
}

// Reviews are kept newest first: those ahead of the newest seen are the ones written since.
function newReviews(reviews: readonly Review[], seen: Review | undefined): readonly Review[] {
  const at = seen === undefined ? -1 : reviews.indexOf(seen);
  return at < 0 ? reviews : reviews.slice(0, at);
}

it('reports a few days on a generated plot', () => {
  const { plan, plot, built, population } = plotOf();
  const buildCost = built.reduce((sum, cost) => sum + cost, 0);
  const needDay = createNeedDay();
  const game = createHeadlessGame({
    plan,
    plot,
    population,
    startTick: OPENS_AT,
    forcedWeather: WEATHER,
  });
  const { state } = game;
  const { guests, needs, router, venues } = state;
  const crowd = state.crowd.crowd;
  const { network } = crowd;
  state.ledger = createLedger('tycoon', OPENING_BALANCE.tycoon - buildCost);
  if (OPENS_EMPTY) {
    for (let party = 0; party < guests.parties.length; party++) checkOutParty(guests, party);
    for (let person = 0; person < population; person++) {
      if (guests.present[person] === 1) continue;
      takeOffPlot(crowd, person, crowd.x[person]!, crowd.y[person]!, crowd.z[person]!);
    }
  }
  const stars: number[] = [];

  console.log(
    `${plotLabel(plan)} at ${SPEED}: ` +
      `${population} guests, ${bedCount(guests).beds} beds, ` +
      `${venues.length} venues, ${network.beachSeats.length} loungers, ${network.gates.length} gate tiles onto the beach`,
  );
  const standing = [...plot.placements, ...plot.props].map((placement) =>
    buildCostOf(placement.id),
  );
  console.log(
    `Books: built for ${buildCost}, wages ${wagesFor(state.roster)} and maintenance ` +
      `${maintenanceFor(standing)} a day, opening a tycoon game at ${state.ledger.balance}`,
  );

  const setOffAt = new Int32Array(population).fill(-1);
  const trips: number[] = [];
  let changedMind = 0;

  const morning = (): void => {
    const { day } = game.now;
    if (day > 0) {
      const visits = new Map<string, number>();
      for (const [key, count] of router.dayVisits()) {
        const id = key.split('#')[0]!;
        visits.set(id, (visits.get(id) ?? 0) + count);
      }
      const sorted = trips.toSorted((a, b) => a - b);
      const said = loudest(state.thoughtDay, 5).map(
        (each) => `${each.kind} ${each.subject ?? ''} ${each.count}`,
      );
      const { beds } = state.history.find((report) => report.day === day - 1)!;
      const { yesterday, today, balance } = state.ledger;
      console.log(
        [
          `Day ${day - 1} ends: ${state.rating.stars} stars, mean mood ${state.rating.happiness.toFixed(2)}`,
          `  visits: ${ranked(visits)}`,
          `  walks to the beach: ${sorted.length}, median ${percentile(sorted, 0.5)} min, ` +
            `p90 ${percentile(sorted, 0.9)} min; ${changedMind} changed their mind`,
          `  loudest thoughts: ${said.join(', ') || 'none'}`,
          `  demand: ${demandNow(guests, needs, router, venues)}`,
          `  needs: ${needDayLine(needDay)}; beds ${beds.taken}/${beds.total}`,
          `  books: nights ${yesterday.night}, visits ${yesterday.visit}, wages ${yesterday.wages}, ` +
            `maintenance ${yesterday.maintenance}, net ${netOf(yesterday)}, ` +
            `balance ${balance - netOf(today)}`,
        ].join('\n'),
      );
    }
    trips.length = 0;
    changedMind = 0;
    Object.assign(needDay, createNeedDay());
  };

  let newest: Review | undefined;
  const afterTick = ({ ticks: tick }: SimNow): void => {
    for (const review of newReviews(state.reviews, newest)) stars.push(review.stars);
    newest = state.reviews[0];

    for (let person = 0; person < population; person++) {
      const toBeach = router.goalOf(person)?.label === 'Beach' && router.visitOf(person) === null;
      if (toBeach && setOffAt[person] === -1) setOffAt[person] = tick;
      if (toBeach || setOffAt[person] === -1) continue;
      if (router.visitOf(person)?.venue.label === 'Beach') trips.push(tick - setOffAt[person]!);
      else changedMind++;
      setOffAt[person] = -1;
    }

    const hour = hourOf(tick);
    if (tick % HOUR !== 0 || hour < 9 || hour > 20) return;
    sampleNeeds(needDay, guests, needs, router);
    if (QUIET) return;
    const beach = beachNow(guests, router, crowd);
    console.log(
      `  ${String(hour).padStart(2)}:00  on loungers ${beach.onLounger}, on sand ${beach.onSand}, ` +
        `walking the sand ${beach.walkingOnSand}, heading there ${beach.headingThere}, ` +
        `free loungers ${freeLoungers(network, crowd)}`,
    );
    if (tick % TICKS_PER_DAY === LOUNGERS_LOOKED_AT) {
      console.log(`         loungers: ${ranked(loungerStates(guests, router, crowd))}`);
    }
  };

  // Through the last day's check-in, where its summary is printed.
  game.play(DAYS * TICKS_PER_DAY + CHECK_IN_TICK, {
    framesPerTick: framesPerTickAt(SPEED),
    hooks: { morning, hourly: () => {}, heard: () => {} },
    afterTick,
  });
  console.log(
    `Reviews, 1 to 5 stars: ${[1, 2, 3, 4, 5].map((each) => stars.filter((star) => star === each).length).join(' / ')}`,
  );
});
