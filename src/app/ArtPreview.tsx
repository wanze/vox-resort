import { useMemo } from 'react';
import { BookingsPanel } from '../features/bookings/components/BookingsPanel';
import type { BookingsControls } from '../features/bookings/components/bookingsControls';
import { OfferVoucher } from '../features/bookings/components/OfferVoucher';
import { EventCards } from '../features/events/components/EventCards';
import { ProgrammePoster } from '../features/events/components/ProgrammePoster';
import { sampleDesk, sampleOffers } from './artSamples';
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
    </div>
  );
}
