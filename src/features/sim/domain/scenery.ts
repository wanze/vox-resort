import type { Placement } from '../../layout/domain/resortLayout';

export interface SceneryItem {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly strength: number;
}

export interface SceneryField {
  readonly tilesX: number;
  readonly tilesZ: number;
  // 0 plain, 1 as pleasant as a tile gets; row-major, tileZ * tilesX + tileX.
  readonly value: Float32Array;
}

type Footprint = Pick<SceneryItem, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ'>;

// A guest feels the dressing along their promenade, not across the resort.
export const SCENERY_REACH = 4;

// A fountain beside a guest is a third of the way to perfect, so a forest nears 1 without
// reading as ten fountains. Tuned on the reference plot, whose hedges line most paths.
export const SATURATION = 2;

const gapTo = (tile: number, start: number, size: number): number =>
  tile < start ? start - tile : tile >= start + size ? tile - (start + size - 1) : 0;

function spread(sum: Float32Array, item: SceneryItem, tilesX: number, tilesZ: number): void {
  const x0 = Math.max(0, item.tileX - SCENERY_REACH);
  const x1 = Math.min(tilesX - 1, item.tileX + item.tilesX - 1 + SCENERY_REACH);
  const z0 = Math.max(0, item.tileZ - SCENERY_REACH);
  const z1 = Math.min(tilesZ - 1, item.tileZ + item.tilesZ - 1 + SCENERY_REACH);
  for (let z = z0; z <= z1; z++) {
    const dz = gapTo(z, item.tileZ, item.tilesZ);
    for (let x = x0; x <= x1; x++) {
      const distance = Math.max(dz, gapTo(x, item.tileX, item.tilesX));
      sum[z * tilesX + x]! += item.strength * (1 - distance / (SCENERY_REACH + 1));
    }
  }
}

export function sceneryFieldFor(
  items: readonly SceneryItem[],
  tilesX: number,
  tilesZ: number,
): SceneryField {
  const value = new Float32Array(tilesX * tilesZ);
  for (const item of items) spread(value, item, tilesX, tilesZ);
  for (let tile = 0; tile < value.length; tile++) {
    value[tile] = value[tile]! / (value[tile]! + SATURATION);
  }
  return { tilesX, tilesZ, value };
}

export function sceneryAt(field: SceneryField, tileX: number, tileZ: number): number {
  if (tileX < 0 || tileZ < 0 || tileX >= field.tilesX || tileZ >= field.tilesZ) return 0;
  return field.value[tileZ * field.tilesX + tileX]!;
}

// The ring counts because a place's setting is what surrounds it; its own footprint
// has nothing else standing on it.
export function sceneryOver(field: SceneryField, footprint: Footprint): number {
  let total = 0;
  let tiles = 0;
  for (let z = footprint.tileZ - 1; z <= footprint.tileZ + footprint.tilesZ; z++) {
    for (let x = footprint.tileX - 1; x <= footprint.tileX + footprint.tilesX; x++) {
      total += sceneryAt(field, x, z);
      tiles++;
    }
  }
  return total / tiles;
}

export function sceneryItemsOf(
  placements: readonly Placement[],
  strengthOf: (id: string) => number,
): SceneryItem[] {
  const items: SceneryItem[] = [];
  for (const placement of placements) {
    const strength = strengthOf(placement.id);
    if (strength <= 0) continue;
    const { tileX, tileZ, tilesX, tilesZ } = placement;
    items.push({ tileX, tileZ, tilesX, tilesZ, strength });
  }
  return items;
}
