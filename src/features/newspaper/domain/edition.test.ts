import { describe, expect, it } from 'vitest';
import type { Review } from '../../sim/domain/reviews';
import { closeSeason, startTally, type SeasonReport } from '../../sim/domain/season';
import { EDITION_REVIEWS, editionNow, editionOf, editionSchema } from './edition';

const seasonReport = (number: number, meanStars: number | null): SeasonReport => ({
  ...closeSeason(startTally(), { number, startedOn: (number - 1) * 30, state: 'break' }, 0),
  meanStars,
});

const review = (party: number): Review => ({
  party,
  family: 'Novak',
  partyKind: 'family',
  name: 'Ana Novak',
  nights: 3,
  stars: 4,
  complaint: null,
  praise: 'sunset',
  subject: null,
});

const PARTS = {
  gameId: 'game-1',
  printedOn: 88,
  resortName: 'Coral Cove',
  mode: 'tycoon' as const,
  reviews: [] as readonly Review[],
  photo: null,
};

describe('an edition', () => {
  it('is printed from the last season, with the one before for comparison', () => {
    const seasons = [seasonReport(1, 3.1), seasonReport(2, 4.2), seasonReport(3, 3.8)];
    const edition = editionOf({ ...PARTS, seasons })!;
    expect(edition.season).toBe(3);
    expect(edition.report).toBe(seasons[2]);
    expect(edition.previous).toBe(seasons[1]);
    expect(edition.bestBefore).toBe(4.2);
  });

  it('has nothing to compare in a first season, and nothing at all before one', () => {
    const edition = editionOf({ ...PARTS, seasons: [seasonReport(1, null)] })!;
    expect(edition.previous).toBeNull();
    expect(edition.bestBefore).toBeNull();
    expect(editionOf({ ...PARTS, seasons: [] })).toBeNull();
  });

  it('keeps the newest reviews only', () => {
    const reviews = Array.from({ length: 12 }, (_, at) => review(at));
    const edition = editionOf({ ...PARTS, seasons: [seasonReport(1, 4)], reviews })!;
    expect(edition.reviews).toHaveLength(EDITION_REVIEWS);
    expect(edition.reviews[0]!.party).toBe(0);
  });

  it('reads back what it stored, and refuses a photo from nowhere', () => {
    const edition = editionOf({
      ...PARTS,
      seasons: [seasonReport(1, 4)],
      reviews: [review(1)],
      photo: { from: 'guests', subject: 'Sunset at the Pier', minute: 1_190 },
    })!;
    expect(editionSchema.parse(structuredClone(edition))).toEqual(edition);
    const odd = { ...edition, photo: { from: 'drone', minute: 0 } };
    expect(editionSchema.safeParse(odd).success).toBe(false);
  });
});

describe('an edition from what the HUD was told', () => {
  const told = {
    gameId: 'game-1',
    seasons: [seasonReport(1, 3.6)],
    status: { day: 29 },
    name: 'Coral Cove',
    ledger: { mode: 'tycoon' as const },
    voices: { reviews: [review(1)] },
  };

  it('prints the season that just closed, on the day it closed', () => {
    const edition = editionNow(told, null)!;
    expect(edition).toMatchObject({ gameId: 'game-1', season: 1, printedOn: 29, mode: 'tycoon' });
    expect(edition.reviews).toHaveLength(1);
  });

  it('prints nothing before a resort stands, and names one not yet told', () => {
    expect(editionNow({ ...told, gameId: null }, null)).toBeNull();
    expect(editionNow({ ...told, seasons: [] }, null)).toBeNull();
    const early = editionNow({ ...told, name: null, ledger: null, status: null }, null)!;
    expect(early).toMatchObject({ resortName: 'Vox Resort', mode: 'sandbox', printedOn: 0 });
  });
});
