import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { adviceKey } from './news';

export type MarkerIcon =
  | 'broken'
  | 'stranded'
  | 'wheelchair'
  | 'queue'
  | 'dirty'
  | 'lifeguard'
  | 'litter';

export interface Marker {
  // adviceKey of the loudest advice on that tile.
  readonly key: string;
  readonly icon: MarkerIcon;
  readonly at: { readonly tileX: number; readonly tileZ: number };
  readonly advice: Advice;
}

// Where an order sends somebody, on the tile its marker would stand on.
export interface OrderSpot {
  readonly role: 'mechanic' | 'cleaner';
  readonly tileX: number;
  readonly tileZ: number;
}

export const tileKey = (at: { readonly tileX: number; readonly tileZ: number }): string =>
  `${at.tileX},${at.tileZ}`;

export const orderedTiles = (orders: readonly OrderSpot[]): ReadonlySet<string> =>
  new Set(orders.map(tileKey));

// The showcase preallocates its anchor buffers and the HUD its buttons to this count.
export const MAX_MARKERS = 12;

// An idle building or a far lodging is a design note, not a problem to walk to,
// and a dozen of them would bury the rest.
const ICONS: Partial<Record<AdviceKind, MarkerIcon>> = {
  broken: 'broken',
  unreachable: 'stranded',
  'not-step-free': 'wheelchair',
  'full-lines': 'queue',
  dirty: 'dirty',
  unwatched: 'lifeguard',
  littered: 'litter',
};

export const markerIconOf = (kind: AdviceKind): MarkerIcon | null => ICONS[kind] ?? null;

// Advice names a building by its origin tile, the same one the inspector reports.
export const adviceAt = (
  advice: readonly Advice[],
  tile: { readonly tileX: number; readonly tileZ: number },
): readonly Advice[] =>
  advice.filter((each) => each.at?.tileX === tile.tileX && each.at.tileZ === tile.tileZ);

// The advice arrives loudest first, so the first one seen on a tile wins it.
export function markersOf(advice: readonly Advice[]): readonly Marker[] {
  const markers: Marker[] = [];
  const taken = new Set<string>();
  for (const each of advice) {
    if (markers.length === MAX_MARKERS) break;
    const icon = markerIconOf(each.kind);
    if (!icon || !each.at) continue;
    const tile = tileKey(each.at);
    if (taken.has(tile)) continue;
    taken.add(tile);
    markers.push({ key: adviceKey(each), icon, at: each.at, advice: each });
  }
  return markers;
}
