import { describe, expect, it } from 'vitest';
import { createRandom } from '../../layout/domain/random';
import { firstSeason, SEASON_DAYS } from '../../sim/domain/season';
import { createBookings } from './bookings';
import {
  drawOffer,
  MAX_OPEN,
  offerDue,
  partyKindsOf,
  peopleExpected,
  type Offer,
  type OfferContext,
} from './offers';
import { offeringOf } from './requirements';

const everything = offeringOf([
  { role: 'activity', satisfies: [{ need: 'fun', amount: 1 }], stage: true, bathing: true },
  { role: 'drink', dj: true, calm: true },
  { role: 'lodging', price: 40 },
  { role: 'lodging', price: 90 },
  { role: 'lodging', price: 150 },
]);

const season = firstSeason(0);

// Season day 1 is calendar day 0: early is days 0-6, the holidays 7-20, late from 21.
const context = (over: Partial<OfferContext> = {}): OfferContext => ({
  id: 1,
  day: 2,
  season,
  tier: 0,
  beds: 200,
  buildable: everything,
  ...over,
});

const offersOver = (over: Partial<OfferContext>, count = 40) =>
  Array.from({ length: count }, (_, seed) => drawOffer(createRandom(seed), context(over)));

const widest = (offers: readonly Offer[]) =>
  Math.max(...offers.filter((offer) => offer.kind === 'family').map((offer) => offer.parties));

describe('drawOffer', () => {
  it('sends couples and solos early, families in the holidays and friends late', () => {
    const kinds = (day: number) =>
      new Set(offersOver({ day }).flatMap((offer) => (offer ? [offer.kind] : [])));
    expect(kinds(0)).toEqual(new Set(['couple', 'solo']));
    expect(kinds(9)).toEqual(new Set(['family']));
    expect(kinds(21)).toEqual(new Set(['friends', 'couple']));
  });

  it('sizes the group by the beds, so a small resort gets a small group', () => {
    const people = (beds: number) =>
      offersOver({ day: 9, beds }).map((offer) => peopleExpected(offer!));
    const big = people(400);
    const small = people(40);
    for (const each of big) expect(each).toBeLessThanOrEqual(400 * 0.25 + 4);
    for (const each of small) expect(each).toBeLessThanOrEqual(40 * 0.25 + 4);
    expect(Math.max(...small)).toBeLessThan(Math.min(...big));
  });

  it('widens the group and unlocks weddings and luxury with prestige', () => {
    const plain = offersOver({ day: 9, tier: 0 }, 80).map((offer) => offer!);
    const famous = offersOver({ day: 9, tier: 4.8 }, 80).map((offer) => offer!);
    expect(plain.some((offer) => offer.kind === 'wedding')).toBe(false);
    expect(famous.some((offer) => offer.kind === 'wedding')).toBe(true);
    expect(plain.some((offer) => offer.requirements.some((each) => each.kind === 'lodging'))).toBe(
      false,
    );
    const luxury = famous.find((offer) =>
      offer.requirements.some((each) => each.kind === 'lodging'),
    );
    expect(luxury?.requirements).toContainEqual({ kind: 'lodging', value: 150 });
    expect(widest(famous)).toBeGreaterThan(widest(plain));
  });

  it('asks a wedding for a stage, two nights and a big bonus', () => {
    const wedding = offersOver({ day: 9, tier: 4 }, 80).find((offer) => offer?.kind === 'wedding')!;
    expect(wedding.nights).toBe(2);
    expect(wedding.requirements).toContainEqual({ kind: 'flag', value: 'stage' });
    expect(wedding.bonusShare).toBeGreaterThan(0.5);
    expect(partyKindsOf(wedding)[0]).toBe('friends');
    expect(
      partyKindsOf(wedding)
        .slice(1)
        .every((kind) => kind === 'couple'),
    ).toBe(true);
  });

  it('never asks for what the catalogue cannot build', () => {
    const bare = offeringOf([{ role: 'lodging', price: 40 }]);
    for (const offer of offersOver({ day: 9, tier: 4.8, buildable: bare })) {
      const kinds = offer!.requirements.map((each) => each.kind);
      expect(kinds.every((kind) => kind === 'stars' || kind === 'lodging')).toBe(true);
    }
  });

  it('fits the stay inside the season, and offers nothing it cannot fit', () => {
    const lastNight = SEASON_DAYS - 1;
    for (const offer of offersOver({ day: 22 })) {
      if (offer) expect(offer.arrivesOn + offer.nights - 1).toBeLessThanOrEqual(lastNight);
    }
    expect(offersOver({ day: SEASON_DAYS - 2 }).every((offer) => offer === null)).toBe(true);
  });

  it('expires a day after it is made', () => {
    expect(drawOffer(createRandom(1), context())!.expiresOn).toBe(3);
  });
});

describe('offerDue', () => {
  const running = createBookings();

  it('is due once the gap has passed while the season runs', () => {
    expect(offerDue({ ...running, nextOfferOn: 5 }, 4, season)).toBe(false);
    expect(offerDue({ ...running, nextOfferOn: 5 }, 5, season)).toBe(true);
    expect(offerDue(running, 5, null)).toBe(false);
    expect(offerDue(running, 5, { ...season, state: 'break' })).toBe(false);
  });

  it('waits while the desk is full', () => {
    const offer = drawOffer(createRandom(1), context())!;
    const full = { ...running, open: Array.from({ length: MAX_OPEN }, () => offer) };
    expect(offerDue(full, 5, season)).toBe(false);
  });
});
