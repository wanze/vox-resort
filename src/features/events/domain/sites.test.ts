import { describe, expect, it } from 'vitest';
import { beachVenueFor, withBeach } from '../../sim/domain/beach';
import { walkNetworkFor } from '../../crowd/domain/walkNetwork';
import { shoreFor } from '../../layout/domain/shoreline';
import type { Venue } from '../../sim/domain/venues';
import { EVENT_KINDS, type EventKind } from './catalogue';
import type { EventSite } from './programme';
import { BUILT_INS, book, EMPTY_PROGRAMME, withBuiltIns, withCeremony } from './programme';
import { ceremonyWhen, heldAt, siteVenueOf, sitesOf, unwelcomeMove, welcomeSitesOf } from './sites';
import { tickAt } from './week';

const venue = (key: string, label: string, stage: boolean): Venue => ({
  key,
  id: key.split('#')[0]!,
  label,
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.5 }],
  capacity: 20,
  dwellSeconds: { min: 60, max: 120 },
  stage,
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 2,
  tilesZ: 2,
  doors: [],
});

const VENUES = [
  venue('cafe#0', 'Café', false),
  venue('kids-club#0', 'Kids club', true),
  venue('beach-club#0', 'Coral Stage', true),
];

const ON_SAND: EventKind = { ...EVENT_KINDS.cinema, sites: ['beach'] };

describe('siteVenueOf', () => {
  it('finds a renamed stage by its key', () => {
    const renamed = VENUES.map((each) =>
      each.key === 'kids-club#0' ? { ...each, label: 'Fun Barn' } : each,
    );
    expect(siteVenueOf({ kind: 'stage', venue: 'kids-club#0' }, renamed)).toBe(1);
  });

  it('does not take a venue with the key that is no stage', () => {
    expect(siteVenueOf({ kind: 'stage', venue: 'cafe#0' }, VENUES)).toBe(-1);
    expect(siteVenueOf({ kind: 'stage', venue: 'gone#3' }, VENUES)).toBe(-1);
  });

  it('has no venue for the beach in a list of the buildings', () => {
    expect(siteVenueOf({ kind: 'beach' }, VENUES)).toBe(-1);
  });

  it("finds the beach at the end of the router's list", () => {
    const shore = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
    });
    const paved = Array.from({ length: 8 }, (_, index) => ({ tileX: 10, tileZ: 10 + index, y: 0 }));
    const network = walkNetworkFor({ paved, levelOf: () => 0, shore, tilesX: 20 });
    expect(beachVenueFor(network)).not.toBeNull();
    const listed = withBeach(VENUES, network);
    expect(siteVenueOf({ kind: 'beach' }, listed)).toBe(VENUES.length);
  });
});

describe('heldAt', () => {
  const pits = [...VENUES, { ...venue('fire-pit#0', 'Moonfire', false), hearth: true }];

  it('lights a bonfire booked on the beach at the fire pit, not on the sand', () => {
    expect(heldAt({ kind: 'beach' }, 'bonfire', pits)).toBe(3);
    expect(heldAt({ kind: 'beach' }, 'bonfire', VENUES)).toBe(-1);
    expect(heldAt({ kind: 'stage', venue: 'kids-club#0' }, 'bonfire', pits)).toBe(-1);
  });

  it('holds every other kind where it was booked', () => {
    expect(heldAt({ kind: 'stage', venue: 'kids-club#0' }, 'bingo', pits)).toBe(1);
    expect(heldAt({ kind: 'beach' }, 'fireworks', pits)).toBe(-1);
  });

  const WELCOMING = [
    venue('playground#0', 'Swings', true),
    venue('game-hall#0', 'Arcade', true),
    { ...venue('beach-club#0', 'Coral Stage', true), welcomes: true },
    { ...venue('reception#0', 'Reception', false), receives: true, lobby: 24 },
  ];

  it('holds the welcome only on a stage that welcomes, or at a lobby', () => {
    const at = (site: EventSite) => heldAt(site, 'welcome', WELCOMING);
    expect(at({ kind: 'stage', venue: 'playground#0' })).toBe(-1);
    expect(at({ kind: 'stage', venue: 'game-hall#0' })).toBe(-1);
    expect(at({ kind: 'stage', venue: 'beach-club#0' })).toBe(2);
    expect(at({ kind: 'lobby', venue: 'reception#0' })).toBe(3);
  });

  it('holds nothing but the welcome at a lobby, which is no stage', () => {
    expect(heldAt({ kind: 'lobby', venue: 'reception#0' }, 'bingo', WELCOMING)).toBe(-1);
    expect(heldAt({ kind: 'stage', venue: 'reception#0' }, 'bingo', WELCOMING)).toBe(-1);
    expect(heldAt({ kind: 'stage', venue: 'playground#0' }, 'bingo', WELCOMING)).toBe(0);
  });
});

