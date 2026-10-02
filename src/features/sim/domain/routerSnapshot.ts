import { z } from 'zod';
import type { Pitch } from './beachPitch';
import { float64, int32, int8, uint8 } from './resortSnapshot';
import type { SandRoute } from './sandRoute';

const index = z.number().int();

const sandRouteSchema = z.object({
  gate: index,
  waypoints: z.array(z.object({ x: z.number(), z: z.number() })).readonly(),
  length: z.number(),
}) satisfies z.ZodType<SandRoute>;

export const sandRoutesSchema = z.array(sandRouteSchema.nullable());

const pitchSchema = z.object({
  x: z.number(),
  z: z.number(),
  tile: index,
  spots: z
    .array(
      z.object({
        x: z.number(),
        z: z.number(),
        y: z.number(),
        heading: z.number(),
        seat: index,
        pose: z.number(),
      }),
    )
    .readonly(),
}) satisfies z.ZodType<Pitch>;

// A claim is shared by a party's pitch and each member's stay, so the table is saved once and
// both point into it by index, -1 for none.
export const routerSnapshotSchema = z.object({
  goals: z.object({ venue: int32, need: int8 }),
  occupancy: z.object({
    state: uint8,
    at: int32,
    until: float64,
    slot: int32,
    queues: z.array(z.array(index)),
  }),
  errands: z.object({ venue: int32, route: sandRoutesSchema, leg: int32, back: uint8 }),
  doorOf: int32,
  justLeft: int32,
  leaving: uint8,
  asleep: uint8,
  homeward: uint8,
  homeLodging: int32,
  arriving: uint8,
  claims: z.array(z.object({ pitch: pitchSchema, routes: z.array(sandRouteSchema).readonly() })),
  partyPitches: z.array(index),
  stays: int32,
  spotOf: int32,
  fetching: int32,
  stayUntil: int32,
  stayRoutes: sandRoutesSchema,
  lookAgainAt: int32,
  balkCount: int32,
  visitCount: int32,
  fieldsBuilt: z.array(index),
  stepFreeFieldsBuilt: z.array(index).optional().default([]),
  now: z.number(),
  random: index,
});

export type RouterSnapshot = z.infer<typeof routerSnapshotSchema>;

export function routerPerPerson(snapshot: RouterSnapshot): readonly ArrayLike<unknown>[] {
  const { goals, occupancy, errands } = snapshot;
  return [
    goals.venue,
    goals.need,
    occupancy.state,
    occupancy.at,
    occupancy.until,
    occupancy.slot,
    errands.venue,
    errands.route,
    errands.leg,
    errands.back,
    snapshot.doorOf,
    snapshot.justLeft,
    snapshot.leaving,
    snapshot.asleep,
    snapshot.homeward,
    snapshot.homeLodging,
    snapshot.arriving,
    snapshot.stays,
    snapshot.spotOf,
    snapshot.fetching,
    snapshot.stayUntil,
    snapshot.stayRoutes,
    snapshot.lookAgainAt,
  ];
}

// The router's venue list, the beach included, must be the one the snapshot was taken on.
export function routerVenuesMatch(snapshot: RouterSnapshot, venues: number): boolean {
  const { occupancy, balkCount, visitCount, fieldsBuilt } = snapshot;
  const sized = [occupancy.queues.length, balkCount.length, visitCount.length];
  return (
    sized.every((length) => length === venues) &&
    fieldsBuilt.every((venue) => venue >= 0 && venue < venues)
  );
}
