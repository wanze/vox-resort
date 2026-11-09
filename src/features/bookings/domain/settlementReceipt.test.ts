import { describe, expect, it } from 'vitest';
import type { Settlement } from './bookings';
import { settlementReceipt } from './settlementReceipt';

const settlement = (over: Partial<Settlement>): Settlement => ({
  id: 1,
  operator: 'Sunshine Tours',
  kind: 'family',
  parties: 3,
  day: 12,
  nights: 5,
  premium: 0.3,
  takings: 4_000,
  bonusShare: 0.3,
  meanStars: 4.4,
  promisedStars: 4,
  bonus: 1_200,
  outcome: 'bonus',
  ...over,
});

describe('the settlement receipt', () => {
  it('rings up the stay, the bonus earned and a total', () => {
    expect(settlementReceipt(settlement({}))).toEqual([
      { label: '5 nights × +30%', note: '3 families', amount: '4,000' },
      { label: 'Bonus 30%', note: 'promise kept', amount: '+1,200', tone: 'good' },
      { label: 'Reviews', note: '4.0★ promised', amount: '4.4★', tone: 'good' },
      { label: 'Total', amount: '5,200', total: true },
    ]);
  });

  it('prices a missed bonus and says why it was missed', () => {
    const [, bonus, reviews, total] = settlementReceipt(
      settlement({ outcome: 'missed', meanStars: 3.5, bonus: 0 }),
    );
    expect(bonus).toEqual({
      label: 'Bonus 30% missed',
      note: 'reviews short of the promise, 1,200 lost',
      amount: '0',
      tone: 'bad',
    });
    expect(reviews).toMatchObject({ amount: '3.5★', tone: 'bad' });
    expect(total).toMatchObject({ amount: '4,000' });
  });

  it('has no review to show for a group that left without a word', () => {
    const lines = settlementReceipt(settlement({ outcome: 'missed', meanStars: null, bonus: 0 }));
    expect(lines[1]!.note).toBe('nobody wrote a review, 1,200 lost');
    expect(lines[2]).toEqual({ label: 'Reviews', note: '4.0★ promised', amount: 'none' });
  });

  it('puts no price on the bonus of a group turned away at the door', () => {
    const lines = settlementReceipt(
      settlement({ outcome: 'failed', parties: 0, takings: 0, meanStars: null, bonus: 0 }),
    );
    expect(lines[1]!.note).toBe('turned away at the door');
    expect(lines[3]).toMatchObject({ amount: '0' });
  });
});
