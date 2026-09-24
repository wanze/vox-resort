import type { Tile } from '../../layout/domain/resortLayout';
import type { TileOccupancy } from './tileOccupancy';

export function demolishAt(tile: Tile, occupancy: TileOccupancy): string | null {
  return occupancy.keyAt(tile) ?? null;
}
