import { describe, expect, it } from 'vitest';
import { BAD, editionWith, SAMPLES, seasonReport } from './sampleEditions';
import { STORY_KINDS, storiesOf, toneOf, type StoryKind } from './stories';

const MONEY_KINDS: readonly StoryKind[] = ['in-the-red', 'best-day'];

const MONEY_FACTS = ['profit', 'loss', 'balance', 'bestTakings'];

describe('the stories of a season', () => {
  it('leads a good second season with its record', () => {
    const stories = storiesOf(SAMPLES.good);
    expect(stories[0]!.kind).toBe('record-season');
    expect(toneOf(SAMPLES.good)).toBe('broadsheet');
    expect(stories.map((story) => story.kind)).toEqual(
      expect.arrayContaining(['best-ever-stars', 'turned-away', 'fireworks', 'photos']),
    );
  });

  it('prints a losing tycoon season as a tabloid led by the loss or the slump', () => {
    expect(toneOf(SAMPLES.bad)).toBe('tabloid');
    expect(['in-the-red', 'stars-slump']).toContain(storiesOf(SAMPLES.bad)[0]!.kind);
  });

  it('never mentions money in a sandbox', () => {
    const stories = storiesOf(SAMPLES.sandbox);
    for (const story of stories) {
      expect(MONEY_KINDS).not.toContain(story.kind);
      for (const fact of MONEY_FACTS) expect(story.facts).not.toHaveProperty(fact);
    }
    expect(toneOf({ ...SAMPLES.bad, mode: 'sandbox', report: { ...BAD, meanStars: 3.5 } })).toBe(
      'broadsheet',
    );
  });

  it('compares a first season with nothing', () => {
    const stories = storiesOf(SAMPLES.first);
    expect(stories[0]!.kind).toBe('first-season');
    for (const story of stories) {
      expect(['record-season', 'stars-slump', 'best-ever-stars']).not.toContain(story.kind);
      expect(story.facts).not.toHaveProperty('previousStars');
    }
  });

  it('has a story to tell for a season with nothing in it', () => {
    const quiet = editionWith([seasonReport(1, {}), seasonReport(2, {})]);
    expect(storiesOf(quiet).map((story) => story.kind)).toEqual(['season-closes']);
  });

  it('can tell every kind of story among the samples', () => {
    const told = new Set(Object.values(SAMPLES).flatMap((edition) => storiesOf(edition)));
    expect(new Set([...told].map((story) => story.kind))).toEqual(new Set(STORY_KINDS));
  });
});
