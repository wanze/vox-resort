import type { DayReport, PhotoSpot, PhotoTally } from '../../sim/domain/dayReport';

// Each card is a render of the scene, so the wall stays short; the day report keeps the rest.
export const TODAY_SHOWN = 6;

export interface PhotoWall {
  readonly taken: number;
  readonly today: readonly PhotoSpot[];
  readonly yesterday: readonly PhotoSpot[];
  // Both, today's first: the pictures to draw.
  readonly shown: readonly PhotoSpot[];
}

const mostPhotographed = (spots: readonly PhotoSpot[]): readonly PhotoSpot[] =>
  spots.toSorted((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

// Yesterday's are the last report's, already cut to its top three.
export function photoWallOf(today: PhotoTally | null, history: readonly DayReport[]): PhotoWall {
  const todays = mostPhotographed(today?.spots ?? []).slice(0, TODAY_SHOWN);
  const yesterday = history.at(-1)?.photos?.spots ?? [];
  return { taken: today?.taken ?? 0, today: todays, yesterday, shown: [...todays, ...yesterday] };
}
