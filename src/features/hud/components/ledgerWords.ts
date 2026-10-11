import type { Reason } from '../../sim/domain/ledger';
import type { Tone } from '../../../shared/components/tone';

export const REASON_LABELS: { readonly [reason in Reason]: string } = {
  build: 'Building',
  demolish: 'Refunds',
  dig: 'Earthworks',
  land: 'Land',
  visit: 'Visits',
  night: 'Stays',
  wages: 'Wages',
  events: 'Events',
  maintenance: 'Maintenance',
  renovate: 'Renovation',
};

// A true minus, as wide as the plus, so signed figures line up down a column.
export const signed = (amount: number): string =>
  amount.toLocaleString('en-US', { signDisplay: 'exceptZero' }).replace('-', '−');

export const toneOf = (amount: number): Tone | undefined =>
  amount > 0 ? 'good' : amount < 0 ? 'bad' : undefined;

// Better or worse for the balance than yesterday, so a cost that grew reads as a minus.
export function againstYesterday(today: number, yesterday: number): 'up' | 'down' | null {
  if (today === yesterday) return null;
  return today > yesterday ? 'up' : 'down';
}
