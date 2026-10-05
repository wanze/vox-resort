import { useState } from 'react';
import type { EventKindId } from '../domain/catalogue';
import type { Repeat } from '../domain/programme';
import type { Card, RepeatChoice, TierChoice } from '../domain/programmeView';

export interface EventCardsProps {
  readonly cards: readonly Card[];
  readonly repeats: readonly RepeatChoice[];
  readonly onBook: (kind: EventKindId, start: number, repeat: Repeat, tier?: string) => void;
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
    <div className="hud-event-tiers" role="group" aria-label={`How big the ${card.label}`}>
      {card.tiers!.map((each) => (
        <button
          key={each.id}
          type="button"
          className="hud-camera-mode"
          aria-pressed={each.id === tier.id}
          onClick={() => onTier(each.id)}
        >
          {each.label}
        </button>
      ))}
    </div>
  );
}

function EventCard({
  card,
  repeats,
  onBook,
}: { readonly card: Card } & Pick<EventCardsProps, 'repeats' | 'onBook'>) {
  const [start, setStart] = useState(card.starts[0]!.minute);
  const [tierId, setTierId] = useState(DEFAULT_TIER);
  const tier = card.tiers?.find((each) => each.id === tierId);
  const shown = tier ?? card;
  return (
    <li className="hud-event-card">
      <div className="hud-event-card-head">
        <strong>{card.label}</strong>
        <span className="hud-stat-note">{shown.fee}</span>
      </div>
      <p className="hud-event-blurb">{card.blurb}</p>
      <p className="hud-stat-note">
        {card.host} · about <span className="hud-num">{shown.audience}</span> guests
      </p>
      {shown.warning ? <p className="hud-event-warning">{shown.warning}</p> : null}
      {tier ? <TierRow card={card} tier={tier} onTier={setTierId} /> : null}
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
            onClick={() => onBook(card.kind, start, choice.repeat, tier?.id)}
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
