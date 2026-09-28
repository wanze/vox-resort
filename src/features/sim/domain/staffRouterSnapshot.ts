import { z } from 'zod';
import { int32, uint8 } from './resortSnapshot';
import { sandRoutesSchema } from './routerSnapshot';

export const staffRouterSnapshotSchema = z.object({
  assigned: int32,
  until: int32,
  working: uint8,
  doorOf: int32,
  tileOf: int32,
  lastStage: int32,
  sheltering: uint8,
  towerOf: int32,
  legOf: int32,
  legRoute: sandRoutesSchema,
  now: z.number(),
  random: z.number().int(),
});

export type StaffRouterSnapshot = z.infer<typeof staffRouterSnapshotSchema>;

export function staffPerWorker(snapshot: StaffRouterSnapshot): readonly ArrayLike<unknown>[] {
  return [
    snapshot.assigned,
    snapshot.until,
    snapshot.working,
    snapshot.doorOf,
    snapshot.tileOf,
    snapshot.lastStage,
    snapshot.sheltering,
    snapshot.towerOf,
    snapshot.legOf,
    snapshot.legRoute,
  ];
}

// Venue indices are into the list the snapshot was taken on; one past its end means another list.
export function staffVenuesMatch(snapshot: StaffRouterSnapshot, venues: number): boolean {
  const within = (venue: number): boolean => venue < venues;
  return snapshot.assigned.every(within) && snapshot.lastStage.every(within);
}
