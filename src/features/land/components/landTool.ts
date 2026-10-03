import type { LandView } from '../domain/landRights';

export const LAND_TOOL = {
  hint: 'Take in a parcel beside the land you own; drag to take in a strip',
  glyph: '⌗',
} as const;

// Free play claims land for nothing, so the price is only shown when there is one.
export function landToolLabel(land: Pick<LandView, 'price'>): string {
  return land.price > 0 ? `Buy land · ${land.price.toLocaleString('en-US')}` : 'Claim land';
}
