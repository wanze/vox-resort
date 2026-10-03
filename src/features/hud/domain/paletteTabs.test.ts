import { describe, expect, it } from 'vitest';
import { shownTab, tabOfObject } from './paletteTabs';
import { OBJECT_TYPES, objectTypeGroups } from '../../catalog/domain/objectTypes';

const GROUPS = objectTypeGroups();

describe('tabOfObject', () => {
  it('finds the tab of a kind in the second category', () => {
    const second = GROUPS[1]!;
    expect(tabOfObject(GROUPS, second.types[0]!.id)).toBe(second.category);
  });

  it('files a style under its family', () => {
    const variant = OBJECT_TYPES.find((type) => type.style > 0)!;
    expect(variant.id).not.toBe(variant.family);
    expect(tabOfObject(GROUPS, variant.id)).toBe(variant.category);
  });

  it('gives no tab for an id the catalogue does not know', () => {
    expect(tabOfObject(GROUPS, 'no-such-thing')).toBeNull();
  });
});

describe('shownTab', () => {
  it('falls back to the first category when the wanted one is not offered', () => {
    expect(shownTab(GROUPS, 'no-such-category')).toBe(GROUPS[0]!.category);
    expect(shownTab(GROUPS, GROUPS[1]!.category)).toBe(GROUPS[1]!.category);
  });
});
