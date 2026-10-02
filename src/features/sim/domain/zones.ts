import type { Roster, StaffRole } from './staff';

export const ZONES = 4;
export const NO_ZONE = -1;

export interface Zones {
  readonly tilesX: number;
  readonly tilesZ: number;
  // NO_ZONE or 0..ZONES-1, row-major like the scenery field.
  readonly zone: Int8Array;
  // Bumped on every change, so a drawing or a deal can tell whether to redo itself.
  version: number;
}

interface TileAt {
  readonly tileX: number;
  readonly tileZ: number;
}

interface Workplace {
  readonly stage?: boolean;
  readonly bathing?: boolean;
  readonly reliability?: number;
}

export type WorkplaceZones = { [role in StaffRole]: number };

export interface Footprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

export function createZones(tilesX: number, tilesZ: number): Zones {
  const x = Math.max(0, tilesX);
  const z = Math.max(0, tilesZ);
  return { tilesX: x, tilesZ: z, zone: new Int8Array(x * z).fill(NO_ZONE), version: 0 };
}

const inside = (zones: Zones, tileX: number, tileZ: number): boolean =>
  tileX >= 0 && tileZ >= 0 && tileX < zones.tilesX && tileZ < zones.tilesZ;

const OWNS_ALL = (): boolean => true;

export function paintZone(
  zones: Zones,
  tileX: number,
  tileZ: number,
  zone: number,
  owns: (tileX: number, tileZ: number) => boolean = OWNS_ALL,
): boolean {
  if (!inside(zones, tileX, tileZ) || zone < NO_ZONE || zone >= ZONES) return false;
  if (!owns(tileX, tileZ)) return false;
  const at = tileZ * zones.tilesX + tileX;
  if (zones.zone[at] === zone) return false;
  zones.zone[at] = zone;
  zones.version++;
  return true;
}

export function zoneAt(zones: Zones, tileX: number, tileZ: number): number {
  if (!inside(zones, tileX, tileZ)) return NO_ZONE;
  return zones.zone[tileZ * zones.tilesX + tileX]!;
}

const bitAt = (zones: Zones, tileX: number, tileZ: number): number => {
  const zone = zoneAt(zones, tileX, tileZ);
  return zone === NO_ZONE ? 0 : 1 << zone;
};

const maskOf = (zones: Zones, tiles: readonly TileAt[]): number =>
  tiles.reduce((mask, tile) => mask | bitAt(zones, tile.tileX, tile.tileZ), 0);

// A mask, not one zone: a building on the border of two zones is worked from both.
export function zonesOf(zones: Zones, footprint: Footprint, doorTiles: readonly TileAt[]): number {
  let mask = maskOf(zones, doorTiles);
  for (let dz = 0; dz < footprint.tilesZ; dz++) {
    for (let dx = 0; dx < footprint.tilesX; dx++) {
      mask |= bitAt(zones, footprint.tileX + dx, footprint.tileZ + dz);
    }
  }
  return mask;
}

// Mirrors the staff router's task choices: a cleaner scrubs any venue and sweeps any paving or
// sand, and a tower is worked from the tile under its seat.
export function workplaceZones(
  zones: Zones,
  venues: readonly Workplace[],
  venueZones: Int32Array,
  ground: {
    readonly paved: readonly TileAt[];
    readonly towers: readonly TileAt[];
    readonly beach?: readonly TileAt[];
  },
): WorkplaceZones {
  const held = {
    cleaner: maskOf(zones, ground.paved) | maskOf(zones, ground.beach ?? []),
    lifeguard: maskOf(zones, ground.towers),
    animator: 0,
    mechanic: 0,
  };
  for (const [at, venue] of venues.entries()) {
    const mask = venueZones[at] ?? 0;
    held.cleaner |= mask;
    if (venue.stage === true) held.animator |= mask;
    if (venue.bathing === true) held.lifeguard |= mask;
    if (venue.reliability !== undefined) held.mechanic |= mask;
  }
  return held;
}

export function zonesIn(mask: number): number[] {
  return Array.from({ length: ZONES }, (_, zone) => zone).filter((zone) => (mask >> zone) & 1);
}

// Round-robin per role in zone order, so hiring one more fills the zones evenly. A role with no
// zoned workplace works the whole plot, which is how an unpainted plot behaves as before.
export function dealZones(
  roles: readonly number[],
  duty: Uint8Array,
  zonesByRole: readonly (readonly number[])[],
): Int8Array {
  const zoneOf = new Int8Array(roles.length).fill(NO_ZONE);
  const dealt = new Map<number, number>();
  for (const [worker, role] of roles.entries()) {
    const list = zonesByRole[role] ?? [];
    if (duty[worker] !== 1 || list.length === 0) continue;
    const nth = dealt.get(role) ?? 0;
    dealt.set(role, nth + 1);
    zoneOf[worker] = list[nth % list.length]!;
  }
  return zoneOf;
}

export function anyZone(zones: Zones): boolean {
  return zones.zone.some((zone) => zone !== NO_ZONE);
}

export function staffByZone(roles: readonly StaffRole[], zoneOf: Int8Array): readonly Roster[] {
  const counts = Array.from({ length: ZONES }, () => ({
    cleaner: 0,
    lifeguard: 0,
    animator: 0,
    mechanic: 0,
  }));
  for (const [worker, role] of roles.entries()) {
    const zone = zoneOf[worker] ?? NO_ZONE;
    if (zone !== NO_ZONE) counts[zone]![role]++;
  }
  return counts;
}
