/**
 * What the build palette shows, once the search box has had its say.
 *
 * Pure on purpose: the palette is forty-odd objects on four shelves, and the
 * rules for which of them a typed word reaches — and for what a tile prints
 * under its picture — are the kind of thing that is easier to assert than to
 * squint at. The component is left with markup.
 */

import type { ObjectTypeDefinition, ObjectTypeGroup } from '../../catalog/domain/objectTypes';

/** Folds case and accents, so "cafe" reaches a "Café" if one is ever authored. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Whether a type answers to a query.
 *
 * Every word has to land somewhere in the type's name or its id, so "beach bar"
 * reaches neither the beach club nor the poolside bar, while "bar" reaches both
 * of those. Matching the id as well is what lets a hyphenated name be typed the
 * way it is filed.
 */
function matches(type: ObjectTypeDefinition, words: readonly string[]): boolean {
  const haystack = `${fold(type.label)} ${fold(type.id)}`;
  return words.every((word) => haystack.includes(word));
}

/**
 * The shelves, narrowed to what the query reaches.
 *
 * A shelf left with nothing is dropped rather than printed empty, so a search
 * reads as a list of hits rather than as the catalogue with holes in it. An
 * empty query gives the groups back untouched — same objects, same order, and
 * the same array identity, so nothing re-renders for a box nobody typed in.
 */
export function filterGroups(
  groups: readonly ObjectTypeGroup[],
  query: string,
): readonly ObjectTypeGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups;
  return groups
    .map((group) => ({ ...group, types: group.types.filter((type) => matches(type, words)) }))
    .filter((group) => group.types.length > 0);
}

/** How many objects a filtered catalogue is offering. */
export function countTypes(groups: readonly ObjectTypeGroup[]): number {
  return groups.reduce((total, group) => total + group.types.length, 0);
}

/** The footprint a tile prints in its corner, in tiles. */
export function footprintLabel(type: ObjectTypeDefinition): string {
  return `${type.model.tiles.x}×${type.model.tiles.z}`;
}

/**
 * Whether the type can be drawn by dragging rather than clicked down one at a
 * time. Only a single tile can: anything larger would overlap its own run.
 */
export function isDrawable(type: ObjectTypeDefinition): boolean {
  return type.model.tiles.x === 1 && type.model.tiles.z === 1;
}
