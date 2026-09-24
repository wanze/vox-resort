import { describe, expect, it } from 'vitest';
import { countTypes, filterGroups, footprintLabel, isDrawable } from './paletteFilter';
import type { ObjectTypeDefinition, ObjectTypeGroup } from '../../catalog/domain/objectTypes';

const type = (id: string, label: string, x = 1, z = 1): ObjectTypeDefinition =>
  ({
    id,
    label,
    category: 'grounds',
    color: 0,
    model: { tiles: { x, z } },
  }) as ObjectTypeDefinition;

const group = (
  category: string,
  label: string,
  types: readonly ObjectTypeDefinition[],
): ObjectTypeGroup => ({ category, label, types }) as ObjectTypeGroup;

const GROUPS: readonly ObjectTypeGroup[] = [
  group('grounds', 'Grounds', [type('palm', 'Palm'), type('bench', 'Bench')]),
  group('amenities', 'Amenities', [
    type('poolside-bar', 'Poolside Bar', 2, 2),
    type('snack-bar', 'Snack Bar', 2, 1),
  ]),
  group('leisure', 'Leisure', [type('beach-club', 'Beach Club', 4, 4)]),
];

describe('filterGroups', () => {
  it('hands back the very same groups when nothing is typed', () => {
    expect(filterGroups(GROUPS, '')).toBe(GROUPS);
    expect(filterGroups(GROUPS, '   ')).toBe(GROUPS);
  });

  it('keeps every shelf a word reaches, and drops the ones it does not', () => {
    const found = filterGroups(GROUPS, 'bar');
    expect(found.map((each) => each.category)).toEqual(['amenities']);
    expect(found[0]!.types.map((each) => each.id)).toEqual(['poolside-bar', 'snack-bar']);
  });

  it('asks every word to land, so two words narrow rather than widen', () => {
    expect(countTypes(filterGroups(GROUPS, 'beach bar'))).toBe(0);
    expect(countTypes(filterGroups(GROUPS, 'beach club'))).toBe(1);
  });

  it('ignores case and reads a hyphenated id as well as a name', () => {
    expect(countTypes(filterGroups(GROUPS, 'POOLSIDE'))).toBe(1);
    expect(countTypes(filterGroups(GROUPS, 'snack-bar'))).toBe(1);
  });

  it('folds accents, so a plain keyboard reaches an accented name', () => {
    const accented = [group('amenities', 'Amenities', [type('cafe', 'Café')])];
    expect(countTypes(filterGroups(accented, 'cafe'))).toBe(1);
  });

  it('leaves the catalogue itself untouched', () => {
    filterGroups(GROUPS, 'bar');
    expect(GROUPS[0]!.types).toHaveLength(2);
  });
});

describe('countTypes', () => {
  it('counts across the shelves', () => {
    expect(countTypes(GROUPS)).toBe(5);
    expect(countTypes([])).toBe(0);
  });
});

describe('footprintLabel', () => {
  it('prints the footprint the object claims', () => {
    expect(footprintLabel(type('palm', 'Palm'))).toBe('1×1');
    expect(footprintLabel(type('snack-bar', 'Snack Bar', 2, 1))).toBe('2×1');
  });
});

describe('isDrawable', () => {
  it('is only true of a single tile, which cannot overlap its own run', () => {
    expect(isDrawable(type('palm', 'Palm'))).toBe(true);
    expect(isDrawable(type('snack-bar', 'Snack Bar', 2, 1))).toBe(false);
    expect(isDrawable(type('beach-club', 'Beach Club', 4, 4))).toBe(false);
  });
});
