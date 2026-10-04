import { useState } from 'react';
import type { EventKindId } from '../domain/catalogue';
import type { Repeat } from '../domain/programme';
import type { Card, RepeatChoice } from '../domain/programmeView';

export interface EventCardsProps {
  readonly cards: readonly Card[];
  readonly repeats: readonly RepeatChoice[];
  readonly onBook: (kind: EventKindId, start: number, repeat: Repeat) => void;
}

function EventCard({
  card,
  repeats,
  onBook,
}: { readonly card: Card } & Pick<EventCardsProps, 'repeats' | 'onBook'>) {
  const [start, setStart] = useState(card.starts[0]!.minute);
  return (
    <li className="hud-event-card">
      <div className="hud-event-card-head">
        <strong>{card.label}</strong>
        <span className="hud-stat-note">{card.fee}</span>
      </div>
      <p className="hud-event-blurb">{card.blurb}</p>
      <p className="hud-stat-note">
        {card.host} · about <span className="hud-num">{card.audience}</span> guests
      </p>
      {card.warning ? <p className="hud-event-warning">{card.warning}</p> : null}
      <div className="hud-event-book">
        <select
          className="hud-event-start"
          aria-label={`When the ${card.label} starts`}
          value={start}
          onChange={(event) => setStart(Number(event.target.value))}
        >
          {card.starts.map((each) => (
            <option key={each.minute} value={each.minute}>
              {each.words}
            </option>
          ))}
        </select>
        {repeats.map((choice) => (
          <button
            key={choice.words}
            type="button"
            className="hud-camera-mode"
            onClick={() => onBook(card.kind, start, choice.repeat)}
          >
            {choice.words}
          </button>
        ))}
      </div>
    </li>
  );
}

export function EventCards({ cards, repeats, onBook }: EventCardsProps) {
  return (
    <ul className="hud-event-cards">
      {cards.map((card) => (
        <EventCard key={card.kind} card={card} repeats={repeats} onBook={onBook} />
      ))}
    </ul>
  );
}
