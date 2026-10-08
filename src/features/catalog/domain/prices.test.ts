import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES, objectTypeById } from './objectTypes';
import {
  buildCostOf,
  costToStand,
  DIG_COST,
  nightPriceOf,
  priceOf,
  refundOf,
  SETTING_PREMIUM,
} from './prices';

const voxelsOf = (id: string): number => objectTypeById(id).model.voxelCount;

describe('buildCostOf', () => {
  it('charges a variant what its family costs, not what its own size would', () => {
    expect(buildCostOf('game-hall-b')).toBe(buildCostOf('game-hall'));
    expect(refundOf('villa-b', false)).toBe(refundOf('villa', false));
  });

  it('puts a cost above zero on everything in the catalogue', () => {
    for (const type of OBJECT_TYPES) expect(buildCostOf(type.id), type.id).toBeGreaterThan(0);
  });

  it('takes a declared cost over the size rule', () => {
    const declared = OBJECT_TYPES.find((type) => type.model.cost !== null)!;
    expect(buildCostOf(declared.id)).toBe(declared.model.cost);
  });

  it('charges more for a bigger model under the size rule', () => {
    expect(objectTypeById('house').model.cost).toBeNull();
    expect(objectTypeById('bungalow').model.cost).toBeNull();
    expect(voxelsOf('house')).toBeGreaterThan(voxelsOf('bungalow'));
    expect(buildCostOf('house')).toBeGreaterThan(buildCostOf('bungalow'));
  });

  it('prices a path tile so a plot can be paved, and a spadeful like a tile of it', () => {
    expect(buildCostOf('path')).toBeLessThan(buildCostOf('bungalow') / 10);
    expect(DIG_COST).toBe(buildCostOf('path'));
  });
});

describe('priceOf', () => {
  it('is 0 for a type with no venue and for a service that declares no price', () => {
    expect(objectTypeById('hedge').venue).toBeNull();
    expect(priceOf('hedge')).toBe(0);
    expect(objectTypeById('restrooms').venue?.role).toBe('service');
    expect(priceOf('restrooms')).toBe(0);
  });

  it('answers 0 for an id the catalogue does not know, as the beach is', () => {
    expect(() => priceOf('beach')).not.toThrow();
    expect(priceOf('beach')).toBe(0);
  });

  it('reads a venue its declared price', () => {
    expect(priceOf('restaurant')).toBe(objectTypeById('restaurant').venue?.price);
    expect(priceOf('restaurant')).toBeGreaterThan(0);
  });
});

describe('refundOf', () => {
  it('gives half back, rounded, for a standing building and all of it for a site', () => {
    const cost = buildCostOf('bungalow');
    expect(refundOf('bungalow', false)).toBe(Math.round(cost * 0.5));
    expect(refundOf('bungalow', true)).toBe(cost);
  });
});

describe('costToStand', () => {
  it('charges the player what they placed and nothing for a neighbour the paving re-laid', () => {
    expect(costToStand('path', false)).toBe(buildCostOf('path'));
    expect(costToStand('stairs', true)).toBe(0);
  });
});

describe('mosaic prices', () => {
  it('charges 40 for a style and a piece alike, refunds half and re-lays a neighbour free', () => {
    expect(buildCostOf('mosaic-zellige')).toBe(40);
    expect(buildCostOf('mosaic-calcada-corner')).toBe(40);
    expect(refundOf('mosaic-calcada-corner', false)).toBe(20);
    expect(costToStand('mosaic-calcada-corner', true)).toBe(0);
  });
});

describe('nightPriceOf', () => {
  it('is the price at setting 0, a quarter more at 1, and no more above it', () => {
    const base = priceOf('villa');
    expect(nightPriceOf('villa', 0)).toBe(base);
    expect(nightPriceOf('villa', 1)).toBe(Math.round(base * (1 + SETTING_PREMIUM)));
    expect(nightPriceOf('villa', 3)).toBe(nightPriceOf('villa', 1));
    expect(nightPriceOf('villa', -1)).toBe(base);
  });
});
