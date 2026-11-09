import { WEEKDAY_NAMES, weekdayOf } from '../../events/domain/week';
import { shownDay } from '../../../shared/domain/dayNumber';
import type { Offer } from './offers';

export type StayRole = 'wait' | 'arrive' | 'stay' | 'leave';

export interface StayDay {
  readonly day: number;
  readonly weekday: string;
  readonly date: number;
  readonly role: StayRole;
  readonly today: boolean;
}

// Guests stay the whole day of their last night and go the morning after.
export const leavesOn = (stay: Pick<Offer, 'arrivesOn' | 'nights'>): number =>
  stay.arrivesOn + stay.nights + 1;

function roleOn(day: number, offer: Pick<Offer, 'arrivesOn' | 'nights'>): StayRole {
  if (day < offer.arrivesOn) return 'wait';
  if (day === offer.arrivesOn) return 'arrive';
  return day < leavesOn(offer) ? 'stay' : 'leave';
}

export function stayStrip(
  offer: Pick<Offer, 'arrivesOn' | 'nights'>,
  today: number,
): readonly StayDay[] {
  const from = Math.min(today, offer.arrivesOn);
  return Array.from({ length: leavesOn(offer) - from + 1 }, (_, index) => {
    const day = from + index;
    return {
      day,
      weekday: WEEKDAY_NAMES[weekdayOf(day)],
      date: shownDay(day),
      role: roleOn(day, offer),
      today: day === today,
    };
  });
}
