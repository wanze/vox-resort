import { copyColumns } from './routerState';
import { STAFF_COLUMNS, type StaffColumn, type StaffRouterSnapshot } from './staffRouterSnapshot';

const NOBODY = -1;

export interface StaffRouterState extends Readonly<Pick<StaffRouterSnapshot, StaffColumn>> {
  // Per lifeguard, the venue or tower they watched before the last edit; spent on their next
  // choice, and counted as watched till then so an edit does not raise the alarm.
  readonly keptWater: Int32Array;
  readonly keptTower: Uint8Array;
}

// Set only by a rebuild, so a load right after an edit may move a lifeguard; never saved.
export const STAFF_NOT_SAVED = ['keptWater', 'keptTower'] as const;

export type StaffStateSnapshot = Pick<StaffRouterSnapshot, StaffColumn>;

export function createStaffRouterState(workers: number, fullLoad: number): StaffRouterState {
  return {
    assigned: new Int32Array(workers).fill(NOBODY),
    until: new Int32Array(workers),
    working: new Uint8Array(workers),
    doorOf: new Int32Array(workers).fill(NOBODY),
    // Apart from the venue claims: a tile index and a venue index are different numbers.
    tileOf: new Int32Array(workers).fill(NOBODY),
    // Apart from the venue claims too: a lodging index is not a venue index.
    roomOf: new Int32Array(workers).fill(NOBODY),
    lastStage: new Int32Array(workers).fill(NOBODY),
    sheltering: new Uint8Array(workers),
    towerOf: new Int32Array(workers).fill(NOBODY),
    legOf: new Int32Array(workers),
    legRoute: Array.from({ length: workers }, () => null),
    load: new Uint8Array(workers).fill(fullLoad),
    restocking: new Uint8Array(workers),
    goingHome: new Uint8Array(workers),
    keptWater: new Int32Array(workers).fill(NOBODY),
    keptTower: new Uint8Array(workers),
  };
}

export function snapshotStaffState(state: StaffRouterState): StaffStateSnapshot {
  return copyColumns(state, STAFF_COLUMNS);
}

export function restoreStaffState(snapshot: StaffStateSnapshot): StaffRouterState {
  const workers = snapshot.assigned.length;
  return {
    ...copyColumns(snapshot, STAFF_COLUMNS),
    keptWater: new Int32Array(workers).fill(NOBODY),
    keptTower: new Uint8Array(workers),
  };
}

// Who holds what, per venue, lodging, litter tile and tower seat: all of it follows from the
// state, so a restore derives it rather than saving it.
export interface StaffClaims {
  readonly claimedBy: Int32Array;
  // Apart from the cleaners' claims: a cleaner may scrub a venue while a show is on.
  readonly showBy: Int32Array;
  readonly watchedBy: Int32Array;
  readonly repairBy: Int32Array;
  readonly roomBy: Int32Array;
  tileClaimedBy: Int32Array;
  readonly towerBy: Map<number, number>;
}

export function createStaffClaims(venues: number, lodgings: number, tiles: number): StaffClaims {
  return {
    claimedBy: new Int32Array(venues).fill(NOBODY),
    showBy: new Int32Array(venues).fill(NOBODY),
    watchedBy: new Int32Array(venues).fill(NOBODY),
    repairBy: new Int32Array(venues).fill(NOBODY),
    roomBy: new Int32Array(lodgings).fill(NOBODY),
    tileClaimedBy: new Int32Array(tiles).fill(NOBODY),
    towerBy: new Map(),
  };
}
