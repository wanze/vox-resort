import { useState } from 'react';
import type { EventKindId } from '../domain/catalogue';
import type { BookingRefusal, Repeat } from '../domain/programme';
import type { Card, StartChoice, TierChoice } from '../domain/programmeView';
import { refusalWords } from './eventWords';

export interface EventCardsProps {
  readonly cards: readonly Card[];
  // Answers why the booking was refused, or null once it is made.
  readonly onBook: (
    kind: EventKindId,
    start: number,
    repeat: Repeat,
    tier?: string,
  ) => BookingRefusal | null;
}

// The middle size, as a booking with none is played.
const DEFAULT_TIER = 'medium';

function TierRow({
  card,
  tier,
  onTier,
}: {
  readonly card: Card;
  readonly tier: TierChoice;
  readonly onTier: (id: string) => void;
}) {
  return (
    <div className="ui-row ui-row--wrap" role="group" aria-label={`How big the ${card.label}`}>
      {card.tiers!.map((each) => (
        <button
          key={each.id}
          type="button"
          className="ui-button"
          aria-pressed={each.id === tier.id}
          onClick={() => onTier(each.id)}
        >
          {each.label}
        </button>
      ))}
    </div>
  );
}

// Said under the buttons as well as on them: a finger gets no tooltip.
function RepeatNotes({ start }: { readonly start: StartChoice }) {
  const refused = start.repeats.filter((choice) => choice.refusal !== null);
  if (refused.length === 0) return null;
  return (
    <ul className="events-notes">
      {refused.map((choice) => (
        <li key={choice.words}>
          {choice.words}: {refusalWords(choice.refusal!)}
        </li>
      ))}
    </ul>
  );
}

function BookingForm({
  card,
  tier,
  onBook,
}: {
  readonly card: Card;
  readonly tier: TierChoice | undefined;
  readonly onBook: EventCardsProps['onBook'];
}) {
  const [minute, setMinute] = useState(card.starts[0]!.minute);
  const [refusal, setRefusal] = useState<BookingRefusal | null>(null);
  // A start booked up since it was picked falls back to the first one still free.
  const start = card.starts.find((each) => each.minute === minute) ?? card.starts[0]!;
  return (
    <>
      <div className="ui-row ui-row--wrap">
        <select
          className="ui-select"
          aria-label={`When the ${card.label} starts`}
          value={start.minute}
          onChange={(event) => setMinute(Number(event.target.value))}
        >
          {card.starts.map((each) => (
            <option key={each.minute} value={each.minute}>
              {each.words}
            </option>
          ))}
        </select>
        {start.repeats.map((choice) => (
          <button
            key={choice.words}
            type="button"
            className="ui-button"
            disabled={choice.refusal !== null}
            title={choice.refusal ? refusalWords(choice.refusal) : undefined}
            onClick={() => setRefusal(onBook(card.kind, start.minute, choice.repeat, tier?.id))}
          >
            {choice.words}
          </button>
        ))}
      </div>
      <RepeatNotes start={start} />
      {refusal ? (
        <p className="events-refusal" role="alert">
          {refusalWords(refusal)}
        </p>
      ) : null}
    </>
  );
}

// Still listed, so the player sees the kind exists and why it cannot go on.
function FullCard({ card }: { readonly card: Card }) {
  return (
    <li className="events-card" data-full="">
      <div className="events-card-head">
        <strong>{card.label}</strong>
        <span className="ui-stat-note">No free time</span>
      </div>
      <p className="ui-stat-note">Something else is on at every time it could start.</p>
    </li>
  );
}

function EventCard({ card, onBook }: { readonly card: Card } & Pick<EventCardsProps, 'onBook'>) {
  const [tierId, setTierId] = useState(DEFAULT_TIER);
  const tier = card.tiers?.find((each) => each.id === tierId);
  const shown = tier ?? card;
  return (
    <li className="events-card">
      <div className="events-card-head">
        <strong>{card.label}</strong>
        <span className="ui-stat-note">{shown.fee}</span>
      </div>
      <p className="events-blurb">{card.blurb}</p>
      <p className="ui-stat-note">
        {card.host} · about {shown.audience} guests
      </p>
      {shown.warning ? <p className="events-warning">{shown.warning}</p> : null}
      {tier ? <TierRow card={card} tier={tier} onTier={setTierId} /> : null}
      <BookingForm card={card} tier={tier} onBook={onBook} />
    </li>
  );
}

export function EventCards({ cards, onBook }: EventCardsProps) {
  return (
    <ul className="events-cards">
      {cards.map((card) =>
        card.starts.length === 0 ? (
          <FullCard key={card.kind} card={card} />
        ) : (
          <EventCard key={card.kind} card={card} onBook={onBook} />
        ),
      )}
    </ul>
  );
}
