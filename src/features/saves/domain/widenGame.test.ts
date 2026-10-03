import { describe, expect, it } from 'vitest';
import { createCrowd, snapshotCrowd } from '../../crowd/domain/crowd';
import { walkNetworkFor } from '../../crowd/domain/walkNetwork';
import { createGuests } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { createFootfall } from '../../overlays/domain/overlays';
import { createBreakdowns } from '../../sim/domain/breakdowns';
import { startDay } from '../../sim/domain/dayReport';
import { createHappiness } from '../../sim/domain/happiness';
import { createLedger } from '../../sim/domain/ledger';
import { createCarrying, createLitter } from '../../sim/domain/litter';
import { createNeeds } from '../../sim/domain/needs';
import { ratingFor } from '../../sim/domain/rating';
import { snapshotResort } from '../../sim/domain/resortState';
import { createRouter } from '../../sim/domain/router';
import { AUTO_HIRING, staffPool } from '../../sim/domain/staff';
import { createStaffRouter } from '../../sim/domain/staffRouter';
import { createDay, createThoughts } from '../../sim/domain/thoughts';
import { createUpkeep } from '../../sim/domain/upkeep';
import { createZones } from '../../sim/domain/zones';
import { gameSnapshotSchema, SAVE_VERSION, type GameSnapshot } from './snapshot';
import { resortPerPerson } from '../../sim/domain/resortSnapshot';
import { crowdPerBody } from '../../crowd/domain/crowdSnapshot';
import { widenGame } from './widenGame';

// The smallest whole game, as in snapshot.test.ts, at any population.
function gameOf(POPULATION: number, seed: number): GameSnapshot {
  const network = walkNetworkFor({
    paved: Array.from({ length: 4 }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 })),
    levelOf: () => 0,
    shore: null,
    tilesX: 4,
  });
  const guests = createGuests({
    count: POPULATION,
    // Room for everybody: a party with no bed would start away, and the save would list nobody.
    homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: POPULATION }],
    variants: 2,
    childVariant: 1,
    seed,
  });
  const needs = createNeeds(guests, seed + 1);
  const upkeep = createUpkeep(0);
  const crowd = createCrowd({ network, count: POPULATION, variants: 2, seed: 3 });
  const employed = staffPool();
  const workers = createCrowd({ network, count: employed.count, variants: 3, seed: 4 });
  const router = createRouter({
    guests,
    needs,
    venues: [],
    lodgings: [],
    gateways: [],
    onLeave: () => {},
    network,
    tickOfDay: () => 0,
    crowd: () => crowd,
    upkeep: () => upkeep,
    seed: 5,
  });
  const staffRouter = createStaffRouter({
    staff: employed,
    venues: [],
    network,
    upkeep: () => upkeep,
    crowd: () => workers,
    seed: 6,
  });
  const resort = snapshotResort({
    guests,
    needs,
    happiness: createHappiness(POPULATION),
    thoughts: createThoughts(POPULATION),
    thoughtDay: createDay(),
    carrying: createCarrying(POPULATION),
    litter: createLitter(4, 3),
    upkeep,
    breakdowns: createBreakdowns(0),
    venues: [],
    takings: new Map([['bar#0', 40]]),
    names: new Map([['bar#0', 'The Anchor']]),
    footfall: createFootfall(network.nodes.length),
    reviews: [],
    today: startDay(0),
    history: [],
    rating: ratingFor({ happiness: 0.8, present: POPULATION, housed: 0 }),
    ledger: createLedger('tycoon', 8000),
    arrivalsPlanned: 0,
    arrivalsAdmitted: 0,
    arrivals: createRandom(8),
    open: true,
    beds: { total: 0, taken: 0 },
    hiring: AUTO_HIRING,
    zones: createZones(4, 3),
  });
  return {
    version: SAVE_VERSION,
    world: {
      tilesX: 4,
      tilesZ: 3,
      shore: null,
      elevation: null,
      terrain: [],
      placements: [],
      props: [],
      paths: [],
      rails: [],
    },
    params: { tilesX: 4, tilesZ: 3, density: 0.5, seed: 1 },
    population: POPULATION,
    staffCount: employed.count,
    resort,
    router: router.snapshot(),
    staffRouter: staffRouter.snapshot(),
    crowd: snapshotCrowd(crowd),
    staff: snapshotCrowd(workers),
    clock: { ticks: 3 * 1440 + 600, speed: 'normal', carry: 0, forced: null },
    camera: {
      mode: 'perspective',
      isoDirection: 'southeast',
      target: { x: 1, y: 2, z: 3 },
      position: { x: 4, y: 50, z: 6 },
      zoom: 1,
    },
  };
}

const SAVED = 12;
const FRESH = 20;

describe('widenGame', () => {
  it('grows every guest column to the fresh population, and parses', () => {
    const widened = widenGame(gameOf(SAVED, 1), gameOf(FRESH, 7));
    expect(widened.population).toBe(FRESH);
    expect(widened.resort.guests.count).toBe(FRESH);
    for (const column of [...resortPerPerson(widened.resort), ...crowdPerBody(widened.crowd)]) {
      expect(column.length).toBe(FRESH);
    }
    const parsed = gameSnapshotSchema.safeParse(widened);
    expect(parsed.error?.issues).toBeUndefined();
  });

  it('keeps every saved value at the front, and the fresh ones behind it', () => {
    const saved = gameOf(SAVED, 1);
    const fresh = gameOf(FRESH, 7);
    const widened = widenGame(saved, fresh);
    const pairs = [
      [saved.resort.needs.hunger, fresh.resort.needs.hunger, widened.resort.needs.hunger],
      [saved.resort.guests.people, fresh.resort.guests.people, widened.resort.guests.people],
      [saved.crowd.x, fresh.crowd.x, widened.crowd.x],
      [saved.router.goals.venue, fresh.router.goals.venue, widened.router.goals.venue],
      [saved.resort.thoughts.stay, fresh.resort.thoughts.stay, widened.resort.thoughts.stay],
    ] as const;
    type Triple = readonly [ArrayLike<unknown>, ArrayLike<unknown>, ArrayLike<unknown>];
    for (const [before, other, after] of pairs as readonly Triple[]) {
      expect(Array.from(after).slice(0, before.length)).toEqual(Array.from(before));
      expect(Array.from(after).slice(before.length)).toEqual(
        Array.from(other).slice(before.length),
      );
    }
  });

  it('keeps everything that is not a guest column as saved, and writes to neither game', () => {
    const saved = gameOf(SAVED, 1);
    const fresh = gameOf(FRESH, 7);
    const hunger = fresh.resort.needs.hunger.slice();
    const widened = widenGame(saved, fresh);
    expect(widened.resort.guests.parties).toBe(saved.resort.guests.parties);
    expect(widened.resort.guests.freeBeds).toBe(saved.resort.guests.freeBeds);
    expect(widened.resort.ledger).toEqual(saved.resort.ledger);
    expect(widened.staff).toBe(saved.staff);
    expect(widened.world).toBe(saved.world);
    expect(fresh.resort.needs.hunger).toEqual(hunger);
    expect(saved.resort.needs.hunger).toHaveLength(SAVED);
  });
});
