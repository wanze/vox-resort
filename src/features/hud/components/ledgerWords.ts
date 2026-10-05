import type { Reason } from '../../sim/domain/ledger';

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
};

export const signed = (amount: number): string =>
  amount.toLocaleString('en-US', { signDisplay: 'exceptZero' });

// Better or worse for the balance than yesterday, so a cost that grew reads as a minus.
export function againstYesterday(today: number, yesterday: number): 'up' | 'down' | null {
  if (today === yesterday) return null;
  return today > yesterday ? 'up' : 'down';
}
