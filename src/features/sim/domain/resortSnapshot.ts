import { z } from 'zod';
import type { Home } from '../../guests/domain/homes';
import type { Party } from '../../guests/domain/parties';
import { HISTORY_DAYS, type DayCounts, type DayReport } from './dayReport';
import type { Ledger } from './ledger';
import type { Rating } from './rating';
import type { Review } from './reviews';
import { SIM_SPEEDS } from './simClock';
import type { Hiring } from './staff';
import { THOUGHT_KINDS, widenThoughts, type ThoughtTally } from './thoughts';
import { PHOTO_KINDS } from './views';
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
  // Saves from before wheelchairs load with nobody in one.
  wheelchair: z.number().int().optional().default(-1),
}) satisfies z.ZodType<Party, unknown>;

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
  unmade: int32,
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
  health: float32,
});

export type NeedsSnapshot = z.infer<typeof needsSnapshotSchema>;

export const happinessSnapshotSchema = z.object({
  level: float32,
  stay: float32,
  // Saves from before expectations load with every guest easy-going. Not length-checked: a save
  // widened to more people keeps it short, and the bodies past it stay easy-going till check-in.
  expects: float32.exactOptional(),
});

export type HappinessSnapshot = z.infer<typeof happinessSnapshotSchema>;

const thoughtKind = z.enum(THOUGHT_KINDS);

const tallySchema = z.object({
  kind: thoughtKind,
  subject: z.string().nullable(),
  count,
}) satisfies z.ZodType<ThoughtTally>;

const savedThoughtsSchema = z.object({
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

export type ThoughtsSnapshot = z.infer<typeof savedThoughtsSchema>;

export const thoughtsSnapshotSchema = savedThoughtsSchema.transform(widenThoughts);

export const upkeepSnapshotSchema = z.object({ keys: z.array(z.string()), level: float32 });

export type UpkeepSnapshot = z.infer<typeof upkeepSnapshotSchema>;

export const breakdownsSnapshotSchema = z.object({
  keys: z.array(z.string()),
  broken: uint8,
  since: int32,
  worn: int32,
});

export type BreakdownsSnapshot = z.infer<typeof breakdownsSnapshotSchema>;

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
  praiseSubject: z.string().exactOptional(),
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
  // Saves from before land was sold have no column for it.
  land: z.number().default(0),
  visit: z.number(),
  night: z.number(),
  wages: z.number(),
  // Saves from before events were booked have no column for them.
  events: z.number().default(0),
  maintenance: z.number(),
});

const bedsSchema = z.object({ total: count, taken: count });

// Absent in saves from before events, which read as none held.
const eventTallySchema = z.object({
  held: count,
  audience: count,
  called: count,
  // Absent in saves from before the fireworks, and on a day with none.
  fireworks: count.exactOptional(),
  postponed: count.exactOptional(),
});

// Absent in saves from before the welcome meeting.
const welcomeTallySchema = z.object({
  welcomed: count,
  gap: z.enum(['no-stage', 'off', 'called-off']).nullable(),
});

// Absent in saves from before photos, and on a day nobody took one.
const photoTallySchema = z.object({
  taken: count,
  spots: z.array(
    z.object({
      key: z.string(),
      subject: z.string(),
      kind: z.enum(PHOTO_KINDS),
      count,
      x: z.number(),
      y: z.number(),
      z: z.number(),
      heading: z.number(),
      minute: count,
      fov: z.number().exactOptional(),
      tilt: z.number().exactOptional(),
    }),
  ),
});

const dayCountsSchema = z.object({
  from: count,
  arrived: count,
  left: count,
  reviews: count,
  reviewStars: z.number(),
  events: eventTallySchema.exactOptional(),
  welcome: welcomeTallySchema.exactOptional(),
  photos: photoTallySchema.exactOptional(),
}) satisfies z.ZodType<DayCounts>;

const dayReportSchema = z.object({
  day: count,
  rating: ratingSchema,
  present: count,
  beds: bedsSchema,
  arrived: count,
  left: count,
  reviews: count,
  meanReview: z.number().nullable(),
  money: columnSchema,
  balance: z.number(),
  loudest: z.array(tallySchema),
  events: eventTallySchema.exactOptional(),
  welcome: welcomeTallySchema.exactOptional(),
  photos: photoTallySchema.exactOptional(),
}) satisfies z.ZodType<DayReport>;

const ledgerSchema = z.object({
  balance: z.number(),
  today: columnSchema,
  yesterday: columnSchema,
  mode: z.enum(['sandbox', 'tycoon']),
}) satisfies z.ZodType<Ledger>;

const hiringSchema = z.object({
  cleaner: count.nullable(),
  lifeguard: count.nullable(),
  animator: count.nullable(),
  mechanic: count.nullable(),
}) satisfies z.ZodType<Hiring>;

export const resortSnapshotSchema = z.object({
  guests: guestsSnapshotSchema,
  needs: needsSnapshotSchema,
  happiness: happinessSnapshotSchema,
  thoughts: thoughtsSnapshotSchema,
  carrying: int8,
  litter: float32,
  upkeep: upkeepSnapshotSchema,
  breakdowns: breakdownsSnapshotSchema,
  takings: z.array(z.tuple([z.string(), z.number()])),
  // Placement key to venue name; a save from before venues had names draws them on load.
  names: z
    .array(z.tuple([z.string(), z.string()]))
    .optional()
    .default([]),
  footfall: z.object({ seen: float32, mood: float32 }),
  reviews: z.array(reviewSchema),
  today: dayCountsSchema,
  history: z.array(dayReportSchema).max(HISTORY_DAYS),
  rating: ratingSchema,
  ledger: ledgerSchema,
  arrivals: z.object({ planned: count, admitted: count, random: z.number().int() }),
  open: z.boolean(),
  beds: bedsSchema,
  hiring: hiringSchema,
  zones: int8,
  // Absent in saves from before photos, which load with nobody having taken one.
  photos: z.object({ lastAt: int32, heat: float32 }).exactOptional(),
});

export type ResortSnapshot = z.infer<typeof resortSnapshotSchema>;

export type PhotosSnapshot = NonNullable<ResortSnapshot['photos']>;

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
    snapshot.happiness.stay,
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
