import { z } from 'zod';
import { GUEST_NEEDS } from '../../../../voxel-gen/voxelgen.ts';
import { partyMapOf, type BookingsState } from './bookings';
import { VENUE_FLAGS } from './requirements';

const count = z.number().int().nonnegative();
const day = z.number().int();

const requirementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('need'), value: z.enum([...GUEST_NEEDS, 'health']) }),
  z.object({ kind: z.literal('flag'), value: z.enum(VENUE_FLAGS) }),
  z.object({ kind: z.literal('stars'), value: z.number() }),
  z.object({ kind: z.literal('lodging'), value: z.number() }),
]);

const kindSchema = z.enum(['family', 'couple', 'friends', 'solo', 'wedding']);

const offerSchema = z.object({
  id: count,
  operator: z.string(),
  kind: kindSchema,
  parties: count,
  arrivesOn: day,
  nights: count,
  premium: z.number(),
  promisedStars: z.number(),
  bonusShare: z.number(),
  requirements: z.array(requirementSchema),
  expiresOn: day,
});

const bookingSchema = offerSchema.extend({
  state: z.enum(['booked', 'staying']),
  staying: z.array(count),
  arrived: count,
  stars: z.array(z.number()),
  turnedAway: count,
  expected: z.number(),
  unmet: z.array(requirementSchema),
});

export const settlementSchema = z.object({
  id: count,
  operator: z.string(),
  kind: kindSchema,
  parties: count,
  day,
  meanStars: z.number().nullable(),
  promisedStars: z.number(),
  bonus: z.number(),
  outcome: z.enum(['bonus', 'missed', 'failed']),
});

export const bookingsSnapshotSchema = z.object({
  nextId: count,
  nextOfferOn: day,
  open: z.array(offerSchema),
  accepted: z.array(bookingSchema),
  settled: z.array(settlementSchema),
  demand: z.object({ factor: z.number(), until: day }).nullable(),
});

export type BookingsSnapshot = z.infer<typeof bookingsSnapshotSchema>;

export function snapshotBookings(state: BookingsState): BookingsSnapshot {
  return {
    nextId: state.nextId,
    nextOfferOn: state.nextOfferOn,
    open: state.open.map((offer) => ({ ...offer, requirements: [...offer.requirements] })),
    accepted: state.accepted.map((booking) => ({
      ...booking,
      requirements: [...booking.requirements],
      staying: [...booking.staying],
      stars: [...booking.stars],
      unmet: [...booking.unmet],
    })),
    settled: state.settled.map((settlement) => ({ ...settlement })),
    demand: state.demand ? { ...state.demand } : null,
  };
}

export function restoreBookings(snapshot: BookingsSnapshot): BookingsState {
  return { ...snapshot, partyOf: partyMapOf(snapshot.accepted) };
}
