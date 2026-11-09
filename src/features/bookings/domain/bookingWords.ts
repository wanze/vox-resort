import type { Settlement } from './bookings';
import type { Offer, OfferKind } from './offers';
import type { Requirement } from './requirements';

const GROUPS: { readonly [kind in OfferKind]: readonly [string, string] } = {
  family: ['family', 'families'],
  couple: ['couple', 'couples'],
  friends: ['group of friends', 'groups of friends'],
  solo: ['solo traveller', 'solo travellers'],
  wedding: ['wedding party', 'wedding party'],
};

export function groupWords(kind: OfferKind, parties: number): string {
  if (kind === 'wedding') return `a wedding party of ${parties}`;
  const [one, many] = GROUPS[kind];
  return parties === 1 ? `1 ${one}` : `${parties} ${many}`;
}

export const possessive = (operator: string): string =>
  operator.endsWith('s') ? `${operator}’` : `${operator}’s`;

export function inDays(days: number): string {
  if (days <= 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

export const nightsWords = (nights: number): string =>
  nights === 1 ? '1 night' : `${nights} nights`;

export const premiumWords = (premium: number): string => `+${Math.round(premium * 100)}%`;

const whole = (amount: number): string => amount.toLocaleString('en-US');

const starsOf = (stars: number): string => `${stars.toFixed(1)}★`;

export function offerLine(offer: Offer, today: number): string {
  const group = groupWords(offer.kind, offer.parties);
  const when = inDays(offer.arrivesOn - today);
  return `${offer.operator} offers ${group}, arriving ${when} for ${nightsWords(offer.nights)}, at ${premiumWords(offer.premium)}.`;
}

export function settlementLine(settlement: Settlement): string {
  const who = `${possessive(settlement.operator)} ${GROUPS[settlement.kind][1]}`;
  const { meanStars, promisedStars } = settlement;
  switch (settlement.outcome) {
    case 'bonus':
      return `${who} left glowing: ${starsOf(meanStars ?? 0)}, bonus ${whole(settlement.bonus)}.`;
    case 'missed':
      return meanStars === null
        ? `${who} left without a word: no bonus.`
        : `${who} left unimpressed: ${starsOf(meanStars)} of the ${starsOf(promisedStars)} promised, no bonus.`;
    case 'failed':
      return settlement.parties === 0
        ? `${who} were turned away at the door: no beds, no bonus.`
        : `${who} did not all find a bed: no bonus.`;
  }
}

const withArticle = (label: string): string => `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;

// What the player can do about a wish still open: build, or for the stars, earn them.
export function remedyWords(requirement: Requirement, builds: readonly string[]): string {
  if (requirement.kind === 'stars') return 'raise the rating';
  if (builds.length === 0) return 'nothing to build for it yet';
  return `build ${builds.map(withArticle).join(' or ')}`;
}
