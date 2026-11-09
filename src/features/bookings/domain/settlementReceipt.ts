import { percent, signed, whole, type TillLine } from '../../../shared/domain/till';
import type { Settlement } from './bookings';
import { groupWords, nightsWords, premiumWords, starsOf } from './bookingWords';

function bonusReason(settlement: Settlement): string {
  switch (settlement.outcome) {
    case 'bonus':
      return 'promise kept';
    case 'missed':
      return settlement.meanStars === null
        ? 'nobody wrote a review'
        : 'reviews short of the promise';
    case 'failed':
      return settlement.parties === 0 ? 'turned away at the door' : 'not all found a bed';
  }
}

function bonusLine(settlement: Settlement): TillLine {
  const label = `Bonus ${percent(settlement.bonusShare)}`;
  if (settlement.outcome === 'bonus') {
    return { label, note: bonusReason(settlement), amount: signed(settlement.bonus), tone: 'good' };
  }
  // What it would have paid, so the miss has a price; nothing to price for a group never here.
  const forgone = Math.round(settlement.bonusShare * settlement.takings);
  const note =
    forgone > 0 ? `${bonusReason(settlement)}, ${whole(forgone)} lost` : bonusReason(settlement);
  return { label: `${label} missed`, note, amount: '0', tone: 'bad' };
}

function reviewLine({ meanStars, promisedStars }: Settlement): TillLine {
  const note = `${starsOf(promisedStars)} promised`;
  if (meanStars === null) return { label: 'Reviews', note, amount: 'none' };
  return {
    label: 'Reviews',
    note,
    amount: starsOf(meanStars),
    tone: meanStars >= promisedStars ? 'good' : 'bad',
  };
}

export function settlementReceipt(settlement: Settlement): readonly TillLine[] {
  return [
    {
      label: `${nightsWords(settlement.nights)} × ${premiumWords(settlement.premium)}`,
      note: groupWords(settlement.kind, settlement.parties),
      amount: whole(settlement.takings),
    },
    bonusLine(settlement),
    reviewLine(settlement),
    { label: 'Total', amount: whole(settlement.takings + settlement.bonus), total: true },
  ];
}
