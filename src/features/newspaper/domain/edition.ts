import { z } from 'zod';
import type { GameMode } from '../../sim/domain/ledger';
import { reviewSchema, seasonReportSchema } from '../../sim/domain/resortSnapshot';
import type { Review } from '../../sim/domain/reviews';
import type { SeasonReport } from '../../sim/domain/season';

export const EDITION_REVIEWS = 6;

export type EditionPhoto =
  | { readonly from: 'player'; readonly day: number; readonly minute: number }
  | { readonly from: 'guests'; readonly subject: string; readonly minute: number }
  | { readonly from: 'camera'; readonly day: number; readonly minute: number };

// Facts, never words: the paper is written from these each time it opens.
export interface Edition {
  readonly gameId: string;
  readonly season: number;
  // The calendar day the season closed on, for the dateline.
  readonly printedOn: number;
  readonly resortName: string;
  readonly mode: GameMode;
  readonly report: SeasonReport;
  readonly previous: SeasonReport | null;
  // The best mean of the seasons before it that the save still keeps, for a record.
  readonly bestBefore: number | null;
  readonly reviews: readonly Review[];
  readonly photo: EditionPhoto | null;
}

// Null before any season has closed.
export function editionOf(parts: {
  readonly gameId: string;
  readonly printedOn: number;
  readonly resortName: string;
  readonly mode: GameMode;
  // Oldest first, as the resort keeps them; the last is the season just closed.
  readonly seasons: readonly SeasonReport[];
  // Newest first, as the resort keeps them.
  readonly reviews: readonly Review[];
  readonly photo: EditionPhoto | null;
}): Edition | null {
  const report = parts.seasons.at(-1);
  if (!report) return null;
  const earlier = parts.seasons.slice(0, -1).flatMap((season) => season.meanStars ?? []);
  return {
    gameId: parts.gameId,
    season: report.number,
    printedOn: parts.printedOn,
    resortName: parts.resortName,
    mode: parts.mode,
    report,
    previous: parts.seasons.at(-2) ?? null,
    bestBefore: earlier.length > 0 ? Math.max(...earlier) : null,
    reviews: parts.reviews.slice(0, EDITION_REVIEWS),
    photo: parts.photo,
  };
}

// What the HUD was last told as the season closed, which is all a paper needs.
export interface EditionSource {
  readonly gameId: string | null;
  readonly seasons: readonly SeasonReport[];
  readonly status: { readonly day: number } | null;
  readonly name: string | null;
  readonly ledger: { readonly mode: GameMode } | null;
  readonly voices: { readonly reviews: readonly Review[] };
}

const DEFAULT_RESORT_NAME = 'Vox Resort';

// Null before the first resort stands or the first season closes.
export function editionNow(source: EditionSource, photo: EditionPhoto | null): Edition | null {
  if (source.gameId === null) return null;
  return editionOf({
    gameId: source.gameId,
    printedOn: source.status?.day ?? 0,
    resortName: source.name ?? DEFAULT_RESORT_NAME,
    mode: source.ledger?.mode ?? 'sandbox',
    seasons: source.seasons,
    reviews: source.voices.reviews,
    photo,
  });
}

const count = z.number().int().nonnegative();

export const editionPhotoSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('player'), day: z.number().int(), minute: count }),
  z.object({ from: z.literal('guests'), subject: z.string(), minute: count }),
  z.object({ from: z.literal('camera'), day: z.number().int(), minute: count }),
]) satisfies z.ZodType<EditionPhoto>;

export const editionSchema = z.object({
  gameId: z.string(),
  season: z.number().int().positive(),
  printedOn: z.number().int(),
  resortName: z.string(),
  mode: z.enum(['sandbox', 'tycoon']),
  report: seasonReportSchema,
  previous: seasonReportSchema.nullable(),
  bestBefore: z.number().nullable(),
  reviews: z.array(reviewSchema).max(EDITION_REVIEWS),
  photo: editionPhotoSchema.nullable(),
}) satisfies z.ZodType<Edition>;
