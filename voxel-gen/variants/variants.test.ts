import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES, MODEL_SOURCES } from '../models/index.ts';
import { buildModel, TILE_VOXELS, type ModelSpot, type VoxelModel } from '../voxelgen.ts';
import { DRAFT_VARIANTS, VARIANTS as OFFERED } from './index.ts';

// Drafts too, so one is ready to offer the moment it joins VARIANTS.
const VARIANTS = [...OFFERED, ...DRAFT_VARIANTS];

const catalogue = new Map(MODEL_SOURCES.map((source) => [source.id, source]));

// Doors, seats, lights, windows and water are left out: the variant's shape decides those.
function simFacts(model: VoxelModel) {
  const venue = model.venue;
  return {
    placement: model.placement,
    gateway: model.gateway,
    groundDecides: model.groundDecides,
    scenery: model.scenery,
    binReach: model.binReach,
    venue: venue && {
      capacity: venue.capacity,
      dwellSeconds: venue.dwellSeconds,
      price: venue.price,
      satisfies: venue.satisfies,
      shelter: venue.shelter,
      litter: venue.litter,
      receives: venue.receives,
      stage: venue.stage,
      hours: venue.hours,
      dj: venue.dj,
      bathing: venue.bathing,
      reliability: venue.reliability,
    },
  };
}

// Counted only as far as the venue can use them: a variant's own seats may number differently.
function placesOf(model: VoxelModel) {
  const spots = model.venue?.spots ?? [];
  const spotsFor = (kind: NonNullable<ModelSpot['for']>): number =>
    spots.filter((spot) => (spot.for ?? 'visitor') === kind).length;
  const seats = model.seats.filter((seat) => !seat.post);
  const watching = seats.filter((seat) => seat.watches).length;
  const moving = [...(model.venue?.areas ?? []), ...(model.venue?.loops ?? [])].reduce(
    (sum, { places }) => sum + places,
    0,
  );
  return {
    visitor: Math.min(
      model.venue?.capacity ?? 0,
      seats.length - watching + spotsFor('visitor') + moving,
    ),
    // The sim shows no longer a line than this.
    watcher: Math.min(12, watching + spotsFor('watcher')),
    animator: spotsFor('animator'),
    lifeguard: spotsFor('lifeguard'),
  };
}

const declaresPlaces = (model: VoxelModel): boolean =>
  (model.venue?.spots ?? []).length > 0 || model.seats.some((seat) => seat.watches);

describe('VARIANTS', () => {
  it('offers an alternative to a model the catalogue has', () => {
    for (const { of, source } of VARIANTS) {
      expect(catalogue.has(of), `${source.id} is a variant of unknown ${of}`).toBe(true);
    }
  });

  it('keeps its ids clear of the catalogue and of each other', () => {
    const taken = new Set([...MODEL_SOURCES, ...DRAFT_SOURCES].map((source) => source.id));
    const ids = VARIANTS.map(({ source }) => source.id);
    for (const id of ids) expect(taken.has(id), `${id} is already a model`).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('could stand in for its original: same tiles, shelf and trade', () => {
    for (const { of, source } of VARIANTS) {
      const original = catalogue.get(of)!;
      expect(source.tiles, source.id).toEqual(original.tiles);
      expect(source.category, source.id).toBe(original.category);
      expect(source.venue?.role, source.id).toBe(original.venue?.role);
      expect(source.venue?.beds, source.id).toBe(original.venue?.beds);
    }
  });

  it('could stand in for its original: the sim and the generator decide alike', () => {
    for (const { of, source } of VARIANTS) {
      expect(simFacts(buildModel(source)), source.id).toEqual(
        simFacts(buildModel(catalogue.get(of)!)),
      );
    }
  });

  it('sounds like its original by declaring no sound of its own', () => {
    for (const { source } of VARIANTS) expect(source.sound, source.id).toBeUndefined();
  });

  // Or spans what its original spans: a lounger on bare sand fills no tile edge to edge.
  it('fills the tiles it claims and no more, or exactly as much as its original', () => {
    for (const { of, source } of VARIANTS) {
      const model = buildModel(source);
      const original = buildModel(catalogue.get(of)!);
      const fills = { width: source.tiles.x * TILE_VOXELS, depth: source.tiles.z * TILE_VOXELS };
      const spans = { width: model.width, depth: model.depth };
      const matches = spans.width === original.width && spans.depth === original.depth;
      expect(spans, source.id).toEqual(matches ? spans : fills);
    }
  });

  it('draws its visitors in as many places as its original does', () => {
    for (const { of, source } of VARIANTS) {
      const original = buildModel(catalogue.get(of)!);
      if (!declaresPlaces(original)) continue;
      expect(placesOf(buildModel(source)), source.id).toEqual(placesOf(original));
    }
  });
});
