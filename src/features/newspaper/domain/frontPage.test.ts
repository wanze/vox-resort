import { describe, expect, it } from 'vitest';
import type { Review } from '../../sim/domain/reviews';
import { amountNote, frontPageOf, percentNote, starsNote } from './frontPage';
import { SAMPLES } from './sampleEditions';

const review = (party: number, stars: number, parts: Partial<Review> = {}): Review => ({
  party,
  family: `Family${party}`,
  partyKind: 'family',
  name: `Guest ${party}`,
  nights: 3,
  stars,
  complaint: 'queue-too-long',
  praise: 'sunset',
  subject: 'Tiki Bar',
  ...parts,
});

const figure = (page: ReturnType<typeof frontPageOf>, label: string) =>
  page.figures.find((each) => each.label === label);

describe('the front page', () => {
  it('fills every field for an edition with no reviews, no voices and no season before', () => {
    const page = frontPageOf(SAMPLES.empty);
    expect(page.masthead).toBe('The Coral Cove Courier');
    expect(page.headline).not.toBe('');
    expect(page.deck).not.toBe('');
    expect(page.story.length).toBeGreaterThanOrEqual(2);
    expect(page.figures.length).toBeGreaterThan(0);
    expect(page.outlook.text).toContain('Season 2 opens');
    expect(page.letters).toEqual([]);
    expect(page.briefs.length).toBeGreaterThan(0);
    expect(page.desk.items.length).toBeGreaterThan(0);
    expect(page.ads).toHaveLength(2);
    expect(page.caption).toBeNull();
    expect(JSON.stringify(page)).not.toMatch(/\{\w+\}|undefined|NaN/);
  });

  it('notes each figure against the season before', () => {
    const page = frontPageOf(SAMPLES.good);
    expect(figure(page, 'Mean rating')).toMatchObject({ value: '4.3 ★', note: '▲ 0.5' });
    expect(figure(page, 'Guests arrived')).toMatchObject({ value: '2,140', note: '▲ 23 %' });
    expect(figure(page, 'Season result')).toMatchObject({ value: '+18,420', note: '▲ 9,300' });
    expect(figure(page, 'Costs')!.value).toBe('−35,780');
    expect(page.story.length).toBeGreaterThanOrEqual(3);
    expect(page.story.length).toBeLessThanOrEqual(4);
  });

  it('prints a bad season as the Bugle, with a kicker and the worst day', () => {
    const page = frontPageOf(SAMPLES.bad);
    expect(page.tone).toBe('tabloid');
    expect(page.masthead).toBe('The Coral Cove Bugle');
    expect(page.kicker).not.toBeNull();
    expect(figure(page, 'Mean rating')!.note).toBe('▼ 1.2');
    expect(figure(page, 'Worst day')!.value).toBe('1.9 ★');
    expect(page.desk.title).toBe('Our verdict');
    expect(page.ads.map((ad) => ad.title)).toContain('WANTED: LIFEGUARDS');
  });

  it('shows no money in a sandbox', () => {
    const page = frontPageOf(SAMPLES.sandbox);
    for (const label of ['Takings', 'Costs', 'Season result', 'In the bank']) {
      expect(figure(page, label)).toBeUndefined();
    }
    expect(JSON.stringify(page)).not.toMatch(/18,420|52,960|in the black|in the red/);
  });

  it('prints three letters or fewer, never the same review twice', () => {
    const reviews = [
      review(1, 5, { complaint: null, subject: null }),
      review(2, 1, { praise: null }),
      review(3, 3),
      review(4, 5, { complaint: null, subject: null, partyKind: 'solo', name: 'Ines Moreau' }),
    ];
    const page = frontPageOf({ ...SAMPLES.good, reviews });
    expect(page.letters).toHaveLength(3);
    expect(page.letters[0]).toEqual({
      quote: 'What a sunset!',
      stars: 5,
      by: 'The Family1 family, 3 nights',
    });
    expect(page.letters[1]!.quote).toBe('The line at Tiki Bar was too long.');
    expect(new Set(page.letters.map((letter) => letter.by)).size).toBe(3);
    const one = frontPageOf({ ...SAMPLES.good, reviews: [review(9, 4)] });
    expect(one.letters).toHaveLength(1);
  });

  it('captions the photo by where it came from', () => {
    const guests = frontPageOf({
      ...SAMPLES.good,
      photo: { from: 'guests', subject: 'Sunset at the Pier', minute: 1_190 },
    });
    expect(guests.caption!.lead).toBe('Guests’ favourite view: Sunset at the Pier.');
    expect(guests.caption!.text).toContain('19:50');
    const player = frontPageOf({
      ...SAMPLES.good,
      photo: { from: 'player', day: 70, minute: 1_160 },
    });
    expect(player.caption!.text).toBe('Photographed by the management on day 71 at 19:20.');
  });
});

describe('a figure’s note', () => {
  it('says up or down, by how much, and nothing when unchanged', () => {
    expect(starsNote(4.3, 3.8)).toBe('▲ 0.5');
    expect(starsNote(3.8, 3.8)).toBe('');
    expect(starsNote(4, null)).toBe('');
    expect(percentNote(1_180, 1_740)).toBe('▼ 32 %');
    expect(percentNote(10, 0)).toBe('');
    expect(amountNote(-6_210, 9_120)).toBe('▼ 15,330');
  });
});
