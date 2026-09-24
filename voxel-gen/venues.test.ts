import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES, MODEL_SOURCES } from './models/index.ts';
import { PEOPLE_SOURCES } from './people/index.ts';
import { SEA_SOURCES } from './sea/index.ts';
import { SKY_SOURCES } from './sky/index.ts';
import type { VoxelModelSource } from './voxelgen.ts';

const SOURCES: readonly VoxelModelSource[] = [...MODEL_SOURCES, ...DRAFT_SOURCES];

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
  'path',
  'picnic-table',
  'pier-railing',
  'pine',
  'railing',
  'sign-post',
  'stair-railing',
  'stairs',
  'statue',
  'street-lamp',
  'sun-lounger',
  'tikitorch',
  'willow',
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