describe('unwelcomeMove', () => {
  const WELCOMING = [
    venue('playground#0', 'Swings', true),
    { ...venue('beach-club#0', 'Coral Stage', true), welcomes: true },
  ];
  const programme = book(
    withBuiltIns(EMPTY_PROGRAMME, BUILT_INS, [{ kind: 'stage', venue: 'beach-club#0' }]),
    {
      kind: 'bingo',
      site: { kind: 'stage', venue: 'beach-club#0' },
      repeat: { every: 'day' },
      start: 20 * 60,
    },
    0,
  ).programme;
  const swings: EventSite = { kind: 'stage', venue: 'playground#0' };

  it('stops the welcome moving onto a playground, and nothing else', () => {
    expect(unwelcomeMove(programme, 1, { site: swings }, WELCOMING)).toBe(true);
    expect(unwelcomeMove(programme, 2, { site: swings }, WELCOMING)).toBe(false);
    expect(unwelcomeMove(programme, 1, { start: 9 * 60 }, WELCOMING)).toBe(false);
    expect(unwelcomeMove(programme, 9, { site: swings }, WELCOMING)).toBe(false);
  });
});

describe('welcomeSitesOf', () => {
  const stage = (key: string, capacity: number): Venue => ({
    ...venue(key, key, true),
    capacity,
    welcomes: true,
  });

  it('ranks the stages that welcome, biggest first, before any lobby', () => {
    const venues = [
      { ...venue('reception#1', 'Annex', false), receives: true, lobby: 40 },
      stage('beach-club#0', 18),
      { ...venue('kids-club#0', 'Kids', true), capacity: 99 },
      stage('open-air-stage#0', 80),
      { ...venue('reception#0', 'Reception', false), receives: true, lobby: 24 },
    ];
    expect(welcomeSitesOf(venues)).toEqual([
      { kind: 'stage', venue: 'open-air-stage#0' },
      { kind: 'stage', venue: 'beach-club#0' },
      { kind: 'lobby', venue: 'reception#1' },
      { kind: 'lobby', venue: 'reception#0' },
    ]);
  });

  it('falls back to a lobby alone, and to nothing with no reception', () => {
    const desk = { ...venue('reception#0', 'Reception', false), receives: true, lobby: 24 };
    expect(welcomeSitesOf([venue('playground#0', 'Swings', true), desk])).toEqual([
      { kind: 'lobby', venue: 'reception#0' },
    ]);
    expect(welcomeSitesOf([venue('playground#0', 'Swings', true)])).toEqual([]);
  });
});

describe('sitesOf', () => {
  it('lists the stages by name, and the beach only when a kind is played there', () => {
    const stages = [
      { kind: 'stage', venue: 'beach-club#0' },
      { kind: 'stage', venue: 'kids-club#0' },
    ];
    const onStages = Object.values(EVENT_KINDS).filter((kind) => !kind.sites.includes('beach'));
    expect(sitesOf(VENUES, onStages, true)).toEqual(stages);
    expect(sitesOf(VENUES, [ON_SAND], false)).toEqual(stages);
    expect(sitesOf(VENUES, [ON_SAND], true)).toEqual([...stages, { kind: 'beach' }]);
  });
});

describe('ceremonyWhen', () => {
  const plaza = { key: 'stage-plaza#0', label: 'Plaza Stage', stage: true } as Venue;
  const programme = withCeremony(EMPTY_PROGRAMME, {
    group: 3,
    day: 5,
    site: { kind: 'stage', venue: plaza.key },
    start: 15 * 60,
  });

  it('tells a group’s ceremony to come by day, start and stage, until it is over', () => {
    const when = { day: 5, start: 15 * 60, venue: 'Plaza Stage' };
    expect(ceremonyWhen(programme, 3, tickAt(4, 12 * 60), [plaza])).toEqual(when);
    expect(ceremonyWhen(programme, 3, tickAt(5, 15.5 * 60), [plaza])).toEqual(when);
    expect(ceremonyWhen(programme, 3, tickAt(5, 16 * 60), [plaza])).toBeNull();
    expect(ceremonyWhen(programme, 3, tickAt(4, 12 * 60), [])?.venue).toBe('the stage');
    expect(ceremonyWhen(programme, 4, 0, [plaza])).toBeNull();
  });
});
