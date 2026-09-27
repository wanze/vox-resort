import { describe, expect, it } from 'vitest';
import { buildCostOf } from '../../catalog/domain/prices';
import {
  canAfford,
  closeDay,
  createLedger,
  netOf,
  OPENING_BALANCE,
  REASONS,
  record,
} from './ledger';

describe('createLedger', () => {
  it('holds its opening balance and an empty day', () => {
    const ledger = createLedger('tycoon', 5_000);
    expect(ledger.balance).toBe(5_000);
    expect(ledger.mode).toBe('tycoon');
    for (const reason of REASONS) expect(ledger.today[reason]).toBe(0);
  });

  it('opens tycoon with about twice what a minimal resort costs', () => {
    const minimal =
      buildCostOf('entrance') +
      buildCostOf('reception') +
      30 * buildCostOf('path') +
      3 * buildCostOf('bungalow') +
      buildCostOf('snack-bar');
    expect(OPENING_BALANCE.tycoon).toBeGreaterThanOrEqual(1.8 * minimal);
    expect(OPENING_BALANCE.tycoon).toBeLessThanOrEqual(2.5 * minimal);
  });
});

describe('record', () => {
  it("moves the balance and the day's column", () => {
    const ledger = record(record(createLedger('tycoon', 100), 'visit', 8), 'build', -30);
    expect(ledger.balance).toBe(78);
    expect(ledger.today.visit).toBe(8);
    expect(ledger.today.build).toBe(-30);
  });

  it('lets the balance go below zero', () => {
    expect(record(createLedger('tycoon', 10), 'wages', -80).balance).toBe(-70);
  });

  it('hands back the same ledger for nothing, so a free visit allocates nothing', () => {
    const ledger = createLedger('sandbox', 0);
    expect(record(ledger, 'visit', 0)).toBe(ledger);
  });

  it("adds a day's transactions up to what the balance moved by", () => {
    const amounts = [
      ['night', 440],
      ['visit', 3],
      ['visit', 8],
      ['build', -680],
      ['demolish', 340],
      ['dig', -20],
      ['wages', -80],
      ['maintenance', -35],
    ] as const;
    const ledger = amounts.reduce(
      (books, [reason, amount]) => record(books, reason, amount),
      createLedger('tycoon', 1_000),
    );
    const moved = amounts.reduce((sum, [, amount]) => sum + amount, 0);
    expect(ledger.balance).toBe(1_000 + moved);
    expect(netOf(ledger.today)).toBe(moved);
  });
});

describe('canAfford', () => {
  it('is always true in sandbox, however far above the balance', () => {
    const ledger = createLedger('sandbox', 0);
    expect(canAfford(ledger, 1)).toBe(true);
    expect(canAfford(ledger, 1_000_000_000)).toBe(true);
  });

  it('is false in tycoon above the balance and true at exactly it', () => {
    const ledger = createLedger('tycoon', 500);
    expect(canAfford(ledger, 501)).toBe(false);
    expect(canAfford(ledger, 500)).toBe(true);
    expect(canAfford(record(ledger, 'wages', -600), 1)).toBe(false);
  });

  it('never refuses something free, even in debt', () => {
    expect(canAfford(createLedger('tycoon', -250), 0)).toBe(true);
  });
});

describe('closeDay', () => {
  it('moves today to yesterday and starts today at zero', () => {
    const ledger = record(createLedger('tycoon', 0), 'night', 200);
    const closed = closeDay(ledger);
    expect(closed.yesterday.night).toBe(200);
    expect(closed.today.night).toBe(0);
    expect(closed.balance).toBe(200);
  });
});
