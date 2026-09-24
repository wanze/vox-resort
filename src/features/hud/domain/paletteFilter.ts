import type { ObjectTypeDefinition, ObjectTypeGroup } from '../../catalog/domain/objectTypes';

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function matches(type: ObjectTypeDefinition, words: readonly string[]): boolean {
  const haystack = `${fold(type.label)} ${fold(type.id)}`;
  return words.every((word) => haystack.includes(word));
}

// An empty query returns the same array, so nothing re-renders for a box nobody typed in.
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

export function countTypes(groups: readonly ObjectTypeGroup[]): number {
  return groups.reduce((total, group) => total + group.types.length, 0);
}

export function footprintLabel(type: ObjectTypeDefinition): string {
  return `${type.model.tiles.x}×${type.model.tiles.z}`;
}

// Only a single tile can be dragged: anything larger would overlap its own run.
export function isDrawable(type: ObjectTypeDefinition): boolean {
  return type.model.tiles.x === 1 && type.model.tiles.z === 1;
}
