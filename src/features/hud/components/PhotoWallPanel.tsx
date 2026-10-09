import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clockWords } from '../../events/domain/week';
import type { DayReport, PhotoTally } from '../../sim/domain/dayReport';
import type { PhotoKind } from '../../sim/domain/views';
import { photoWallOf, type WallCard, type WallGroup } from '../domain/photoWall';
import { PhotoLightbox, type WallPhotos } from './PhotoLightbox';

export interface PhotoWallPanelProps {
  readonly today: PhotoTally | null;
  readonly history: readonly DayReport[];
  readonly photo: WallPhotos;
}

const GROUP_TITLES: Readonly<Record<PhotoKind, string>> = {
  sunset: 'Sunsets',
  show: 'Shows',
  fireworks: 'Fireworks',
  sight: 'Sights',
  sea: 'Sea',
  water: 'Water',
  view: 'Views',
};

const forgetOffWall = (asked: Set<string>, onWall: ReadonlySet<string>): void => {
  for (const id of asked) if (!onWall.has(id)) asked.delete(id);
};

// Answers whether any went, so the pictures shown are only replaced when they change.
function revokeOffWall(made: Map<string, string>, onWall: ReadonlySet<string>): boolean {
  const before = made.size;
  for (const [id, url] of made) {
    if (onWall.has(id)) continue;
    URL.revokeObjectURL(url);
    made.delete(id);
  }
  return made.size !== before;
}

// One render at a time, only for cards scrolled into view. A card's URL is revoked when it leaves
// the wall, at midnight say, and every one when the wall closes; one that arrives for a card no
// longer on it is revoked at once.
function usePictures(cards: readonly WallCard[], onPicture: WallPhotos['picture']) {
  const [pictures, setPictures] = useState<ReadonlyMap<string, string>>(() => new Map());
  const asked = useRef(new Set<string>());
  const made = useRef(new Map<string, string>());
  const onWall = useRef(new Set<string>());
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    const urls = made.current;
    return () => {
      onWall.current = new Set();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    onWall.current = new Set(cards.map((card) => card.id));
    forgetOffWall(asked.current, onWall.current);
    if (revokeOffWall(made.current, onWall.current)) setPictures(new Map(made.current));
  }, [cards]);

  const want = useCallback(
    (card: WallCard) => {
      if (asked.current.has(card.id)) return;
      asked.current.add(card.id);
      queue.current = queue.current.then(async () => {
        if (!onWall.current.has(card.id)) return;
        const url = await onPicture(card.spot);
        if (url === null) return;
        if (!onWall.current.has(card.id)) {
          URL.revokeObjectURL(url);
          return;
        }
        made.current.set(card.id, url);
        setPictures(new Map(made.current));
      });
    },
    [onPicture],
  );

  return { pictures, want };
}

const cardsSeen = (
  entries: readonly IntersectionObserverEntry[],
  byId: ReadonlyMap<string, WallCard>,
): WallCard[] =>
  entries.flatMap((entry) => {
    const card = byId.get((entry.target as HTMLElement).dataset.card ?? '');
    return entry.isIntersecting && card ? [card] : [];
  });

// Clipped by the window's scroller as well as the screen, so a card below the fold waits.
function useInView(cards: readonly WallCard[], want: (card: WallCard) => void) {
  const elements = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const byId = new Map(cards.map((card) => [card.id, card]));
    const observer = new IntersectionObserver((entries) => cardsSeen(entries, byId).forEach(want));
    for (const element of elements.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [cards, want]);
  return useCallback((id: string, element: HTMLElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);
}

interface Shelf {
  readonly pictures: ReadonlyMap<string, string>;
  readonly watch: (id: string, element: HTMLElement | null) => void;
  readonly onOpen: (card: WallCard) => void;
}

function PhotoCard({ card, shelf }: { readonly card: WallCard; readonly shelf: Shelf }) {
  const { spot } = card;
  const picture = shelf.pictures.get(card.id);
  return (
    <button
      type="button"
      className="hud-photo-card"
      data-card={card.id}
      ref={(element) => shelf.watch(card.id, element)}
      aria-label={`${spot.subject}, ${spot.count}× at ${clockWords(spot.minute)}: enlarge`}
      onClick={() => shelf.onOpen(card)}
    >
      {picture ? (
        <img className="hud-photo-picture" src={picture} alt="" />
      ) : (
        <span className="hud-photo-picture" aria-hidden="true" />
      )}
      <span className="hud-photo-caption" aria-hidden="true">
        <span className="hud-photo-subject">{spot.subject}</span>
        <span className="hud-stat-note">{`${spot.count}× · at ${clockWords(spot.minute)}`}</span>
      </span>
    </button>
  );
}

function Wall({
  title,
  groups,
  shelf,
}: {
  readonly title: string;
  readonly groups: readonly WallGroup[];
  readonly shelf: Shelf;
}) {
  if (groups.length === 0) return null;
  return (
    <section className="hud-report-section">
      <h3 className="hud-report-heading">{title}</h3>
      {groups.map((group) => (
        <section key={group.kind} className="hud-photo-group">
          <h4 className="hud-photo-group-title">{GROUP_TITLES[group.kind]}</h4>
          <div className="hud-photo-wall">
            {group.cards.map((card) => (
              <PhotoCard key={card.id} card={card} shelf={shelf} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

// Out of the window, whose stacking would put a later window over the lightbox.
function useLightbox(cards: readonly WallCard[], photo: WallPhotos) {
  const [open, setOpen] = useState<WallCard | null>(null);
  const [layer, setLayer] = useState<Element | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const enlarge = useCallback((card: WallCard) => {
    setLayer(root.current?.closest('.hud') ?? document.body);
    setOpen(card);
  }, []);
  const lightbox =
    open && layer
      ? createPortal(
          <PhotoLightbox
            cards={cards}
            open={open}
            onOpen={setOpen}
            onClose={() => setOpen(null)}
            photo={photo}
          />,
          layer,
        )
      : null;
  return { root, enlarge, lightbox };
}

// Each picture is drawn at its photo's hour, but in today's weather.
export function PhotoWallPanel({ today, history, photo }: PhotoWallPanelProps) {
  const wall = useMemo(() => photoWallOf(today, history), [today, history]);
  const { pictures, want } = usePictures(wall.shown, photo.picture);
  const watch = useInView(wall.shown, want);
  const { root, enlarge, lightbox } = useLightbox(wall.shown, photo);
  const shelf = { pictures, watch, onOpen: enlarge };
  return (
    <div className="hud-report" ref={root}>
      {wall.today.length === 0 ? <p className="hud-loading">No photos yet today.</p> : null}
      <Wall title={`Today, ${wall.taken} photos`} groups={wall.today} shelf={shelf} />
      <Wall title="Yesterday" groups={wall.yesterday} shelf={shelf} />
      {lightbox}
    </div>
  );
}
