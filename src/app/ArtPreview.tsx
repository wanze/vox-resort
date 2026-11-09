import { useMemo } from 'react';
import { BookingsPanel } from '../features/bookings/components/BookingsPanel';
import type { BookingsControls } from '../features/bookings/components/bookingsControls';
import { OfferVoucher } from '../features/bookings/components/OfferVoucher';
import { SettlementReceipt } from '../features/bookings/components/SettlementReceipt';
import { EventCards } from '../features/events/components/EventCards';
import { ProgrammePoster } from '../features/events/components/ProgrammePoster';
import { DayReceipt } from '../features/hud/components/DayReceipt';
import {
  sampleDays,
  sampleDesk,
  sampleOffers,
  sampleSettlements,
  sampleStamped,
} from './artSamples';
import { sampleFlyers, samplePoster } from './programmeSamples';

// Nothing to book into: the buttons press, and the samples stay as they are.
const controlsOf = (view: BookingsControls['view']): BookingsControls => ({
  view,
  accept: () => null,
  decline: () => undefined,
});

export function ArtPreview() {
  const offers = useMemo(() => controlsOf(sampleOffers()), []);
  const desk = useMemo(() => controlsOf(sampleDesk()), []);
  const flyers = useMemo(() => sampleFlyers(), []);
  const poster = useMemo(() => samplePoster(), []);
  const stamped = useMemo(() => sampleStamped(), []);
  const settlements = useMemo(() => sampleSettlements(), []);
  const days = useMemo(() => sampleDays(), []);
  const { view } = offers;
  return (
    <div className="art-preview">
      <section className="art-preview-section">
        <h2 className="ui-label">Offers, one per tour operator</h2>
        <ul className="bookings-list art-preview-grid">
          {view?.offers.map((card) => (
            <OfferVoucher
              key={card.offer.id}
              card={card}
              today={view.day}
              full={false}
              bookings={offers}
            />
          ))}
        </ul>
      </section>
      <section className="art-preview-section">
        <h2 className="ui-label">Answered offers, stamped</h2>
        <ul className="bookings-list art-preview-grid">
          {view
            ? stamped.map(({ card, answer }) => (
                <OfferVoucher
                  key={card.offer.id}
                  card={card}
                  today={view.day}
                  full={false}
                  bookings={offers}
                  answer={answer}
                />
              ))
            : null}
        </ul>
      </section>
      <section className="art-preview-section">
        <h2 className="ui-label">Settlement receipts, one per outcome</h2>
        <div className="art-preview-grid art-preview-sheets">
          {settlements.map((settlement) => (
            <SettlementReceipt key={settlement.id} settlement={settlement} />
          ))}
        </div>
      </section>
      <section className="art-preview-section">
        <h2 className="ui-label">The Bookings window</h2>
        <div className="ui-panel art-preview-window">
          <BookingsPanel bookings={desk} />
        </div>
      </section>
      <section className="art-preview-section">
        <h2 className="ui-label">Event flyers, one per kind of event</h2>
        <div className="art-preview-grid art-preview-sheets">
          {flyers.map((sheet) => (
            <EventCards
              key={`${sheet.stage}:${sheet.cards[0]!.kind}`}
              cards={sheet.cards}
              stage={sheet.stage}
              onBook={() => null}
            />
          ))}
        </div>
      </section>
      <section className="art-preview-section">
        <h2 className="ui-label">The week's poster</h2>
        <div className="ui-panel art-preview-window">
          <ProgrammePoster days={poster} />
        </div>
      </section>
      <section className="art-preview-section">
        <h2 className="ui-label">The day report, tycoon and sandbox</h2>
        <div className="art-preview-grid art-preview-sheets">
          {days.map((day) => (
            <div key={day.report.day} className="ui-panel art-preview-window">
              <DayReceipt
                report={day.report}
                trend={day.trend}
                mode={day.mode}
                resortName="Coral Cove"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
