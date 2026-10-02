import { ADULT_VOXELS } from '../../../../voxel-gen/people/figure.ts';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { STAFF_ROLES, staffPool, type StaffRole } from '../../sim/domain/staff';
import { createStaffTask, type StaffTask } from '../../sim/domain/staffRouter';

// Every body the pool will ever hold, in staff order: the HUD makes a pin for each up front.
export const PINNED_STAFF: readonly { readonly worker: number; readonly role: StaffRole }[] =
  staffPool().role.map((role, worker) => ({ worker, role }));

export interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Footprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

const ROOF_GAP = 2;

// Clear of a hat, so the pin's tail never hides the head it points at.
const HEAD_GAP = 2;

export const roofOver = (place: Footprint, ground: number, height: number): Anchor => ({
  x: (place.tileX + place.tilesX / 2) * TILE_VOXELS,
  y: ground + height + ROOF_GAP,
  z: (place.tileZ + place.tilesZ / 2) * TILE_VOXELS,
});

// Per building, in the router's numbering. A venue open to the sky is null: whoever works
// there is drawn in plain sight.
export interface Roofs {
  readonly venues: readonly (Anchor | null)[];
  readonly lodgings: readonly Anchor[];
  readonly depots: readonly Anchor[];
}

export interface PinSpot {
  x: number;
  y: number;
  z: number;
  inside: boolean;
}

export const createPinSpot = (): PinSpot => ({ x: 0, y: 0, z: 0, inside: false });

// The sim stands somebody at work in the middle of the footprint, under the roof.
function roofOf(task: StaffTask, roofs: Roofs): Anchor | null {
  if (!task.working) return null;
  if (task.kind === 'room') return roofs.lodgings[task.lodging] ?? null;
  if (task.kind === 'restock') return roofs.depots[task.depot] ?? null;
  if (task.kind === 'venue') return roofs.venues[task.venue] ?? null;
  return null;
}

const put = (into: PinSpot, at: Anchor, lift: number, inside: boolean): boolean => {
  into.x = at.x;
  into.y = at.y + lift;
  into.z = at.z;
  into.inside = inside;
  return true;
};

// False for nobody to pin: off duty, or nowhere on the plot.
export function staffPinOf(task: StaffTask, drawn: Anchor, roofs: Roofs, into: PinSpot): boolean {
  if (task.kind === 'off') return false;
  const roof = roofOf(task, roofs);
  if (roof) return put(into, roof, 0, true);
  if (Number.isNaN(drawn.x) || Number.isNaN(drawn.y) || Number.isNaN(drawn.z)) return false;
  return put(into, drawn, ADULT_VOXELS + HEAD_GAP, false);
}

// The one being inspected keeps their pin with the rest put away, so they can be found again.
export const isPinned = (worker: number, shown: boolean, selected: number | null): boolean =>
  shown || worker === selected;

export interface RoleTally {
  readonly working: number;
  readonly walking: number;
  readonly idle: number;
}

export type StaffTally = { readonly [role in StaffRole]: RoleTally };

// Whoever is off duty or on the way home is nobody's to count.
export function tallyStaff(
  roles: readonly StaffRole[],
  taskOf: (worker: number, into: StaffTask) => StaffTask,
): StaffTally {
  const counts = Object.fromEntries(
    STAFF_ROLES.map((role) => [role, { working: 0, walking: 0, idle: 0 }]),
  ) as { [role in StaffRole]: { working: number; walking: number; idle: number } };
  const task = createStaffTask();
  for (const [worker, role] of roles.entries()) {
    const { kind, working } = taskOf(worker, task);
    if (kind === 'off' || kind === 'home') continue;
    if (working) counts[role].working++;
    else if (kind === 'idle') counts[role].idle++;
    else counts[role].walking++;
  }
  return counts;
}
