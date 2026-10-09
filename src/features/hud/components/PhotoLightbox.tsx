import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { clockWords } from '../../events/domain/week';
import type { PhotoControls, PhotoShot } from '../../photo/components/photoControls';
import { enlargedSize, type WallCard } from '../domain/photoWall';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { useReturnFocus } from '../../../shared/components/useReturnFocus';

export type WallPhotos = Pick<
  PhotoControls,
  'picture' | 'enlarge' | 'saveShot' | 'shareShot' | 'canShare'
>;

export interface PhotoLightboxProps {
  readonly cards: readonly WallCard[];
  readonly open: WallCard;
  readonly onOpen: (card: WallCard) => void;
  readonly onClose: () => void;
  readonly photo: WallPhotos;
}

// As `.hud-lightbox-picture` leaves room: 16 px gutters, the frame's padding and the print's
// border either side, the head, the actions and the print's border above and below.
const GUTTERS = 88;
const CHROME = 224;

interface Developed {
  readonly id: string;
  readonly shot: PhotoShot;
  readonly url: string;
}

// The previous picture stays up until the next is in, then its URL is revoked; the last one goes
// when the lightbox shuts. The controls are rebuilt every HUD render, so only the card re-renders.
function useEnlarged(card: WallCard, photo: WallPhotos): Developed | null {
  const [developed, setDeveloped] = useState<Developed | null>(null);
  const enlarge = useRef(photo.enlarge);
  const latest = useRef<string | null>(null);
  useEffect(() => {
    enlarge.current = photo.enlarge;
  });
  useEffect(() => {
    let current = true;
    const room = { width: window.innerWidth - GUTTERS, height: window.innerHeight - CHROME };
    void enlarge
      .current(card.spot, enlargedSize(room, window.devicePixelRatio), card.daysAgo)
      .then((shot) => {
        if (!current || !shot) return;
        const url = URL.createObjectURL(shot.blob);
        if (latest.current) URL.revokeObjectURL(latest.current);
        latest.current = url;
        setDeveloped({ id: card.id, shot, url });
      });
    return () => {
      current = false;
    };
  }, [card]);
  useEffect(
    () => () => {
      if (latest.current) URL.revokeObjectURL(latest.current);
      latest.current = null;
    },
    [],
  );
  return developed;
}

const STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

// Stopped here, so Escape shuts the lightbox without also closing the window behind it.
const keysFor =
  (step: (by: number) => void, onClose: () => void) =>
  (event: KeyboardEvent<HTMLDivElement>): void => {
    const by = STEPS[event.key];
    if (by !== undefined) step(by);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

function stepsThrough(
  cards: readonly WallCard[],
  open: WallCard,
  onOpen: (card: WallCard) => void,
) {
  const at = cards.findIndex((card) => card.id === open.id);
  return {
    back: at > 0,
    on: at >= 0 && at < cards.length - 1,
    step: (by: number): void => {
      const next = cards[at + by];
      if (at >= 0 && next) onOpen(next);
    },
  };
}

function Picture({
  developed,
  card,
}: {
  readonly developed: Developed | null;
  readonly card: WallCard;
}) {
  const ready = developed?.id === card.id;
  return (
    <div className="hud-lightbox-frame">
      <span className="hud-lightbox-print">
        <span className="hud-photo-film">
          {developed ? (
            <img className="hud-lightbox-picture" src={developed.url} alt={card.spot.subject} />
          ) : (
            <span className="hud-lightbox-picture" aria-hidden="true" />
          )}
        </span>
      </span>
      <p className="hud-lightbox-note" role="status">
        {ready ? '' : 'Developing…'}
      </p>
    </div>
  );
}

function Actions({
  steps,
  shot,
  photo,
}: {
  readonly steps: ReturnType<typeof stepsThrough>;
  readonly shot: PhotoShot | null;
  readonly photo: WallPhotos;
}) {
  return (
    <div className="ui-actions hud-lightbox-actions">
      <button
        type="button"
        className="ui-button-large"
        disabled={!steps.back}
        onClick={() => steps.step(-1)}
      >
        Previous
      </button>
      <button
        type="button"
        className="ui-button-large"
        disabled={!steps.on}
        onClick={() => steps.step(1)}
      >
        Next
      </button>
      <span className="hud-lightbox-gap" />
      <button
        type="button"
        className="ui-button-large"
        disabled={!shot}
        onClick={() => shot && photo.saveShot(shot)}
      >
        Save
      </button>
      {photo.canShare ? (
        <button
          type="button"
          className="ui-button-large"
          disabled={!shot}
          onClick={() => shot && photo.shareShot(shot)}
        >
          Share
        </button>
      ) : null}
    </div>
  );
}

const cardButton = (card: WallCard): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-card="${CSS.escape(card.id)}"]`);

export function PhotoLightbox({ cards, open, onOpen, onClose, photo }: PhotoLightboxProps) {
  const titleId = useId();
  useReturnFocus(() => cardButton(open));
  const developed = useEnlarged(open, photo);
  const steps = stepsThrough(cards, open, onOpen);
  const shot = developed?.id === open.id ? developed.shot : null;
  const { spot } = open;
  return (
    <div className="hud-lightbox-layer">
      <div className="ui-scrim hud-lightbox-scrim" onPointerDown={onClose} />
      <div
        className="ui-panel hud-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={keysFor(steps.step, onClose)}
      >
        <header className="ui-window-head">
          <h2 className="ui-window-title" id={titleId}>
            {spot.subject}
          </h2>
          <span className="ui-stat-note">{`at ${clockWords(spot.minute)}`}</span>
          <button
            type="button"
            className="ui-window-close"
            aria-label="Close the photo"
            title="Close (Esc)"
            autoFocus
            onClick={onClose}
          >
            <PixelIcon name="close" scale={1} />
          </button>
        </header>
        <Picture developed={developed} card={open} />
        <Actions steps={steps} shot={shot} photo={photo} />
      </div>
    </div>
  );
}
