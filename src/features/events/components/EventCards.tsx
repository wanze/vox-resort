import { useState } from 'react';
import { PixelPicture } from '../../../shared/components/PixelIcon';
import type { EventKindId } from '../domain/catalogue';
import type { BookingRefusal, Repeat } from '../domain/programme';
import type { Card, StartChoice, TierChoice } from '../domain/programmeView';
import { CATEGORY_OF, motifOf } from './eventArt';
import { refusalWords } from './eventWords';

export interface EventCardsProps {
  readonly cards: readonly Card[];
  readonly stage: string;
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
  start,
  tier,
  onStart,
  onBook,
}: {
  readonly card: Card;
  readonly start: StartChoice;
  readonly tier: TierChoice | undefined;
  readonly onStart: (minute: number) => void;
  readonly onBook: EventCardsProps['onBook'];
}) {
  const [refusal, setRefusal] = useState<BookingRefusal | null>(null);
  return (
    <>
      <div className="ui-row ui-row--wrap">
        <select
          className="ui-select"
          aria-label={`When the ${card.label} starts`}
          value={start.minute}
          onChange={(event) => onStart(Number(event.target.value))}
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

// The motif grows with the size booked, so a grand show is a bigger picture as well as a word.
const TIER_SCALES: { readonly [tier: string]: number } = { small: 2, medium: 3, grand: 4 };

const MOTIF_SCALE = 3;

function Face({
  card,
  time,
  tier,
  stage,
}: {
  readonly card: Card;
  readonly time: string;
  readonly tier: TierChoice | undefined;
  readonly stage: string;
}) {
  return (
    <div className="events-flyer-face">
      <span className="events-flyer-motif">
        <PixelPicture
          art={motifOf(card.kind)}
          scale={tier ? (TIER_SCALES[tier.id] ?? MOTIF_SCALE) : MOTIF_SCALE}
        />
      </span>
      <h4 className="events-flyer-title">{card.label}</h4>
      {tier ? <span className="events-flyer-tier">{tier.label}</span> : null}
      <p className="events-flyer-when">
        <strong>{time}</strong>
        <span>at {stage}</span>
      </p>
    </div>
  );
}

function Details({ card, shown }: { readonly card: Card; readonly shown: Card | TierChoice }) {
  return (
    <div className="events-flyer-body">
      <p className="events-flyer-blurb">{card.blurb}</p>
      <p className="events-flyer-facts">
        <span className="events-flyer-fee">{shown.fee}</span>
        <span>
          {card.host}, about {shown.audience} guests
        </span>
      </p>
      {shown.warning ? <p className="events-warning">{shown.warning}</p> : null}
    </div>
  );
}

// Still pinned up, so the player sees the kind exists and why it cannot go on.
function FullCard({ card, stage }: { readonly card: Card; readonly stage: string }) {
  return (
    <li className="ui-print events-flyer" data-category={CATEGORY_OF[card.kind]} data-full="">
      <Face card={card} time="No free time" tier={undefined} stage={stage} />
      <div className="events-flyer-body">
        <p className="events-flyer-blurb">Something else is on at every time it could start.</p>
      </div>
      <p className="events-flyer-stamp" aria-hidden="true">
        Booked up
      </p>
    </li>
  );
}

// A start booked up since it was picked falls back to the first one still free.
const startAt = (card: Card, minute: number): StartChoice =>
  card.starts.find((each) => each.minute === minute) ?? card.starts[0]!;

function EventCard({
  card,
  stage,
  onBook,
}: { readonly card: Card } & Pick<EventCardsProps, 'stage' | 'onBook'>) {
  const [tierId, setTierId] = useState(DEFAULT_TIER);
  const [minute, setMinute] = useState(card.starts[0]!.minute);
  const tier = card.tiers?.find((each) => each.id === tierId);
  const start = startAt(card, minute);
  return (
    <li
      className="ui-print events-flyer"
      data-category={CATEGORY_OF[card.kind]}
      data-tier={tier?.id}
    >
      <Face card={card} time={start.words} tier={tier} stage={stage} />
      <Details card={card} shown={tier ?? card} />
      <div className="events-flyer-stub">
        {tier ? <TierRow card={card} tier={tier} onTier={setTierId} /> : null}
        <BookingForm card={card} start={start} tier={tier} onStart={setMinute} onBook={onBook} />
      </div>
    </li>
  );
}

export function EventCards({ cards, stage, onBook }: EventCardsProps) {
  return (
    <ul className="events-flyers">
      {cards.map((card) =>
        card.starts.length === 0 ? (
          <FullCard key={card.kind} card={card} stage={stage} />
        ) : (
          <EventCard key={card.kind} card={card} stage={stage} onBook={onBook} />
        ),
      )}
    </ul>
  );
}
