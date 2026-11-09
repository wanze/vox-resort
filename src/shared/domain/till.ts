import type { Tone } from './tone';

export interface TillLine {
  readonly label: string;
  readonly amount: string;
  readonly note?: string;
  readonly tone?: Tone;
  readonly total?: boolean;
}

export const whole = (amount: number): string => Math.round(amount).toLocaleString('en-US');

// A true minus, as wide as the plus, so signed figures line up down a column.
export const signed = (amount: number): string =>
  amount.toLocaleString('en-US', { signDisplay: 'exceptZero' }).replace('-', '−');

export const percent = (share: number): string => `${Math.round(share * 100)}%`;
