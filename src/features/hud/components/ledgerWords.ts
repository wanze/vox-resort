import type { Reason } from '../../sim/domain/ledger';

export const REASON_LABELS: { readonly [reason in Reason]: string } = {
  build: 'Building',
  demolish: 'Refunds',
  dig: 'Earthworks',
  land: 'Land',
  visit: 'Visits',
  night: 'Stays',
  wages: 'Wages',
  maintenance: 'Maintenance',
};

export const signed = (amount: number): string =>
  amount.toLocaleString('en-US', { signDisplay: 'exceptZero' });
