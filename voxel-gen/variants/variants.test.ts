import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES, MODEL_SOURCES } from '../models/index.ts';
import { buildModel, TILE_VOXELS, type VoxelModel } from '../voxelgen.ts';
import { VARIANTS } from './index.ts';

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
      bathing: venue.bathing,
      reliability: venue.reliability,
    },
  };
}

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

  it('fills the tiles it claims and no more', () => {
    for (const { source } of VARIANTS) {
      const model = buildModel(source);
      expect(model.width, source.id).toBe(source.tiles.x * TILE_VOXELS);
      expect(model.depth, source.id).toBe(source.tiles.z * TILE_VOXELS);
    }
  });
});
