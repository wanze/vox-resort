export type GameMode = 'sandbox' | 'tycoon';

// 'maintenance', not 'upkeep': upkeep.ts is already the cleanliness of a venue.
export type Reason =
  | 'build'
  | 'demolish'
  | 'dig'
  | 'land'
  | 'visit'
  | 'night'
  | 'wages'
  | 'events'
  | 'maintenance';

export const REASONS: readonly Reason[] = [
  'build',
  'demolish',
  'dig',
  'land',
  'visit',
  'night',
  'wages',
  'events',
  'maintenance',
];

export type Column = { readonly [reason in Reason]: number };

export interface Ledger {
  readonly balance: number;
  readonly today: Column;
  readonly yesterday: Column;
  readonly mode: GameMode;
}

// About twice a minimal start (gate, desk, thirty paths, three bungalows, a snack bar: 3 960).
export const OPENING_BALANCE: { readonly [mode in GameMode]: number } = {
  sandbox: 0,
  tycoon: 8_000,
};

const EMPTY: Column = {
  build: 0,
  demolish: 0,
  dig: 0,
  land: 0,
  visit: 0,
  night: 0,
  wages: 0,
  events: 0,
  maintenance: 0,
};

export function createLedger(mode: GameMode, opening: number): Ledger {
  return { balance: Math.round(opening), today: EMPTY, yesterday: EMPTY, mode };
}

export function record(ledger: Ledger, reason: Reason, amount: number): Ledger {
  const whole = Math.round(amount);
  if (whole === 0) return ledger;
  return {
    ...ledger,
    balance: ledger.balance + whole,
    today: { ...ledger.today, [reason]: ledger.today[reason] + whole },
  };
}

// The only place the mode is read. Nothing to pay is affordable in debt, so a re-lay is never refused.
export function canAfford(ledger: Ledger, amount: number): boolean {
  return ledger.mode === 'sandbox' || amount <= 0 || amount <= ledger.balance;
}

export function closeDay(ledger: Ledger): Ledger {
  return { ...ledger, today: EMPTY, yesterday: ledger.today };
}

export function netOf(column: Column): number {
  return REASONS.reduce((sum, reason) => sum + column[reason], 0);
}
