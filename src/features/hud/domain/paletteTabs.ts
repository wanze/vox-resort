import { familyOf, type ObjectTypeGroup } from '../../catalog/domain/objectTypes';

// A style is not offered on its own, so it is found through the family it belongs to.
export function tabOfObject(groups: readonly ObjectTypeGroup[], id: string | null): string | null {
  if (id === null) return null;
  const family = familyOf(id);
  const group = groups.find((each) =>
    each.types.some((type) => type.id === id || type.family === family),
  );
  return group?.category ?? null;
}

// A stored tab that a new game's catalogue no longer offers falls back to the first.
export function shownTab(groups: readonly ObjectTypeGroup[], wanted: string | null): string | null {
  if (groups.some((group) => group.category === wanted)) return wanted;
  return groups[0]?.category ?? null;
}
