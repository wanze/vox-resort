import { z } from 'zod';
import { int32, uint8 } from './resortSnapshot';
import { sandRoutesSchema } from './routerSnapshot';

// -1 for the index the order does not name: a venue order has no tile, and the other way round.
const orderSchema = z.object({
  role: z.enum(['mechanic', 'cleaner']),
  venue: z.number().int(),
  tile: z.number().int(),
  worker: z.number().int(),
  taken: z.boolean(),
});

// Saved as the router holds them; a new per-worker column goes in here and into the schema, or
// staffRouterState's tests fail.
export const STAFF_COLUMNS = [
  'assigned',
  'until',
  'working',
  'doorOf',
  'tileOf',
  'roomOf',
  'lastStage',
  'sheltering',
  'towerOf',
  'legOf',
  'legRoute',
  'load',
  'restocking',
  'goingHome',
] as const;

export type StaffColumn = (typeof STAFF_COLUMNS)[number];

export const staffRouterSnapshotSchema = z.object({
  assigned: int32,
  until: int32,
  working: uint8,
  doorOf: int32,
  tileOf: int32,
  roomOf: int32,
  lastStage: int32,
  sheltering: uint8,
  towerOf: int32,
  legOf: int32,
  legRoute: sandRoutesSchema,
  load: uint8,
  restocking: uint8,
  goingHome: uint8,
  now: z.number(),
  random: z.number().int(),
  // Optional, so a save from before orders loads with none open.
  orders: z.array(orderSchema).optional(),
});

export type StaffRouterSnapshot = z.infer<typeof staffRouterSnapshotSchema>;

export function staffPerWorker(snapshot: StaffRouterSnapshot): readonly ArrayLike<unknown>[] {
  return STAFF_COLUMNS.map((key) => snapshot[key]);
}

// Venue and lodging indices are into the lists the snapshot was taken on; one past the end of
// either means another list.
export function staffVenuesMatch(
  snapshot: StaffRouterSnapshot,
  venues: number,
  lodgings = 0,
): boolean {
  const within = (venue: number): boolean => venue < venues;
  return (
    snapshot.assigned.every(within) &&
    snapshot.lastStage.every(within) &&
    snapshot.roomOf.every((lodging) => lodging < lodgings) &&
    (snapshot.orders ?? []).every((order) => within(order.venue))
  );
}
