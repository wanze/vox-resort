import { z } from 'zod';
import type { Home } from '../../guests/domain/homes';
import type { Party } from '../../guests/domain/parties';
import type { Ledger } from './ledger';
import type { Rating } from './rating';
import type { Review } from './reviews';
import { SIM_SPEEDS } from './simClock';
import { THOUGHT_KINDS, type ThoughtTally } from './thoughts';
import { WEATHERS } from './weather';

const float32 = z.instanceof(Float32Array);
export const float64 = z.instanceof(Float64Array);
export const int32 = z.instanceof(Int32Array);
export const int8 = z.instanceof(Int8Array);
export const uint8 = z.instanceof(Uint8Array);
const uint16 = z.instanceof(Uint16Array);

const count = z.number().int().nonnegative();
const subjects = z.array(z.string().nullable());

const partySchema = z.object({
  kind: z.enum(['family', 'couple', 'friends', 'solo']),
  family: z.string(),
  members: z.array(count),
}) satisfies z.ZodType<Party>;

const homeSchema = z.object({
  key: z.string(),
  id: z.string(),
  label: z.string(),
  beds: count,
}) satisfies z.ZodType<Home>;

export const guestsSnapshotSchema = z.object({
  count,
  party: int32,
  home: int32,
  arrivedOn: int32,
  nights: int32,
  child: uint8,
  variant: int32,
  present: uint8,
  freeBeds: int32,
  people: z.array(z.object({ given: z.string(), family: z.string() })),
  parties: z.array(partySchema),
  homes: z.array(homeSchema),
});

export type GuestsSnapshot = z.infer<typeof guestsSnapshotSchema>;

export const needsSnapshotSchema = z.object({
  hunger: float32,
  thirst: float32,
  energy: float32,
  fun: float32,
  hygiene: float32,
});

export type NeedsSnapshot = z.infer<typeof needsSnapshotSchema>;

export const happinessSnapshotSchema = z.object({ level: float32 });

export type HappinessSnapshot = z.infer<typeof happinessSnapshotSchema>;

const thoughtKind = z.enum(THOUGHT_KINDS);

const tallySchema = z.object({
  kind: thoughtKind,
  subject: z.string().nullable(),
  count,
}) satisfies z.ZodType<ThoughtTally>;

export const thoughtsSnapshotSchema = z.object({
  kind: int8,
  subject: subjects,
  at: int32,
  stay: uint16,
  worstKind: int8,
  worstSubject: subjects,
  heardAt: int32,
  heardSubject: subjects,
  day: z.array(z.tuple([z.string(), tallySchema])),
});

export type ThoughtsSnapshot = z.infer<typeof thoughtsSnapshotSchema>;

export const upkeepSnapshotSchema = z.object({ keys: z.array(z.string()), level: float32 });

export type UpkeepSnapshot = z.infer<typeof upkeepSnapshotSchema>;

const reviewSchema = z.object({
  party: count,
  family: z.string(),
  partyKind: partySchema.shape.kind,
  name: z.string(),
  nights: count,
  stars: z.number(),
  complaint: thoughtKind.nullable(),
  praise: thoughtKind.nullable(),
  subject: z.string().nullable(),
}) satisfies z.ZodType<Review>;

const ratingSchema = z.object({
  stars: z.number(),
  happiness: z.number(),
  housed: z.number(),
  cleanliness: z.number(),
}) satisfies z.ZodType<Rating>;

const columnSchema = z.object({
  build: z.number(),
  demolish: z.number(),
  dig: z.number(),
  visit: z.number(),
  night: z.number(),
  wages: z.number(),
  maintenance: z.number(),
});

const ledgerSchema = z.object({
  balance: z.number(),
  today: columnSchema,
  yesterday: columnSchema,
  mode: z.enum(['sandbox', 'tycoon']),
}) satisfies z.ZodType<Ledger>;

export const resortSnapshotSchema = z.object({
  guests: guestsSnapshotSchema,
  needs: needsSnapshotSchema,
  happiness: happinessSnapshotSchema,
  thoughts: thoughtsSnapshotSchema,
  carrying: int8,
  litter: float32,
  upkeep: upkeepSnapshotSchema,
  takings: z.array(z.tuple([z.string(), z.number()])),
  footfall: z.object({ seen: float32, mood: float32 }),
  reviews: z.array(reviewSchema),
  rating: ratingSchema,
  ledger: ledgerSchema,
  arrivals: z.object({ planned: count, admitted: count, random: z.number().int() }),
  open: z.boolean(),
  beds: z.object({ total: count, taken: count }),
});

export type ResortSnapshot = z.infer<typeof resortSnapshotSchema>;

export const clockSnapshotSchema = z.object({
  ticks: count,
  speed: z.enum(SIM_SPEEDS),
  carry: z.number(),
  forced: z.enum(WEATHERS).nullable(),
});

export type ClockSnapshot = z.infer<typeof clockSnapshotSchema>;

export function resortPerPerson(snapshot: ResortSnapshot): readonly ArrayLike<unknown>[] {
  const { guests, needs, thoughts } = snapshot;
  return [
    guests.party,
    guests.home,
    guests.arrivedOn,
    guests.nights,
    guests.child,
    guests.variant,
    guests.present,
    guests.people,
    ...Object.values(needs),
    snapshot.happiness.level,
    thoughts.kind,
    thoughts.subject,
    thoughts.at,
    thoughts.worstKind,
    thoughts.worstSubject,
    snapshot.carrying,
  ];
}

// A slot per person and thought kind, so these are THOUGHT_KINDS.length times as long.
export function resortPerThought(snapshot: ResortSnapshot): readonly ArrayLike<unknown>[] {
  const { stay, heardAt, heardSubject } = snapshot.thoughts;
  return [stay, heardAt, heardSubject];
}
