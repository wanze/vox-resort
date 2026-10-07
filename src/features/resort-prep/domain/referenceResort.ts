import { savedWorldSchema, type SavedWorld } from './savedWorld';

interface WrittenLand {
  readonly owned: ArrayLike<number>;
}

// JSON has no typed arrays: the land's rights come back as a plain array, which the schema refuses.
export function referenceWorldOf(json: unknown): SavedWorld {
  const world = json as { readonly land?: WrittenLand };
  const land = world.land && { ...world.land, owned: Uint8Array.from(world.land.owned) };
  return savedWorldSchema.parse({ ...world, ...(land ? { land } : {}) });
}
