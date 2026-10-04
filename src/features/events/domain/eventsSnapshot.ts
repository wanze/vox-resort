import { z } from 'zod';
import { isEventKind } from './catalogue';
import type { EventRun, EventsState } from './eventRuns';
import type { Booking, Occurrence } from './programme';

const count = z.number().int().nonnegative();

const siteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stage'), venue: z.string() }),
  z.object({ kind: z.literal('beach') }),
]);

const repeatSchema = z.discriminatedUnion('every', [
  z.object({ every: z.literal('day') }),
  z.object({ every: z.literal('week'), weekday: z.literal([0, 1, 2, 3, 4, 5, 6]) }),
  z.object({ every: z.literal('once'), day: z.number().int() }),
]);

// The kind as a plain string, so a save holding a kind from a later version still loads.
const bookingSchema = z.object({
  id: count,
  kind: z.string(),
  site: siteSchema,
  repeat: repeatSchema,
  start: count,
  tier: z.string().exactOptional(),
  builtIn: z.string().exactOptional(),
  off: z.boolean().exactOptional(),
});

const occurrenceSchema = z.object({
  booking: count,
  kind: z.string(),
  site: siteSchema,
  day: z.number().int(),
  start: z.number().int(),
  end: z.number().int(),
  tier: z.string().exactOptional(),
});

const runSchema = z.object({
  occurrence: occurrenceSchema,
  phase: z.enum(['announced', 'running']),
  parties: z.array(count),
  attended: z.array(count),
  paid: z.number(),
  salt: z.number(),
});

export const eventsSnapshotSchema = z.object({
  programme: z.object({ bookings: z.array(bookingSchema), nextId: count }),
  runs: z.array(runSchema),
  glow: z.instanceof(Float32Array),
  tired: z.array(count),
});

export type EventsSnapshot = z.infer<typeof eventsSnapshotSchema>;

export function snapshotEvents(state: EventsState): EventsSnapshot {
  return {
    programme: {
      bookings: state.programme.bookings.map((booking) => ({ ...booking })),
      nextId: state.programme.nextId,
    },
    runs: state.runs.map((run) => ({
      occurrence: { ...run.occurrence },
      phase: run.phase,
      parties: [...run.parties],
      attended: [...run.attended],
      paid: run.paid,
      salt: run.salt,
    })),
    glow: state.glow.slice(),
    tired: [...state.tired],
  };
}

const known = <T extends { readonly kind: string }>(
  each: T,
): each is T & { readonly kind: Booking['kind'] } => isEventKind(each.kind);

// Padded to the population, which a settle can have grown since the save.
export function restoreEvents(snapshot: EventsSnapshot, people: number): EventsState {
  const glow = new Float32Array(people);
  glow.set(snapshot.glow.subarray(0, people));
  const runs: EventRun[] = snapshot.runs
    .filter((run) => known(run.occurrence))
    .map((run) => ({
      occurrence: { ...run.occurrence } as Occurrence,
      phase: run.phase,
      parties: [...run.parties],
      attended: new Set(run.attended),
      paid: run.paid,
      salt: run.salt,
    }));
  return {
    programme: {
      bookings: snapshot.programme.bookings.filter(known),
      nextId: snapshot.programme.nextId,
    },
    runs,
    glow,
    tired: new Set(snapshot.tired),
  };
}
