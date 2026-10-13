import type { TileSpan } from '../../land/domain/landRights';
import { terrainAt, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { fnv, mix, unitOf } from '../../random/domain/hash';

export interface Flotsam {
  readonly tileX: number;
  readonly tileZ: number;
  readonly pieces: number;
}

// The rows a storm's waves reach: the wet sand, and the one behind it.
const STRAND_ROWS = 2;

// A tideline, not a carpet: a third of the strand, which a cleaner clears in a morning.
const WASHED_SHARE = 0.35;

const MOST_PIECES = 3;

const FLOTSAM_SALT = fnv('flotsam');

// Only the columns guests may roam: litter on sand nobody owns would never be swept.
export function strandOf(
  shore: Shore | null,
  span: TileSpan,
): readonly { readonly tileX: number; readonly tileZ: number }[] {
  if (!shore) return [];
  const strand: { tileX: number; tileZ: number }[] = [];
  for (let tileX = Math.max(0, span.from); tileX < Math.min(shore.tilesX, span.to); tileX++) {
    const water = waterStartZ(shore, tileX);
    for (let row = 1; row <= STRAND_ROWS; row++) {
      const tileZ = water - row;
      if (terrainAt(shore, tileX, tileZ) === 'beach') strand.push({ tileX, tileZ });
    }
  }
  return strand;
}

// Hashed by tile and day, so a replay of the same storm leaves the same tideline.
export function flotsamOn(
  strand: readonly { readonly tileX: number; readonly tileZ: number }[],
  day: number,
  clear: (tileX: number, tileZ: number) => boolean,
): readonly Flotsam[] {
  const left: Flotsam[] = [];
  for (const { tileX, tileZ } of strand) {
    const hash = mix(
      FLOTSAM_SALT ^
        Math.imul(tileX + 1, 73_856_093) ^
        Math.imul(tileZ + 1, 19_349_663) ^
        Math.imul(day + 1, 83_492_791),
    );
    if (unitOf(hash) >= WASHED_SHARE || !clear(tileX, tileZ)) continue;
    left.push({ tileX, tileZ, pieces: 1 + ((hash >>> 8) % MOST_PIECES) });
  }
  return left;
}
