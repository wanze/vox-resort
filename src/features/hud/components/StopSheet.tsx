import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { BookingsControls } from '../../bookings/components/bookingsControls';
import { OfferVoucher } from '../../bookings/components/OfferVoucher';
import { ProgrammePoster } from '../../events/components/ProgrammePoster';
import type { PosterDay } from '../../events/domain/poster';
import type { Stop } from '../domain/stops';

export interface StopSheetProps {
  readonly stop: Stop | null;
  readonly poster: readonly PosterDay[];
  readonly bookings: BookingsControls;
  readonly onAnswer: (key: string) => void;
  readonly onPlan: (key: string) => void;
}

type Shown = Exclude<Stop, { readonly kind: 'planning' }>;

// Escape is the quiet answer, stopped here so it does not also open the menu behind.
const onEscape =
  (leave: () => void) =>
  (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    leave();
  };

function Sheet(props: {
  readonly title: string;
  readonly leave: () => void;
  readonly children: ReactNode;
  readonly actions: ReactNode;
}) {
  const titleId = useId();
  return (
    <div className="ui-modal">
      <div className="ui-scrim hud-stop-scrim" />
      <div
        className="ui-panel hud-stop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onEscape(props.leave)}
      >
        <h2 className="ui-window-title" id={titleId}>
          {props.title}
        </h2>
        <div className="hud-stop-body">{props.children}</div>
        <div className="ui-actions">{props.actions}</div>
      </div>
    </div>
  );
}

function WeekSheet({ stop, ...props }: { readonly stop: Shown } & StopSheetProps) {
  const leave = () => props.onAnswer(stop.key);
  return (
    <Sheet
      title="A new week"
      leave={leave}
      actions={
        <>
          <button
            type="button"
            className="ui-button-large ui-button-large--primary"
            autoFocus
            onClick={() => props.onPlan(stop.key)}
          >
            Plan the week
          </button>
          <button type="button" className="ui-button-large" onClick={leave}>
            Carry on
          </button>
        </>
      }
    >
      <ProgrammePoster days={props.poster} />
    </Sheet>
  );
}

// Answering either way is the end of the stop; a refusal keeps it up to say why.
function answering(bookings: BookingsControls, done: () => void): BookingsControls {
  return {
    view: bookings.view,
    accept: (id) => {
      const refusal = bookings.accept(id);
      if (refusal === null) done();
      return refusal;
    },
    decline: (id) => {
      bookings.decline(id);
      done();
    },
  };
}

function OfferBody({
  offer,
  bookings,
  done,
}: {
  readonly offer: number;
  readonly bookings: BookingsControls;
  readonly done: () => void;
}) {
  const { view } = bookings;
  const card = view?.offers.find((each) => each.offer.id === offer);
  if (!card || !view) return <p className="hud-stop-text">The offer is no longer open.</p>;
  return (
    <ul className="bookings-list">
      <OfferVoucher
        card={card}
        today={view.day}
        full={view.full}
        bookings={answering(bookings, done)}
      />
    </ul>
  );
}

function OfferSheet({
  stop,
  offer,
  ...props
}: { readonly stop: Shown; readonly offer: number } & StopSheetProps) {
  const leave = () => props.onAnswer(stop.key);
  return (
    <Sheet
      title="A group booking offer"
      leave={leave}
      actions={
        <button type="button" className="ui-button-large" onClick={leave}>
          Later
        </button>
      }
    >
      <OfferBody offer={offer} bookings={props.bookings} done={leave} />
    </Sheet>
  );
}

// Over the HUD, pausing the game until it is answered; at most one at a time.
export function StopSheet(props: StopSheetProps) {
  const { stop } = props;
  if (!stop || stop.kind === 'planning') return null;
  if (stop.kind === 'week') return <WeekSheet key={stop.key} {...props} stop={stop} />;
  return <OfferSheet key={stop.key} {...props} stop={stop} offer={stop.offer} />;
}
