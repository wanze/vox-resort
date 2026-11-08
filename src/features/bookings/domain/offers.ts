import { PARTY_MIX, type PartyKind } from '../../guests/domain/parties';
import { PRESTIGE_TIERS } from '../../sim/domain/prestige';
import { lastNightOf, phaseOn, type Season, type SeasonPhase } from '../../sim/domain/season';
import { operatorFor } from './operators';
import { isBuildable, type Offering, type Requirement } from './requirements';

export type OfferKind = PartyKind | 'wedding';

export interface Offer {
  readonly id: number;
  readonly operator: string;
  readonly kind: OfferKind;
  readonly parties: number;
  readonly arrivesOn: number;
  readonly nights: number;
  readonly premium: number;
  readonly promisedStars: number;
  readonly bonusShare: number;
  readonly requirements: readonly Requirement[];
  readonly expiresOn: number;
}

export interface OfferContext {
  readonly id: number;
  readonly day: number;
  readonly season: Season;
  // The highest prestige tier reached, 0 for none.
  readonly tier: number;
  readonly beds: number;
  // What the catalogue could build today, so an offer never asks for the impossible.
  readonly buildable: Offering;
}

// One offer every few days and few open at once: more would make it busywork.
const OFFER_GAP = { min: 3, max: 5 } as const;
export const MAX_OPEN = 2;
export const MAX_ACCEPTED = 3;
const ANSWER_DAYS = 1;
const LEAD_DAYS = { min: 3, max: 5 } as const;
const NIGHTS = { min: 3, max: 7 } as const;
const WEDDING_NIGHTS = 2;
const SHORTEST_STAY = 2;

// A share of the resort's beds, so a small resort gets small groups; prestige widens the top.
const GROUP_SHARE = { min: 0.1, max: 0.25 } as const;
const STARTING_TOP = 0.15;

const PREMIUM = { min: 0.2, max: 0.4 } as const;
const WEDDING_PREMIUM = 0.4;
const LUXURY_PREMIUM = 0.15;
const BONUS_SHARE = 0.3;
const WEDDING_BONUS = 0.6;
const LUXURY_BONUS = 0.2;
const WEDDING_FROM = 4;
const WEDDING_CHANCE = 0.25;
const LUXURY_FROM = 4.5;
const LUXURY_CHANCE = 0.35;
// The dearest third of what the catalogue sleeps in: a luxury group refuses bungalows.
const LUXURY_QUANTILE = 2 / 3;
const PROMISE = { min: 3, max: 4.5 } as const;

const MIX_BY_PHASE: { readonly [phase in SeasonPhase]: readonly [PartyKind, number][] } = {
  early: [
    ['couple', 0.6],
    ['solo', 0.4],
  ],
  holidays: [['family', 1]],
  late: [
    ['friends', 0.7],
    ['couple', 0.3],
  ],
  closing: [],
};

const WANTS: { readonly [kind in OfferKind]: Requirement } = {
  family: { kind: 'need', value: 'fun' },
  couple: { kind: 'flag', value: 'calm' },
  friends: { kind: 'flag', value: 'dj' },
  solo: { kind: 'flag', value: 'bathing' },
  wedding: { kind: 'flag', value: 'stage' },
};

const between = (draw: number, range: { readonly min: number; readonly max: number }): number =>
  range.min + Math.min(range.max - range.min, Math.floor(draw * (range.max - range.min + 1)));

const sizeOf = (kind: PartyKind): number => {
  const shape = PARTY_MIX.find((each) => each.kind === kind)!;
  return (shape.adults.min + shape.adults.max + shape.children.min + shape.children.max) / 2;
};

// A wedding is the couple's guests, and the friends who came with the bride.
export function partyKindsOf(offer: Pick<Offer, 'kind' | 'parties'>): readonly PartyKind[] {
  if (offer.kind !== 'wedding')
    return Array.from({ length: offer.parties }, () => offer.kind as PartyKind);
  return [
    'friends',
    ...Array.from({ length: Math.max(0, offer.parties - 1) }, () => 'couple' as const),
  ];
}

