import { Section } from '../../hud/components/ReportRows';
import { groupWords, inDays, settlementLine } from '../domain/bookingWords';
import type { BookedRow, BookingsView } from '../domain/bookingsView';
import { leavesOn } from '../domain/stayStrip';
import type { BookingsControls } from './bookingsControls';
import { Checks } from './Checks';
import { OfferVoucher } from './OfferVoucher';
import { OperatorLogo } from './OperatorLogo';

export interface BookingsPanelProps {
  readonly bookings: BookingsControls;
}

function bookedLine({ booking }: BookedRow, today: number): string {
  const group = groupWords(booking.kind, booking.parties);
  if (booking.state === 'booked') return `${inDays(booking.arrivesOn - today)}: ${group}`;
  return `Here: ${groupWords(booking.kind, booking.staying.length)}, leaving ${inDays(leavesOn(booking) - today)}`;
}

function Booked({ row, today }: { readonly row: BookedRow; readonly today: number }) {
  const met = row.checks.filter((check) => check.met).length;
  const { booking } = row;
  return (
    <li className="bookings-entry" data-state={booking.state}>
      <span className="bookings-entry-head">
        <OperatorLogo operator={booking.operator} scale={1} />
        <strong>{booking.operator}</strong>
      </span>
      <p>
        {bookedLine(row, today)}
        {row.checks.length > 0 ? `, ${met} of ${row.checks.length} wishes met` : ''}.
      </p>
      <Checks checks={row.checks} />
    </li>
  );
}

function Offers({ view, bookings }: { readonly view: BookingsView } & BookingsPanelProps) {
  if (view.offers.length === 0) {
    return (
      <p className="ui-note">
        Nothing on the desk. Tour operators write every few days while the season runs.
      </p>
    );
  }
  return (
    <ul className="bookings-list">
      {view.offers.map((card) => (
        <OfferVoucher
          key={card.offer.id}
          card={card}
          today={view.day}
          full={view.full}
          bookings={bookings}
        />
      ))}
    </ul>
  );
}

function Book({ view }: { readonly view: BookingsView }) {
  if (view.booked.length === 0) {
    return <p className="ui-note">No groups booked. Keep beds free for the ones you take.</p>;
  }
  return (
    <ul className="bookings-list">
      {view.booked.map((row) => (
        <Booked key={row.booking.id} row={row} today={view.day} />
      ))}
    </ul>
  );
}

// The full record is in Messages and the season paper; here only how the last group went.
function LastGroup({ settled }: { readonly settled: BookingsView['settled'] }) {
  const [last] = settled;
  if (last === undefined) return null;
  return (
    <Section title="Last group">
      <p className="bookings-last" data-state={last.outcome}>
        {settlementLine(last)}
      </p>
    </Section>
  );
}

export function BookingsPanel({ bookings }: BookingsPanelProps) {
  const { view } = bookings;
  if (view === null) return null;
  return (
    <div className="bookings-panel">
      <Section title="Offers">
        <Offers view={view} bookings={bookings} />
      </Section>
      <Section title="Booked">
        <Book view={view} />
      </Section>
      <LastGroup settled={view.settled} />
    </div>
  );
}
