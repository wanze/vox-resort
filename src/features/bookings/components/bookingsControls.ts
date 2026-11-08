import type { OfferRefusal } from '../domain/bookings';
import type { BookingsView } from '../domain/bookingsView';

// The showcase owns the bookings; this mirrors them for the window.
export interface BookingsControls {
  readonly view: BookingsView | null;
  // Why it was refused, or null once the group is in the book.
  accept(id: number): OfferRefusal | null;
  decline(id: number): void;
}
