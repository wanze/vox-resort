import { describe, expect, it } from 'vitest';
import type { Settlement } from './bookings';
import {
  groupWords,
  inDays,
  offerLine,
  possessive,
  remedyWords,
  settlementLine,
} from './bookingWords';
import type { Offer } from './offers';

const settlement = (over: Partial<Settlement>): Settlement => ({
  id: 1,
  operator: 'Sunshine Tours',
  kind: 'family',
  parties: 8,
  day: 12,
  nights: 5,
  premium: 0.3,
  takings: 8_000,
  bonusShare: 0.4,
  meanStars: 4.4,
  promisedStars: 4,
  bonus: 3_200,
  outcome: 'bonus',
  ...over,
});

describe('booking words', () => {
  it('counts the group by its kind', () => {
    expect(groupWords('family', 8)).toBe('8 families');
    expect(groupWords('couple', 1)).toBe('1 couple');
    expect(groupWords('wedding', 6)).toBe('a wedding party of 6');
  });

  it('puts the apostrophe where the name needs it', () => {
    expect(possessive('Sunshine Tours')).toBe('Sunshine Tours’');
    expect(possessive('Blue Lagoon Travel')).toBe('Blue Lagoon Travel’s');
  });

  it('counts down to the arrival', () => {
    expect([inDays(0), inDays(1), inDays(4)]).toEqual(['today', 'tomorrow', 'in 4 days']);
  });

  it('words an offer as the operator makes it', () => {
    const offer: Offer = {
      id: 1,
      operator: 'Sunshine Tours',
      kind: 'family',
      parties: 8,
      arrivesOn: 14,
      nights: 7,
      premium: 0.3,
      promisedStars: 4,
      bonusShare: 0.3,
      requirements: [],
      expiresOn: 11,
    };
    expect(offerLine(offer, 10)).toBe(
      'Sunshine Tours offers 8 families, arriving in 4 days for 7 nights, at +30%.',
    );
  });

  it('words each outcome of a settlement', () => {
    expect(settlementLine(settlement({}))).toBe(
      'Sunshine Tours’ families left glowing: 4.4★, bonus 3,200.',
    );
    expect(settlementLine(settlement({ outcome: 'missed', meanStars: 3.5, bonus: 0 }))).toBe(
      'Sunshine Tours’ families left unimpressed: 3.5★ of the 4.0★ promised, no bonus.',
    );
    expect(settlementLine(settlement({ outcome: 'failed', parties: 0, bonus: 0 }))).toBe(
      'Sunshine Tours’ families were turned away at the door: no beds, no bonus.',
    );
  });
});

describe('remedyWords', () => {
  it('names what to build, with its article', () => {
    expect(remedyWords({ kind: 'flag', value: 'dj' }, ['Night Club', 'Open-Air Bar'])).toBe(
      'build a Night Club or an Open-Air Bar',
    );
  });

  it('says so when nothing unlocked would do', () => {
    expect(remedyWords({ kind: 'flag', value: 'dj' }, [])).toBe('nothing to build for it yet');
  });

  it('sends the stars to the rating, not the build menu', () => {
    expect(remedyWords({ kind: 'stars', value: 4 }, [])).toBe('raise the rating');
  });
});
