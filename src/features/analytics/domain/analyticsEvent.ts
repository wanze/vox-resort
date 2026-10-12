import { z } from 'zod';

export const EVENTS_PATH = '/e';

export const MAX_BODY_BYTES = 16_384;

export const MAX_EVENTS = 20;

const MAX_TEXT = 64;

const EVENT_NAMES = [
  'session_start',
  'game_started',
  'played',
  'photo_taken',
  'share_created',
  'app_installed',
] as const;

const text = z.string().max(MAX_TEXT);
// Wide enough for a tycoon's balance, narrow enough that one forged value cannot swamp a sum.
const amount = z.number().min(-1e9).max(1e9);

export const eventSchema = z.strictObject({
  name: z.enum(EVENT_NAMES),
  renderer: z.enum(['webgpu', 'webgl2']).optional(),
  mode: z.enum(['sandbox', 'tycoon']).optional(),
  source: text.optional(),
  medium: text.optional(),
  campaign: text.optional(),
  display: z.enum(['standalone', 'browser']).optional(),
  entry: z.enum(['direct', 'link']).optional(),
  elapsedMs: amount,
  visibleMs: amount.optional(),
  returning: z.literal([0, 1]).optional(),
  tiles: amount.optional(),
  objects: amount.optional(),
  paths: amount.optional(),
  guests: amount.optional(),
  staff: amount.optional(),
  rating: amount.optional(),
  balance: amount.optional(),
  land: amount.optional(),
  day: amount.optional(),
  startupMs: amount.optional(),
});

export type AnalyticsEvent = z.infer<typeof eventSchema>;

export type EventDraft = Omit<AnalyticsEvent, 'elapsedMs'>;

// Per page load and never stored, so it ties a visit's events together without a visitor ID.
const batchSchema = z.strictObject({
  session: z.string().regex(/^[a-z0-9]{8,24}$/),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS),
});

export type EventBatch = z.infer<typeof batchSchema>;

export function readBatch(body: string): EventBatch | null {
  try {
    const parsed = batchSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type TextField = {
  [K in keyof AnalyticsEvent]-?: AnalyticsEvent[K] extends string | undefined ? K : never;
}[keyof AnalyticsEvent];
type NumberField = {
  [K in keyof AnalyticsEvent]-?: AnalyticsEvent[K] extends number | undefined ? K : never;
}[keyof AnalyticsEvent];

// Analytics Engine stores columns by position (blob1, double1, ...), so a field keeps its place
// for good: only ever append. blob1 to blob5 are the event and the visitor, then these.
export const TEXT_COLUMNS = [
  'renderer',
  'mode',
  'source',
  'medium',
  'campaign',
  'display',
  'entry',
] as const satisfies readonly Exclude<TextField, 'name'>[];

export const NUMBER_COLUMNS = [
  'elapsedMs',
  'visibleMs',
  'returning',
  'tiles',
  'objects',
  'paths',
  'guests',
  'staff',
  'rating',
  'balance',
  'land',
  'day',
  'startupMs',
] as const satisfies readonly NumberField[];

export interface Visitor {
  readonly country: string;
  readonly os: string;
  readonly browser: string;
  readonly device: string;
}

export interface DataPoint {
  readonly indexes: [string];
  readonly blobs: string[];
  readonly doubles: number[];
}

export function dataPointOf(session: string, event: AnalyticsEvent, visitor: Visitor): DataPoint {
  return {
    indexes: [session],
    blobs: [
      event.name,
      visitor.country,
      visitor.os,
      visitor.browser,
      visitor.device,
      ...TEXT_COLUMNS.map((field) => event[field] ?? ''),
    ],
    doubles: NUMBER_COLUMNS.map((field) => event[field] ?? 0),
  };
}
