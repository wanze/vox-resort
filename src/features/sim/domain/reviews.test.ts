import { describe, expect, it } from 'vitest';
import { keepReview, quoteOf, REVIEWS_KEPT, reviewFor, type Review } from './reviews';
import { createThoughts, REPEAT_TICKS, think, type ThoughtKind, type Thoughts } from './thoughts';

const often = (
  thoughts: Thoughts,
  person: number,
  kind: ThoughtKind,
  subject: string | null,
  times: number,
): void => {
  for (let time = 0; time < times; time++)
    think(thoughts, person, kind, subject, time * REPEAT_TICKS);
};

const reviewOf = (
  thoughts: Thoughts,
  members: readonly number[],
  happiness: (person: number) => number = () => 0.8,
  spokesperson = members[0]!,
): Review =>
  reviewFor({
    thoughts,
    members,
    spokesperson,
    party: 0,
    family: 'Keller',
    partyKind: 'family',
    name: 'Marta Keller',
    nights: 4,
    happiness,
  });

describe('a review on the way out', () => {
  it('gives stars for how good a time the party had, and never fewer than one', () => {
    const thoughts = createThoughts(3);
    const moods = [0.9, 0.7, 0.5];
    expect(reviewOf(thoughts, [0, 1, 2], (person) => moods[person]!).stars).toBe(4);
    expect(reviewOf(thoughts, [0, 1], () => 1).stars).toBe(5);
    expect(reviewOf(thoughts, [0, 1], () => 0).stars).toBe(1);
  });

  it('complains about what the whole party complained of most', () => {
    const thoughts = createThoughts(3);
    often(thoughts, 0, 'closed', 'Pool', 3);
    often(thoughts, 1, 'queue-too-long', 'Bar', 2);
    often(thoughts, 2, 'queue-too-long', 'Bar', 2);
    expect(reviewOf(thoughts, [0, 1, 2]).complaint).toBe('queue-too-long');
  });

  it('names what the complaint was about from whichever member had it', () => {
    const thoughts = createThoughts(3);
    often(thoughts, 0, 'closed', 'Pool', 1);
    often(thoughts, 2, 'filthy', 'Snack Bar', 3);
    const review = reviewOf(thoughts, [0, 1, 2]);
    expect(review.complaint).toBe('filthy');
    expect(review.subject).toBe('Snack Bar');
  });

  it("prefers the spokesperson's own subject where they had the complaint too", () => {
    const thoughts = createThoughts(3);
    often(thoughts, 0, 'filthy', 'Bakery', 2);
    often(thoughts, 1, 'filthy', 'Bar', 2);
    expect(reviewOf(thoughts, [0, 1], undefined, 1).subject).toBe('Bar');
  });

  it('has neither a complaint nor a praise from a party that thought nothing', () => {
    const review = reviewOf(createThoughts(2), [0, 1]);
    expect(review.complaint).toBeNull();
    expect(review.praise).toBeNull();
    expect(review.subject).toBeNull();
  });

  it('praises whichever the party thought more often', () => {
    const thoughts = createThoughts(2);
    often(thoughts, 0, 'enjoyed', 'Pool', 1);
    often(thoughts, 1, 'lovely', null, 2);
    const review = reviewOf(thoughts, [0, 1]);
    expect(review.praise).toBe('lovely');
    expect(review.complaint).toBeNull();
  });

  it('quotes a happy party on what it liked, and anybody else on what went wrong', () => {
    const base = reviewOf(createThoughts(1), [0]);
    const both = { ...base, complaint: 'closed', praise: 'lovely' } as const;
    expect(quoteOf({ ...both, stars: 5 })).toBe('lovely');
    expect(quoteOf({ ...both, stars: 3 })).toBe('closed');
    expect(quoteOf({ ...both, stars: 5, praise: null })).toBe('closed');
    expect(quoteOf({ ...both, stars: 2, complaint: null })).toBe('lovely');
    expect(quoteOf(base)).toBeNull();
  });

  it('keeps the newest reviews first, and no more than it keeps', () => {
    const thoughts = createThoughts(1);
    let kept: readonly Review[] = [];
    for (let nights = 1; nights <= REVIEWS_KEPT + 3; nights++) {
      kept = keepReview(kept, { ...reviewOf(thoughts, [0]), nights });
    }
    expect(kept).toHaveLength(REVIEWS_KEPT);
    expect(kept[0]!.nights).toBe(REVIEWS_KEPT + 3);
    expect(kept.at(-1)!.nights).toBe(4);
  });
});
