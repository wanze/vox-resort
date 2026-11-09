import { useState } from 'react';
import { PixelPicture } from '../../../shared/components/PixelIcon';
import type { OfferRefusal } from '../domain/bookings';
import { groupWords, inDays, nightsWords, premiumWords } from '../domain/bookingWords';
import type { OfferCard } from '../domain/bookingsView';
import { groupFigures } from '../domain/figures';
import { operatorNamed } from '../domain/operators';
import { stayStrip, type StayDay } from '../domain/stayStrip';
import type { BookingsControls } from './bookingsControls';
import { Checks } from './Checks';
import { OperatorLogo } from './OperatorLogo';
import { FIGURES, SHIRTS } from './operatorArt';

export interface OfferVoucherProps {
  readonly card: OfferCard;
  readonly today: number;
  readonly full: boolean;
  readonly bookings: BookingsControls;
}

const REFUSALS: { readonly [refusal in OfferRefusal]: string } = {
  gone: 'The offer has lapsed.',
  full: 'The book is full: let a group leave first.',
};

const percent = (share: number): string => `${Math.round(share * 100)}%`;

function Group({ card }: { readonly card: OfferCard }) {
  const { offer } = card;
  const { parties, more } = groupFigures(offer);
  return (
    <div className="bookings-voucher-group">
      <div className="bookings-figures" aria-hidden="true">
        {parties.map((party) => (
          <span key={party[0]!.seat} className="bookings-figures-party">
            {party.map(({ figure, seat }) => (
              <PixelPicture key={seat} art={FIGURES[figure][seat % SHIRTS.length]!} scale={2} />
            ))}
          </span>
        ))}
        {more > 0 ? <span className="bookings-figures-more">+{more}</span> : null}
      </div>
      <p>
        {groupWords(offer.kind, offer.parties)}, about {card.people} guests
      </p>
    </div>
  );
}

const DAY_TITLES: { readonly [role in StayDay['role']]: string } = {
  wait: '',
  arrive: 'arrive',
  stay: 'staying',
  leave: 'leave',
};

function StayStrip({ card, today }: { readonly card: OfferCard; readonly today: number }) {
  const { offer } = card;
  const strip = stayStrip(offer, today);
  const arrival = strip.find((day) => day.role === 'arrive')!;
  return (
    <div className="bookings-voucher-stay">
      <ol className="bookings-strip" aria-hidden="true">
        {strip.map((day) => (
          <li
            key={day.day}
            data-role={day.role}
            data-today={day.today ? '' : undefined}
            title={[`${day.weekday} ${day.date}`, DAY_TITLES[day.role]].filter(Boolean).join(', ')}
          >
            <span className="bookings-strip-weekday">{day.weekday.charAt(0)}</span>
            <span className="bookings-strip-date">{day.date}</span>
          </li>
        ))}
      </ol>
      <p>
        Arriving {arrival.weekday} {arrival.date}, {inDays(offer.arrivesOn - today)}, for{' '}
        {nightsWords(offer.nights)}
      </p>
    </div>
  );
}

function Terms({ card }: { readonly card: OfferCard }) {
  const { offer } = card;
  return (
    <div className="bookings-voucher-terms">
      <p className="bookings-tag">
        <strong>{premiumWords(offer.premium)}</strong>
        <span>a night</span>
      </p>
      <p className="bookings-stamp">
        <span className="ui-visually-hidden">
          A bonus of {percent(offer.bonusShare)} of their stay if their reviews average{' '}
          {offer.promisedStars}★
        </span>
        <span aria-hidden="true">Bonus {percent(offer.bonusShare)}</span>
        <strong aria-hidden="true">{offer.promisedStars.toFixed(1)}★</strong>
        <span aria-hidden="true">average</span>
      </p>
    </div>
  );
}

function Head({ operator, wedding }: { readonly operator: string; readonly wedding: boolean }) {
  const listed = operatorNamed(operator);
  return (
    <header className="bookings-voucher-head">
      <OperatorLogo operator={operator} />
      <span className="bookings-voucher-name">
        <strong>{operator}</strong>
        {listed ? <span>{listed.motto}</span> : null}
      </span>
      <span className="bookings-voucher-kind">{wedding ? 'Wedding' : 'Group'}</span>
    </header>
  );
}

function Answer({ card, today, full, bookings }: OfferVoucherProps) {
  const [refusal, setRefusal] = useState<OfferRefusal | null>(null);
  const { offer } = card;
  return (
    <footer className="bookings-voucher-foot">
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
      <span className="ui-note">Answer {inDays(offer.expiresOn - today)}</span>
      {refusal ? <p role="alert">{REFUSALS[refusal]}</p> : null}
    </footer>
  );
}

export function OfferVoucher(props: OfferVoucherProps) {
  const { card, today } = props;
  const { offer } = card;
  return (
    <li
      className="bookings-voucher"
      data-brand={operatorNamed(offer.operator)?.brand}
      data-state="offer"
    >
      <Head operator={offer.operator} wedding={offer.kind === 'wedding'} />
      <div className="bookings-voucher-body">
        <Group card={card} />
        <StayStrip card={card} today={today} />
        <Terms card={card} />
        <Checks checks={card.checks} />
      </div>
      <Answer {...props} />
    </li>
  );
}
