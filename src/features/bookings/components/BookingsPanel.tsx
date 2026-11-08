import { useState } from 'react';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { Section } from '../../hud/components/ReportRows';
import type { OfferRefusal } from '../domain/bookings';
import {
  groupWords,
  inDays,
  nightsWords,
  premiumWords,
  settlementLine,
} from '../domain/bookingWords';
import type { BookedRow, BookingsView, OfferCard, RequirementCheck } from '../domain/bookingsView';
import { requirementNoun } from '../domain/requirements';
import type { BookingsControls } from './bookingsControls';

export interface BookingsPanelProps {
  readonly bookings: BookingsControls;
}

const REFUSALS: { readonly [refusal in OfferRefusal]: string } = {
  gone: 'The offer has lapsed.',
  full: 'The book is full: let a group leave first.',
};

const percent = (share: number): string => `${Math.round(share * 100)}%`;

function Checks({ checks }: { readonly checks: readonly RequirementCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="bookings-checks" aria-label="Wants">
      {checks.map(({ requirement, met }) => (
        <li key={`${requirement.kind}:${requirement.value}`} data-met={met}>
          <PixelIcon name={met ? 'check' : 'minus'} scale={1} />
          <span>
            {requirementNoun(requirement)}
            <span className="ui-visually-hidden">{met ? ', in place' : ', missing'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Offer({
  card,
  today,
  full,
  bookings,
}: {
  readonly card: OfferCard;
  readonly today: number;
  readonly full: boolean;
  readonly bookings: BookingsControls;
}) {
  const [refusal, setRefusal] = useState<OfferRefusal | null>(null);
  const { offer } = card;
  return (
    <li className="ui-panel bookings-card" data-state="offer">
      <strong>{offer.operator}</strong>
      <p>
        {groupWords(offer.kind, offer.parties)}, about {card.people} guests, arriving{' '}
        {inDays(offer.arrivesOn - today)} for {nightsWords(offer.nights)}, at{' '}
        {premiumWords(offer.premium)} a night.
      </p>
      <p className="ui-note">
        A bonus of {percent(offer.bonusShare)} of their stay if their reviews average{' '}
        {offer.promisedStars}★. Answer {inDays(offer.expiresOn - today)}.
      </p>
      <Checks checks={card.checks} />
      <div className="ui-row">
        <button
          type="button"
          className="ui-button ui-button-primary"
          disabled={full}
          title={full ? REFUSALS.full : undefined}
          onClick={() => setRefusal(bookings.accept(offer.id))}
        >
          Accept
        </button>
        <button type="button" className="ui-button" onClick={() => bookings.decline(offer.id)}>
          Decline
        </button>
      </div>
      {refusal ? <p role="alert">{REFUSALS[refusal]}</p> : null}
    </li>
  );
}

function bookedLine({ booking }: BookedRow, today: number): string {
  const group = groupWords(booking.kind, booking.parties);
  if (booking.state === 'booked') return `${inDays(booking.arrivesOn - today)}: ${group}`;
  const leaves = booking.arrivesOn + booking.nights + 1 - today;
  return `Here: ${groupWords(booking.kind, booking.staying.length)}, leaving ${inDays(leaves)}`;
}

function Booked({ row, today }: { readonly row: BookedRow; readonly today: number }) {
  const met = row.checks.filter((check) => check.met).length;
  const { booking } = row;
  return (
    <li className="bookings-entry" data-state={booking.state}>
      <strong>{booking.operator}</strong>
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
        <Offer
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
