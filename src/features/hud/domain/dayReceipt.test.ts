import { describe, expect, it } from 'vitest';
import { reportOf, startDay, type DayReport } from '../../sim/domain/dayReport';
import { closeDay, createLedger, record } from '../../sim/domain/ledger';
import { dayReceipt } from './dayReceipt';

const report = (over: Partial<DayReport> = {}): DayReport => {
  const ledger = closeDay(
    record(record(createLedger('tycoon', 1_000), 'night', 640), 'wages', -200),
  );
  return {
    ...reportOf({
      counts: { ...startDay(4), arrived: 12, left: 5, reviews: 3, reviewStars: 12.6 },
      rating: { stars: 3.8, happiness: 0.72, housed: 0.9, cleanliness: 0.8 },
      present: 42,
      beds: { total: 60, taken: 40 },
      ledger,
      thoughts: new Map(),
    }),
    ...over,
  };
};

describe('the day receipt', () => {
  it('rings up the guests, with the mean review beside the count', () => {
    expect(dayReceipt(report(), 'tycoon', null).guests).toEqual([
      { label: 'Guests', amount: '42' },
      { label: 'Arrived', amount: '12' },
      { label: 'Checked out', amount: '5' },
      { label: 'Beds', amount: '40 / 60' },
      { label: 'Reviews', amount: '3', note: '4.2 ★ on average' },
    ]);
  });

  it('adds the turned away and the welcomed only on a day that had them', () => {
    const lines = dayReceipt(
      report({ turnedAway: 6, welcome: { welcomed: 10, gap: null } }),
      'tycoon',
      '10 of 12 new guests',
    ).guests;
    expect(lines.map((line) => line.label)).toEqual([
      'Guests',
      'Arrived',
      'Turned away',
      'Welcomed',
      'Checked out',
      'Beds',
      'Reviews',
    ]);
    expect(lines[2]).toEqual({ label: 'Turned away', amount: '6', tone: 'bad' });
    expect(lines[3]).toEqual({ label: 'Welcomed', note: '10 of 12 new guests', amount: '10' });
  });

  it('prints only the money that moved, then the net and the balance', () => {
    expect(dayReceipt(report(), 'tycoon', null).money).toEqual([
      { label: 'Stays', amount: '+640', tone: 'good' },
      { label: 'Wages', amount: '−200', tone: 'bad' },
      { label: 'Net', amount: '+440', total: true, tone: 'good' },
      { label: 'Balance', amount: report().balance.toLocaleString('en-US') },
    ]);
  });

  it('keeps the books off a sandbox receipt but still reads the mood', () => {
    const receipt = dayReceipt(report(), 'sandbox', null);
    expect(receipt.money).toBeNull();
    expect(receipt.mood).toEqual({ label: 'Mood', amount: '72%' });
  });
});
