import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES, MODEL_SOURCES } from './models/index.ts';
import { PEOPLE_SOURCES } from './people/index.ts';
import { SEA_SOURCES } from './sea/index.ts';
import { SKY_SOURCES } from './sky/index.ts';
import { VARIANT_SOURCES, VARIANTS } from './variants/index.ts';
import { buildModel, type VoxelModel, type VoxelModelSource } from './voxelgen.ts';

const SOURCES: readonly VoxelModelSource[] = [
  ...MODEL_SOURCES,
  ...DRAFT_SOURCES,
  ...VARIANT_SOURCES,
];

const venues = SOURCES.filter((source) => source.venue !== undefined);

// A list rather than a rule, so promoting a model to a venue is a deliberate edit here.
const NOT_VENUES: ReadonlySet<string> = new Set([
  'beach-umbrella',
  'bench',
  'blossom',
  'boardwalk',
  'bridge',
  'bridge-ramp',
  'bridge-railing',
  'bridge-ramp-railing-left',
  'bridge-ramp-railing-right',
  'cypress',
  'entrance',
  'flowerbed',
  'fountain',
  'hedge',
  'jetty',
  'lifeguard-tower',
  'litter-bin',
  'oak',
  'olive',
  'palm',
  'palm-b',
  'path',
  'picnic-table',
  'pier-railing',
  'pine',
  'railing',
  'sign-post',
  'staff-house',
  'stair-railing',
  'stairs',
  'statue',
  'street-lamp',
  'sun-lounger',
  'tikitorch',
  'willow',
  'hedge-b',
  'street-lamp-b',
  'litter-bin-b',
  'sign-post-b',
  'flowerbed-b',
  'pine-b',
  'cypress-b',
  'olive-b',
  'oak-b',
  'blossom-b',
  'willow-b',
  'statue-b',
  'sun-lounger-b',
  'bench-b',
  'picnic-table-b',
  'beach-umbrella-b',
  'tikitorch-b',
  'lifeguard-tower-b',
  'entrance-b',
  'fountain-b',
]);

describe('the venues the catalogue declares', () => {
  it('fits somebody in, for a visit that takes some time', () => {
    for (const { id, venue } of venues) {
      expect(venue!.capacity, `${id} fits nobody`).toBeGreaterThanOrEqual(1);
      expect(venue!.dwellSeconds.min, `${id} is visited in no time`).toBeGreaterThan(0);
      expect(venue!.dwellSeconds.min, `${id} ends a visit before it starts`).toBeLessThanOrEqual(
        venue!.dwellSeconds.max,
      );
    }
  });

  it('gives beds to the lodging, one person to a bed, and to nothing else', () => {
    for (const { id, venue } of venues) {
      if (venue!.role !== 'lodging') {
        expect(venue!.beds, `${id} has beds but is not a lodging`).toBeUndefined();
        continue;
      }
      expect(venue!.beds, `${id} is a lodging with nowhere to sleep`).toBeGreaterThanOrEqual(1);
      expect(venue!.capacity, `${id} holds more people than it has beds`).toBe(venue!.beds);
    }
  });

  it('relieves every need it names by something, and by no more than all of it', () => {
    for (const { id, venue } of venues) {
      for (const relief of venue!.satisfies ?? []) {
        expect(relief.amount, `${id} names ${relief.need} and does nothing for it`).not.toBe(0);
        expect(Math.abs(relief.amount), `${id} overshoots ${relief.need}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('names each need once', () => {
    for (const { id, venue } of venues) {
      const needs = (venue!.satisfies ?? []).map((relief) => relief.need);
      expect(new Set(needs).size, `${id} relieves one need twice`).toBe(needs.length);
    }
  });

  it('never makes somewhere to go out of paving', () => {
    for (const source of SOURCES) {
      if (!source.groundDecides) continue;
      expect(source.venue, `${source.id} is paving and a venue`).toBeUndefined();
    }
  });

  it('leaves the dressing off, by name', () => {
    for (const source of SOURCES) {
      if (!NOT_VENUES.has(source.id)) continue;
      expect(source.venue, `${source.id} became a venue`).toBeUndefined();
    }
  });

  it('makes no venue of anything that stands on no tile', () => {
    for (const source of [...PEOPLE_SOURCES, ...SEA_SOURCES, ...SKY_SOURCES]) {
      expect(source.venue, `${source.id} is a venue`).toBeUndefined();
    }
  });

  it('has a decision made about every model', () => {
    const undecided = SOURCES.filter(
      (source) => source.venue === undefined && !NOT_VENUES.has(source.id),
    ).map((source) => source.id);
    expect(undecided).toEqual([]);
    expect(SOURCES.length).toBe(NOT_VENUES.size + venues.length);
  });
});

// The sim's queueLane.ts draws no longer a line than this, and art may not import the sim.
const MAX_QUEUE_SHOWN = 12;

// The courts whose line watches from the benches rather than queueing on the path.
const WATCHED: ReadonlySet<string> = new Set(['tennis-court', 'basketball-court', 'volleyball']);

// Open venues drawn with everybody in a place; the rest hide what does not fit inside.
const SEEN: ReadonlySet<string> = new Set([
  'tennis-court',
  'basketball-court',
  'volleyball',
  'swimming-pool',
  'minigolf',
  'playground',
  'kids-club',
  'gym-pavilion',
  'beach-club',
  'beach-shower',
  'icecream',
]);

const originalOf = new Map(VARIANTS.map(({ of, source }) => [source.id, of]));

const familyOf = (id: string): string => originalOf.get(id) ?? id;

const visitorPlaces = (model: VoxelModel): number =>
  model.seats.filter((seat) => !seat.watches && !seat.post).length +
  (model.venue?.spots ?? []).filter((spot) => (spot.for ?? 'visitor') === 'visitor').length;

const watcherPlaces = (model: VoxelModel): number =>
  model.seats.filter((seat) => seat.watches).length +
  (model.venue?.spots ?? []).filter((spot) => spot.for === 'watcher').length;

describe('the places a venue draws its visitors in', () => {
  const models = venues.map(buildModel);

  it('keeps every spot inside its model, above the ground', () => {
    for (const model of models) {
      for (const spot of model.venue!.spots ?? []) {
        const at = `${model.id} at ${spot.x},${spot.y},${spot.z}`;
        expect(spot.x, at).toBeGreaterThanOrEqual(0);
        expect(spot.x, at).toBeLessThan(model.width);
        expect(spot.z, at).toBeGreaterThanOrEqual(0);
        expect(spot.z, at).toBeLessThan(model.depth);
        expect(spot.y, at).toBeGreaterThan(0);
      }
    }
  });

  it('seats a whole shown line where the courts are watched', () => {
    for (const model of models) {
      if (!WATCHED.has(familyOf(model.id))) continue;
      expect(watcherPlaces(model), `${model.id} has too few watchers`).toBeGreaterThanOrEqual(
        MAX_QUEUE_SHOWN,
      );
    }
  });

  it('has a place for every visitor it admits, where it is seen', () => {
    for (const model of models) {
      if (!SEEN.has(familyOf(model.id))) continue;
      expect(visitorPlaces(model), `${model.id} has too few places`).toBeGreaterThanOrEqual(
        model.venue!.capacity,
      );
    }
  });
});
