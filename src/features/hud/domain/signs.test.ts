import { describe, expect, it } from 'vitest';
import type { SignKind } from '../../../../voxel-gen/voxelgen.ts';
import type { Venue } from '../../sim/domain/venues';
import {
  DOOR_SIGN_RISE,
  MAX_SIGNS,
  SIGN_HIDE_TILE_PX,
  SIGN_MIN_TILE_PX,
  signAnchorOf,
  signsShown,
  signSpotsOf,
  signsUnder,
} from './signs';
import { roofOver } from './staffPins';

const PLACE = { tileX: 2, tileZ: 3, tilesX: 2, tilesZ: 2 };

const venue = (key: string, id: string, at: Partial<Venue> = {}): Venue => ({
  key,
  id,
  label: `The ${id}`,
  role: 'food',
  satisfies: [],
  capacity: 4,
  dwellSeconds: { min: 1, max: 2 },
  x: 0,
  z: 0,
  ...PLACE,
  doors: [],
  ...at,
});

const SIGNS: { readonly [id: string]: SignKind } = { bakery: 'bakery', pool: 'pool' };
const signOf = (id: string): SignKind | null => SIGNS[id] ?? null;

describe('signAnchorOf', () => {
  it('stands on the wall at the first door, a storey above the ground', () => {
    const doors = [
      { x: 40, z: 63, facing: 0 as const },
      { x: 32, z: 48, facing: 3 as const },
    ];
    expect(signAnchorOf({ ...PLACE, doors }, 4, 30)).toEqual({
      x: 40.5,
      y: 4 + DOOR_SIGN_RISE,
      z: 63,
    });
    expect(signAnchorOf({ ...PLACE, doors: [doors[1]!] }, 0, 30)).toEqual({
      x: 33,
      y: DOOR_SIGN_RISE,
      z: 48.5,
    });
  });

  it('keeps to the top of a model lower than a storey', () => {
    const doors = [{ x: 40, z: 63, facing: 0 as const }];
    expect(signAnchorOf({ ...PLACE, doors }, 4, 6).y).toBe(10);
  });

  it('stands over the roof of a venue without a door', () => {
    expect(signAnchorOf({ ...PLACE, doors: [] }, 4, 6)).toEqual(roofOver(PLACE, 4, 6));
  });
});

describe('signsShown', () => {
  it('shows from the threshold up, hides under the lower one, and keeps its mind in between', () => {
    expect(signsShown(SIGN_MIN_TILE_PX, false)).toBe(true);
    expect(signsShown(SIGN_HIDE_TILE_PX - 0.5, true)).toBe(false);
    const between = (SIGN_MIN_TILE_PX + SIGN_HIDE_TILE_PX) / 2;
    expect(signsShown(between, true)).toBe(true);
    expect(signsShown(between, false)).toBe(false);
  });
});

describe('signSpotsOf', () => {
  it('makes one spot per venue with a sign, in the venues order', () => {
    const spots = signSpotsOf(
      [venue('a', 'pool'), venue('b', 'statue'), venue('c', 'bakery')],
      signOf,
    );
    expect(spots.map(({ key, sign, label }) => ({ key, sign, label }))).toEqual([
      { key: 'a', sign: 'pool', label: 'The pool' },
      { key: 'c', sign: 'bakery', label: 'The bakery' },
    ]);
  });

  it('stops at MAX_SIGNS', () => {
    const many = Array.from({ length: MAX_SIGNS + 5 }, (_, index) => venue(`v${index}`, 'bakery'));
    expect(signSpotsOf(many, signOf)).toHaveLength(MAX_SIGNS);
  });
});

describe('signsUnder', () => {
  it('names the signs whose footprint a marker stands on', () => {
    const spots = signSpotsOf(
      [venue('a', 'pool'), venue('b', 'bakery', { tileX: 10, tileZ: 10, tilesX: 1, tilesZ: 1 })],
      signOf,
    );
    expect(signsUnder(spots, [{ tileX: 3, tileZ: 4 }])).toEqual(new Set(['a']));
    expect(signsUnder(spots, [{ tileX: 4, tileZ: 3 }]).size, 'just past the footprint').toBe(0);
  });
});
