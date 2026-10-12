import { describe, expect, it } from 'vitest';
import { frontPageOf, type FrontPage } from './frontPage';
import { SAMPLES } from './sampleEditions';
import { STORY_KINDS, storiesOf, type Facts, type StoryKind, type Tone } from './stories';
import {
  COMPLAINT_ADS,
  FILLER_ADS,
  fill,
  placeholdersOf,
  ROOMS_AD,
  seedOf,
  WORDING,
  write,
} from './wording';

const TONES: readonly Tone[] = ['broadsheet', 'tabloid'];

const SLOTS = ['headline', 'deck', 'paragraph'] as const;

// Every fact each kind of story was told with across the samples.
function factsByKind(): ReadonlyMap<StoryKind, Facts> {
  const known = new Map<StoryKind, Facts>();
  for (const edition of Object.values(SAMPLES)) {
    for (const story of storiesOf(edition)) {
      known.set(story.kind, { ...known.get(story.kind), ...story.facts });
    }
  }
  return known;
}

describe('the templates', () => {
  it('have three headlines, two decks and two paragraphs for every kind and tone', () => {
    for (const kind of STORY_KINDS) {
      for (const tone of TONES) {
        const templates = WORDING[kind][tone];
        expect(templates.headline.length).toBeGreaterThanOrEqual(3);
        expect(templates.deck.length).toBeGreaterThanOrEqual(2);
        expect(templates.paragraph.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('leave no placeholder unfilled for any kind told with all its facts', () => {
    const known = factsByKind();
    for (const kind of STORY_KINDS) {
      const facts = known.get(kind)!;
      for (const tone of TONES) {
        for (const slot of SLOTS) {
          for (const template of WORDING[kind][tone][slot]) {
            expect(fill(template, facts), `${kind} ${tone} ${slot}`).not.toMatch(/[{}]/);
          }
        }
      }
    }
  });

  it('keep a template without money in every slot a sandbox can reach', () => {
    for (const story of storiesOf(SAMPLES.sandbox)) {
      for (const tone of TONES) {
        for (const slot of SLOTS) {
          expect(write(WORDING[story.kind][tone][slot], story.facts, 1, 1)).not.toBeNull();
        }
      }
    }
  });

  it('keep the broadsheet calm and the tabloid to one exclamation in a headline', () => {
    for (const kind of STORY_KINDS) {
      for (const slot of SLOTS) {
        for (const template of WORDING[kind].broadsheet[slot]) expect(template).not.toContain('!');
      }
      for (const template of WORDING[kind].tabloid.headline) {
        expect(template.split('!').length).toBeLessThanOrEqual(2);
      }
      for (const template of [...WORDING[kind].tabloid.deck, ...WORDING[kind].tabloid.paragraph]) {
        expect(template).not.toContain('!');
      }
    }
  });

  it('fill every ad from facts a season has', () => {
    const ads = [ROOMS_AD, ...Object.values(COMPLAINT_ADS), ...FILLER_ADS];
    const allowed = new Set(['turned', 'where', 'voice', 'times']);
    for (const ad of ads)
      for (const key of placeholdersOf(ad!.text)) expect(allowed).toContain(key);
    expect(FILLER_ADS.length).toBeGreaterThanOrEqual(2);
  });
});

const slotsOf = (page: FrontPage): readonly string[] => [
  page.headline,
  page.deck,
  ...page.story,
  page.ears.weather,
];

describe('the seeded pick', () => {
  it('words an edition the same way every time', () => {
    expect(frontPageOf(SAMPLES.good)).toEqual(frontPageOf(SAMPLES.good));
    expect(seedOf('game-1', 3)).toBe(seedOf('game-1', 3));
  });

  it('words two seasons of one game differently somewhere', () => {
    let differ = 0;
    for (let game = 0; game < 20; game++) {
      const gameId = `game-${game}`;
      const one = frontPageOf({ ...SAMPLES.good, gameId, season: 3 });
      const other = frontPageOf({ ...SAMPLES.good, gameId, season: 4 });
      if (slotsOf(one).some((text, at) => text !== slotsOf(other)[at])) differ++;
    }
    expect(differ).toBe(20);
  });

  it('leaves an unknown placeholder as it is', () => {
    expect(fill('{name} and {nobody}', { name: 'Coral Cove' })).toBe('Coral Cove and {nobody}');
  });
});
