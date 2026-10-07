import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  canPick,
  HIGHLIGHT_COLOURS,
  highlightBoxesOf,
  highlightTypesOf,
  keptPicks,
  ringStripsOf,
  ringWidthAt,
  searchTypes,
  toggledPick,
  type HighlightKind,
  type HighlightPick,
  type HighlightPlaced,
} from './highlights';

const placed = (id: string, tileX = 0, tileZ = 0): HighlightPlaced => ({
  id,
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 2,
});

const KINDS: { readonly [id: string]: HighlightKind } = {
  wc: { family: 'wc', label: 'WC', sign: 'toilets' },
  'wc-modern': { family: 'wc', label: 'WC', sign: 'toilets' },
  snack: { family: 'snack', label: 'Snack bar', sign: 'snack' },
  hotel: { family: 'hotel', label: 'Hotel', sign: null },
};
const kindOf = (id: string): HighlightKind | null => KINDS[id] ?? null;
const familyOf = (id: string): string => KINDS[id]?.family ?? id;

describe('highlightTypesOf', () => {
  it('counts each family once, styles together, by label, and leaves out what is not a building', () => {
    const types = highlightTypesOf(
      [placed('wc'), placed('snack'), placed('wc-modern'), placed('bench'), placed('hotel')],
      kindOf,
    );
    expect(types.map(({ family, count }) => [family, count])).toEqual([
      ['hotel', 1],
      ['snack', 1],
      ['wc', 2],
    ]);
  });
});

describe('searchTypes', () => {
  const types = highlightTypesOf([placed('wc'), placed('snack'), placed('hotel')], kindOf);
  const labels = (query: string) => searchTypes(types, query).map((type) => type.label);

  it('keeps every type for an empty query', () => {
    expect(labels(' ')).toEqual(['Hotel', 'Snack bar', 'WC']);
  });

  it('finds a type by its label, its sign or as lodging', () => {
    expect(labels('snack')).toEqual(['Snack bar']);
    expect(labels('toilets')).toEqual(['WC']);
    expect(labels('lodging')).toEqual(['Hotel']);
    expect(labels('pool')).toEqual([]);
  });
});

describe('toggledPick', () => {
  it('gives each new pick the first colour free and keeps the others where they were', () => {
    let picks: HighlightPick[] = [];
    picks = toggledPick(picks, 'wc');
    picks = toggledPick(picks, 'snack');
    picks = toggledPick(picks, 'hotel');
    picks = toggledPick(picks, 'wc');
    expect(picks).toEqual([
      { family: 'snack', colour: 1 },
      { family: 'hotel', colour: 2 },
    ]);
    expect(toggledPick(picks, 'bar')).toContainEqual({ family: 'bar', colour: 0 });
  });

  it('refuses a pick past the last colour', () => {
    let picks: HighlightPick[] = [];
    for (let at = 0; at < HIGHLIGHT_COLOURS.length; at++) picks = toggledPick(picks, `type-${at}`);
    expect(canPick(picks)).toBe(false);
    expect(toggledPick(picks, 'one-more')).toEqual(picks);
  });
});

describe('keptPicks', () => {
  const types = highlightTypesOf([placed('wc')], kindOf);

  it('drops a pick with nothing left to show', () => {
    const picks = [
      { family: 'wc', colour: 0 },
      { family: 'snack', colour: 1 },
    ];
    expect(keptPicks(picks, types)).toEqual([{ family: 'wc', colour: 0 }]);
  });

  it('hands back the same list when every pick stays', () => {
    const picks = [{ family: 'wc', colour: 0 }];
    expect(keptPicks(picks, types)).toBe(picks);
  });
});

describe('highlightBoxesOf', () => {
  it('boxes every building of a picked family in its colour, on its ground', () => {
    const boxes = highlightBoxesOf(
      [placed('wc', 1, 2), placed('snack', 3, 4), placed('wc-modern', 5, 6)],
      [{ family: 'wc', colour: 3 }],
      familyOf,
      (placement) => placement.tileX * 10,
    );
    expect(boxes).toEqual([
      { tileX: 1, tileZ: 2, tilesX: 1, tilesZ: 2, y: 10, colour: 3 },
      { tileX: 5, tileZ: 6, tilesX: 1, tilesZ: 2, y: 50, colour: 3 },
    ]);
  });
});

describe('ringWidthAt', () => {
  it('widens as the camera draws back, within its bounds', () => {
    expect(ringWidthAt(200)).toBe(2);
    expect(ringWidthAt(24)).toBe(4);
    expect(ringWidthAt(1)).toBe(2 * TILE_VOXELS);
    expect(ringWidthAt(0)).toBe(2 * TILE_VOXELS);
  });

  it('steps in half voxels', () => {
    expect(ringWidthAt(23) * 2).toBe(Math.round(ringWidthAt(23) * 2));
  });
});

describe('ringStripsOf', () => {
  it('rings the footprint from outside, corners covered once', () => {
    const box = { tileX: 1, tileZ: 2, tilesX: 1, tilesZ: 2, y: 0, colour: 0 };
    const strips = ringStripsOf(box, 4);
    const x0 = TILE_VOXELS;
    const z0 = 2 * TILE_VOXELS;
    const x1 = 2 * TILE_VOXELS;
    const z1 = 4 * TILE_VOXELS;
    expect(strips).toEqual([
      { x: (x0 + x1) / 2, z: z0 - 2, sizeX: TILE_VOXELS + 8, sizeZ: 4 },
      { x: (x0 + x1) / 2, z: z1 + 2, sizeX: TILE_VOXELS + 8, sizeZ: 4 },
      { x: x0 - 2, z: (z0 + z1) / 2, sizeX: 4, sizeZ: 2 * TILE_VOXELS },
      { x: x1 + 2, z: (z0 + z1) / 2, sizeX: 4, sizeZ: 2 * TILE_VOXELS },
    ]);
  });
});
