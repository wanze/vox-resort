import type { Pitch } from './beachPitch';
import { createOccupancy, restoreOccupancy, snapshotOccupancy, type Occupancy } from './occupancy';
import {
  ROUTER_COLUMNS,
  ROUTER_VENUE_COLUMNS,
  type RouterColumn,
  type RouterSnapshot,
  type RouterVenueColumn,
} from './routerSnapshot';
import type { SandRoute } from './sandRoute';

// Routes are per person, not per venue: each party member walks to their own beach spot.
export type Errands = Readonly<RouterSnapshot['errands']>;

const createErrands = (people: number): Errands => ({
  venue: new Int32Array(people).fill(-1),
  route: Array.from({ length: people }, () => null),
  leg: new Int32Array(people),
  back: new Uint8Array(people),
});

export interface Claim {
  readonly pitch: Pitch;
  readonly routes: readonly SandRoute[];
  holders: number;
}

// Columns, never an object per guest: the router reads them per guest on every step and tick.
export interface RouterState extends Readonly<
  Pick<RouterSnapshot, RouterColumn | RouterVenueColumn>
> {
  readonly occupancy: Occupancy;
  readonly errands: Errands;
  readonly stays: (Claim | null)[];
  readonly partyPitches: (Claim | null)[];
  readonly pitched: Set<number>;
  readonly promised: Set<number>;
  asleepCount: number;
}

// Saved under a shape of their own, by snapshotRouterState.
export const ROUTER_SAVED_OTHERWISE = ['occupancy', 'errands', 'stays', 'partyPitches'] as const;

// Followed from the saved columns on a restore.
export const ROUTER_DERIVED = ['pitched', 'promised', 'asleepCount'] as const;

export type RouterStateSnapshot = Pick<
  RouterSnapshot,
  RouterColumn | RouterVenueColumn | 'occupancy' | 'errands' | 'claims' | 'partyPitches' | 'stays'
>;

export function createRouterState(people: number, parties: number, venues: number): RouterState {
  return {
    doorOf: new Int32Array(people).fill(-1),
    // Not carried across a rebuild: the index would point at whatever building lands there.
    justLeft: new Int32Array(people).fill(-1),
    leaving: new Uint8Array(people),
    asleep: new Uint8Array(people),
    homeward: new Uint8Array(people),
    homeLodging: new Int32Array(people),
    arriving: new Uint8Array(people),
    spotOf: new Int32Array(people),
    fetching: new Int32Array(people).fill(-1),
    stayUntil: new Int32Array(people),
    stayRoutes: Array.from({ length: people }, () => null),
    lookAgainAt: new Int32Array(people),
    // Counted as events, because occupancy only says what is true now.
    balkCount: new Int32Array(venues),
    visitCount: new Int32Array(venues),
    occupancy: createOccupancy(people, venues),
    errands: createErrands(people),
    stays: Array.from({ length: people }, () => null),
    partyPitches: Array.from({ length: parties }, () => null),
    pitched: new Set(),
    promised: new Set(),
    asleepCount: 0,
  };
}

// Copies, so a snapshot never shares an array with whatever it was taken from.
export function copyColumns<T extends object, K extends keyof T>(
  from: T,
  keys: readonly K[],
): Pick<T, K> {
  const copy = {} as Pick<T, K>;
  for (const key of keys) {
    const column = from[key];
    copy[key] = (
      ArrayBuffer.isView(column)
        ? (column as unknown as Int32Array).slice()
        : [...(column as unknown as unknown[])]
    ) as T[K];
  }
  return copy;
}

const ERRAND_COLUMNS = ['venue', 'route', 'leg', 'back'] as const;

// A claim is shared by a party's pitch and each member's stay, so the table is saved once and
// both point into it by index.
export function snapshotRouterState(state: RouterState): RouterStateSnapshot {
  const claims: Claim[] = [];
  const ids = new Map<Claim, number>();
  const idOf = (claim: Claim | null): number => {
    if (!claim) return -1;
    const known = ids.get(claim);
    if (known !== undefined) return known;
    ids.set(claim, claims.length);
    claims.push(claim);
    return claims.length - 1;
  };
  // Parties first: the ids are numbered in the order they are met.
  const partyPitches = Array.from(state.partyPitches, idOf);
  const stays = Int32Array.from(state.stays, idOf);
  return {
    ...copyColumns(state, [...ROUTER_COLUMNS, ...ROUTER_VENUE_COLUMNS]),
    occupancy: snapshotOccupancy(state.occupancy),
    errands: copyColumns(state.errands, ERRAND_COLUMNS),
    claims: claims.map((claim) => ({ pitch: claim.pitch, routes: claim.routes })),
    partyPitches,
    stays,
  };
}

// Holders, pitched tiles and promised loungers all follow from who stays where.
export function restoreRouterState(snapshot: RouterStateSnapshot): RouterState {
  const occupancy = createOccupancy(snapshot.doorOf.length, snapshot.balkCount.length);
  restoreOccupancy(occupancy, snapshot.occupancy);
  const claims: Claim[] = snapshot.claims.map((saved) => ({
    pitch: saved.pitch,
    routes: saved.routes,
    holders: 0,
  }));
  const stays = Array.from(snapshot.stays, (id) => claims[id] ?? null);
  for (const claim of stays) if (claim) claim.holders++;
  const columns = copyColumns(snapshot, [...ROUTER_COLUMNS, ...ROUTER_VENUE_COLUMNS]);
  return {
    ...columns,
    occupancy,
    errands: copyColumns(snapshot.errands, ERRAND_COLUMNS),
    stays,
    partyPitches: snapshot.partyPitches.map((id) => claims[id] ?? null),
    pitched: new Set(claims.map((claim) => claim.pitch.tile)),
    promised: new Set(
      claims.flatMap((claim) =>
        claim.pitch.spots.map((spot) => spot.seat).filter((seat) => seat >= 0),
      ),
    ),
    asleepCount: columns.asleep.reduce((total, each) => total + each, 0),
  };
}
