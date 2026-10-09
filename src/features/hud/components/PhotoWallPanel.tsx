import { useEffect, useMemo, useRef, useState } from 'react';
import { clockWords } from '../../events/domain/week';
import type { DayReport, PhotoSpot, PhotoTally } from '../../sim/domain/dayReport';
import { photoWallOf } from '../domain/photoWall';

export interface PhotoWallPanelProps {
  readonly today: PhotoTally | null;
  readonly history: readonly DayReport[];
  // An object URL of the scene from where the latest photo of the spot was taken.
  readonly onPicture: (spot: PhotoSpot) => Promise<string | null>;
}

// One render at a time, only for the cards on the wall, and only while it is open: the URLs are
// revoked when it closes, and one that arrives after that is revoked at once.
function usePictures(
  spots: readonly PhotoSpot[],
  onPicture: PhotoWallPanelProps['onPicture'],
): ReadonlyMap<string, string> {
  const [pictures, setPictures] = useState<ReadonlyMap<string, string>>(() => new Map());
  const asked = useRef(new Set<string>());
  const made = useRef<string[]>([]);
  const open = useRef(true);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    open.current = true;
    const urls = made.current;
    return () => {
      open.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    for (const spot of spots) {
      if (asked.current.has(spot.key)) continue;
      asked.current.add(spot.key);
      queue.current = queue.current.then(async () => {
        if (!open.current) return;
        const url = await onPicture(spot);
        if (url === null) return;
        if (!open.current) {
          URL.revokeObjectURL(url);
          return;
        }
        made.current.push(url);
        setPictures((before) => new Map(before).set(spot.key, url));
      });
    }
  }, [spots, onPicture]);

  return pictures;
}

function PhotoCard({
  spot,
  picture,
}: {
  readonly spot: PhotoSpot;
  readonly picture: string | undefined;
}) {
  return (
    <figure className="hud-photo-card">
      {picture ? (
        <img className="hud-photo-picture" src={picture} alt={spot.subject} />
      ) : (
        <div className="hud-photo-picture" aria-hidden="true" />
      )}
      <figcaption>
        <span className="hud-photo-subject">{spot.subject}</span>
        <span className="hud-stat-note">{`${spot.count}× · at ${clockWords(spot.minute)}`}</span>
      </figcaption>
    </figure>
  );
}

function Wall({
  title,
  spots,
  pictures,
}: {
  readonly title: string;
  readonly spots: readonly PhotoSpot[];
  readonly pictures: ReadonlyMap<string, string>;
}) {
  return (
    <section className="hud-report-section">
      <h3 className="hud-report-heading">{title}</h3>
      <div className="hud-photo-wall">
        {spots.map((spot) => (
          <PhotoCard key={spot.key} spot={spot} picture={pictures.get(spot.key)} />
        ))}
      </div>
    </section>
  );
}

// The pictures are drawn as the resort looks now, not at the hour the photo was taken.
export function PhotoWallPanel({ today, history, onPicture }: PhotoWallPanelProps) {
  const wall = useMemo(() => photoWallOf(today, history), [today, history]);
  const pictures = usePictures(wall.shown, onPicture);
  return (
    <div className="hud-report">
      {wall.today.length === 0 ? (
        <p className="hud-loading">No photos yet today.</p>
      ) : (
        <Wall title={`Today, ${wall.taken} photos`} spots={wall.today} pictures={pictures} />
      )}
      {wall.yesterday.length > 0 ? (
        <Wall title="Yesterday's favourites" spots={wall.yesterday} pictures={pictures} />
      ) : null}
    </div>
  );
}
