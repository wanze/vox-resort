import { describe, expect, it } from 'vitest';
import { createCrowd, snapshotCrowd } from '../../crowd/domain/crowd';
import { walkNetworkFor } from '../../crowd/domain/walkNetwork';
import { createEvents } from '../../events/domain/eventRuns';
import { snapshotEvents } from '../../events/domain/eventsSnapshot';
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
import { isReadable, listedOf } from './saveSlots';
import { gameSnapshotSchema, metaOf, SAVE_VERSION, type GameSnapshot } from './snapshot';

const POPULATION = 12;

// The smallest whole game: one street, nobody placed, every part snapshotted for real.
function gameFixture(): GameSnapshot {
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
    seed: 1,
  });
  const needs = createNeeds(guests, 2);
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
    name: 'Coral Cove',
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

describe('gameSnapshotSchema', () => {
  it('parses a whole game as snapshotted', () => {
    const parsed = gameSnapshotSchema.safeParse(gameFixture());
    expect(parsed.error?.issues).toBeUndefined();
  });

  it('refuses another version', () => {
    expect(gameSnapshotSchema.safeParse({ ...gameFixture(), version: 2 }).success).toBe(false);
  });

  it('refuses a hand-set role with a negative count, and takes a role on Auto', () => {
    const game = gameFixture();
    const hiredAs = (cleaner: number | null) => ({
      ...game,
      resort: { ...game.resort, hiring: { ...AUTO_HIRING, cleaner } },
    });
    expect(gameSnapshotSchema.safeParse(hiredAs(-1)).success).toBe(false);
    expect(gameSnapshotSchema.safeParse(hiredAs(null)).success).toBe(true);
  });

  it('takes a hand-set role', () => {
    const game = gameFixture();
    const hired = { ...game, resort: { ...game.resort, hiring: { ...AUTO_HIRING, cleaner: 3 } } };
    expect(gameSnapshotSchema.safeParse(hired).success).toBe(true);
  });

  it('refuses a save with a part missing', () => {
    const { camera: _camera, ...missing } = gameFixture();
    expect(gameSnapshotSchema.safeParse(missing).success).toBe(false);
  });

  it('refuses a per-person column one short of the population', () => {
    const game = gameFixture();
    const short = { ...game.resort.happiness, level: game.resort.happiness.level.slice(1) };
    const broken = { ...game, resort: { ...game.resort, happiness: short } };
    expect(gameSnapshotSchema.safeParse(broken).success).toBe(false);
  });

  it('takes the events, or none from a save before them, and refuses a glow one short', () => {
    const game = gameFixture();
    expect(game).not.toHaveProperty('events');
    const events = snapshotEvents(createEvents(POPULATION));
    expect(gameSnapshotSchema.safeParse({ ...game, events }).success).toBe(true);
    const short = { ...events, glow: events.glow.slice(1) };
    expect(gameSnapshotSchema.safeParse({ ...game, events: short }).success).toBe(false);
  });

  it('refuses a staff column one short of the staff', () => {
    const game = gameFixture();
    const broken = { ...game, staff: { ...game.staff, x: game.staff.x.slice(1) } };
    expect(gameSnapshotSchema.safeParse(broken).success).toBe(false);
  });

  it('refuses a zone grid of another size than the world', () => {
    const game = gameFixture();
    const broken = { ...game, resort: { ...game.resort, zones: game.resort.zones.slice(1) } };
    expect(gameSnapshotSchema.safeParse(broken).success).toBe(false);
  });

  it('takes a land grid that covers the world, and refuses one of another size', () => {
    const game = gameFixture();
    const withLand = (parcelsX: number, owned: number) => ({
      ...game,
      world: { ...game.world, land: { parcelsX, parcelsZ: 1, owned: new Uint8Array(owned) } },
    });
    expect(gameSnapshotSchema.safeParse(withLand(1, 1)).success).toBe(true);
    expect(gameSnapshotSchema.safeParse(withLand(1, 2)).success).toBe(false);
    expect(gameSnapshotSchema.safeParse(withLand(2, 2)).success).toBe(false);
  });

  it('takes a save from before resorts had names', () => {
    const { name: _name, ...nameless } = gameFixture();
    expect(gameSnapshotSchema.safeParse(nameless).success).toBe(true);
  });

  it('takes a save from before venues had names, and reads it as naming none', () => {
    const game = gameFixture();
    const { names: _names, ...resort } = game.resort;
    const parsed = gameSnapshotSchema.safeParse({ ...game, resort });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.resort.names).toEqual([]);
  });

  it('survives a structured clone, which is how IndexedDB stores it', () => {
    const cloned: unknown = structuredClone(gameFixture());
    expect(gameSnapshotSchema.safeParse(cloned).success).toBe(true);
  });
});

describe('metaOf', () => {
  it('sums the save up for the list', () => {
    const meta = metaOf('a', 'Cove', gameFixture(), 1234);
    expect(meta).toEqual({
      id: 'a',
      name: 'Cove',
      resortName: 'Coral Cove',
      savedAt: 1234,
      version: SAVE_VERSION,
      mode: 'tycoon',
      day: 3,
      balance: 8000,
      stars: meta.stars,
      guests: POPULATION,
      tilesX: 4,
      tilesZ: 3,
    });
  });

  it('lists a save from before resorts had names as readable', () => {
    const { name: _name, ...nameless } = gameFixture();
    const { resortName: _resortName, ...meta } = metaOf('a', 'Cove', nameless, 1234);
    expect(metaOf('a', 'Cove', nameless, 1234)).toEqual(meta);
    expect(isReadable(listedOf(meta))).toBe(true);
  });
});