export const peopleExpected = (offer: Pick<Offer, 'kind' | 'parties'>): number =>
  Math.round(partyKindsOf(offer).reduce((sum, kind) => sum + sizeOf(kind), 0));

function pick(draw: number, choices: readonly [PartyKind, number][]): PartyKind | null {
  let roll = draw;
  for (const [kind, share] of choices) {
    if (roll < share) return kind;
    roll -= share;
  }
  return choices.at(-1)?.[0] ?? null;
}

const tierShare = (tier: number): number => {
  const reached = PRESTIGE_TIERS.filter((each) => each <= tier).length;
  return STARTING_TOP + ((GROUP_SHARE.max - STARTING_TOP) * reached) / PRESTIGE_TIERS.length;
};

const promiseFor = (tier: number): number =>
  Math.min(PROMISE.max, Math.max(PROMISE.min, Math.floor(tier * 2) / 2));

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

function luxuryPrice(prices: readonly number[]): number | null {
  const sorted = prices.filter((price) => price > 0).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * LUXURY_QUANTILE))]!;
}

export function offerDue(
  state: {
    readonly nextOfferOn: number;
    readonly open: readonly unknown[];
    readonly accepted: readonly unknown[];
  },
  day: number,
  season: Season | null,
): boolean {
  return (
    season?.state === 'running' &&
    day >= state.nextOfferOn &&
    state.open.length < MAX_OPEN &&
    state.accepted.length < MAX_ACCEPTED
  );
}

export const nextOfferAfter = (random: () => number, day: number): number =>
  day + between(random(), OFFER_GAP);

// Every draw is taken whichever template wins, so retuning one template never reshuffles another.
export function drawOffer(random: () => number, context: OfferContext): Offer | null {
  const { day, season, tier, beds, buildable } = context;
  const draws = {
    lead: random(),
    kind: random(),
    wedding: random(),
    luxury: random(),
    share: random(),
    nights: random(),
    premium: random(),
  };
  const operator = operatorFor(random);
  const arrivesOn = day + between(draws.lead, LEAD_DAYS);
  const ordinary = pick(draws.kind, MIX_BY_PHASE[phaseOn(season, arrivesOn)]);
  if (ordinary === null || beds <= 0) return null;
  const wedding = tier >= WEDDING_FROM && draws.wedding < WEDDING_CHANCE;
  const kind: OfferKind = wedding ? 'wedding' : ordinary;
  const lastNight = lastNightOf(season);
  const wanted = wedding ? WEDDING_NIGHTS : between(draws.nights, NIGHTS);
  const nights = Math.min(wanted, lastNight - arrivesOn + 1);
  if (nights < Math.min(wanted, SHORTEST_STAY)) return null;
  const share = GROUP_SHARE.min + draws.share * (tierShare(tier) - GROUP_SHARE.min);
  const perParty = wedding ? sizeOf('couple') : sizeOf(ordinary);
  const parties = Math.max(1, Math.round((beds * share) / perParty));
  const luxury =
    tier >= LUXURY_FROM && draws.luxury < LUXURY_CHANCE
      ? luxuryPrice(buildable.lodgingPrices)
      : null;
  const promisedStars = promiseFor(tier);
  const asked: Requirement[] = [WANTS[kind], { kind: 'stars', value: promisedStars }];
  if (luxury !== null) asked.push({ kind: 'lodging', value: luxury });
  const basePremium = wedding
    ? WEDDING_PREMIUM
    : roundTo(PREMIUM.min + draws.premium * (PREMIUM.max - PREMIUM.min), 0.05);
  return {
    id: context.id,
    operator,
    kind,
    parties,
    arrivesOn,
    nights,
    premium: roundTo(basePremium + (luxury === null ? 0 : LUXURY_PREMIUM), 0.05),
    promisedStars,
    bonusShare: (wedding ? WEDDING_BONUS : BONUS_SHARE) + (luxury === null ? 0 : LUXURY_BONUS),
    requirements: asked.filter((requirement) => isBuildable(requirement, buildable)),
    expiresOn: day + ANSWER_DAYS,
  };
}
