import type { DayReport, PhotoSpot, PhotoTally } from '../../sim/domain/dayReport';
import type { PhotoKind } from '../../sim/domain/views';

// The rarest and most striking first: a day of sea should not bury its one sunset.
export const WALL_KINDS: readonly PhotoKind[] = [
  'sunset',
  'show',
  'fireworks',
  'sight',
  'sea',
  'water',
  'view',
];

export interface WallCard {
  // A spot's key can be on both days, at different hours and from different places, and today's
  // becomes yesterday's at midnight; the last report's day tells the days apart.
  readonly id: string;
  readonly spot: PhotoSpot;
  readonly daysAgo: 0 | 1;
}

export interface WallGroup {
  readonly kind: PhotoKind;
  readonly cards: readonly WallCard[];
}

export interface PhotoWall {
  readonly taken: number;
  readonly today: readonly WallGroup[];
  readonly yesterday: readonly WallGroup[];
  // Every card, in the order the wall hangs them: what the lightbox steps through.
  readonly shown: readonly WallCard[];
}

// The most photographed of each kind: a wall of a dozen near-identical sea views says less.
export const CARDS_PER_GROUP = 4;

const byCount = (a: PhotoSpot, b: PhotoSpot): number =>
  b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function groupsOf(spots: readonly PhotoSpot[], day: number, daysAgo: 0 | 1): readonly WallGroup[] {
  return WALL_KINDS.flatMap((kind) => {
    const cards = spots
      .filter((spot) => spot.kind === kind)
      .toSorted(byCount)
      .slice(0, CARDS_PER_GROUP)
      .map((spot) => ({ id: `${day - daysAgo}|${spot.key}`, spot, daysAgo }));
    return cards.length > 0 ? [{ kind, cards }] : [];
  });
}

// Yesterday's are the last report's, already cut to the spots it keeps.
export function photoWallOf(today: PhotoTally | null, history: readonly DayReport[]): PhotoWall {
  const last = history.at(-1);
  const day = (last?.day ?? -1) + 1;
  const todays = groupsOf(today?.spots ?? [], day, 0);
  const yesterday = groupsOf(last?.photos?.spots ?? [], day, 1);
  const shown = [...todays, ...yesterday].flatMap((group) => group.cards);
  return { taken: today?.taken ?? 0, today: todays, yesterday, shown };
}

interface Size {
  readonly width: number;
  readonly height: number;
}

// As wide as a card grows in the window, in CSS pixels, at the wall's 3:2.
const CARD = { width: 300, height: 200 } as const;

const ENLARGED = { width: 960, height: 640 } as const;

// Past 3 device pixels to a CSS pixel nobody sees the difference, and the render still costs.
const MAX_DENSITY = 3;

const densityOf = (devicePixelRatio: number): number =>
  Number.isFinite(devicePixelRatio) ? Math.min(Math.max(devicePixelRatio, 1), MAX_DENSITY) : 1;

const inPixels = (size: Size, fit: number, density: number): Size => ({
  width: Math.max(1, Math.floor(size.width * fit * density)),
  height: Math.max(1, Math.floor(size.height * fit * density)),
});

// In device pixels, so a card is sharp on a dense screen.
export function cardSize(devicePixelRatio: number): Size {
  return inPixels(CARD, 1, densityOf(devicePixelRatio));
}

// At the wall's 3:2, never wider or taller than the room the lightbox has, in CSS pixels.
export function enlargedSize(room: Size, devicePixelRatio: number): Size {
  const fit = Math.min(1, room.width / ENLARGED.width, room.height / ENLARGED.height);
  return inPixels(ENLARGED, fit, densityOf(devicePixelRatio));
}
