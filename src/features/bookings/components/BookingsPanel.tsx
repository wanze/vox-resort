import { useState } from 'react';
import { Section } from '../../hud/components/ReportRows';
import { ceremonyLine, groupWords, inDays } from '../domain/bookingWords';
import {
  deskOf,
  type AnsweredCard,
  type BookedRow,
  type BookingsView,
  type OfferCard,
} from '../domain/bookingsView';
import { leavesOn } from '../domain/stayStrip';
import type { BookingsControls } from './bookingsControls';
import { Checks } from './Checks';
import { OfferVoucher } from './OfferVoucher';
import { OperatorLogo } from './OperatorLogo';
import { SettlementReceipt } from './SettlementReceipt';

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
      {row.ceremony ? <p>{ceremonyLine(row.ceremony, today)}</p> : null}
      <Checks checks={row.checks} />
    </li>
  );
}

function Offers({ view, bookings }: { readonly view: BookingsView } & BookingsPanelProps) {
  const [answered, setAnswered] = useState<readonly AnsweredCard[]>([]);
  const desk = deskOf(view.offers, answered, view.day);
  if (desk.length === 0) {
    return (
      <p className="ui-note">
        Nothing on the desk. Tour operators write every few days while the season runs.
      </p>
    );
  }
  const stamp = (offerCard: OfferCard, answer: AnsweredCard['answer']) =>
    setAnswered((before) => [...before, { card: offerCard, answer, day: view.day }]);
  const openCard = (id: number) => view.offers.find((each) => each.offer.id === id);
  const stamping: BookingsControls = {
    view: bookings.view,
    accept: (id) => {
      const refusal = bookings.accept(id);
      const accepted = openCard(id);
      if (refusal === null && accepted) stamp(accepted, 'confirmed');
      return refusal;
    },
    decline: (id) => {
      const declined = openCard(id);
      bookings.decline(id);
      if (declined) stamp(declined, 'declined');
    },
  };
  return (
    <ul className="bookings-list">
      {desk.map(({ card, answer }) => (
        <OfferVoucher
          key={card.offer.id}
          card={card}
          today={view.day}
          full={view.full}
          bookings={stamping}
          answer={answer}
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
      <SettlementReceipt settlement={last} />
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
