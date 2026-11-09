import { PixelIcon, PixelPicture } from '../../../shared/components/PixelIcon';
import type { PosterDay, PosterEvent } from '../domain/poster';
import { CATEGORY_OF, motifOf } from './eventArt';

export interface ProgrammePosterProps {
  readonly days: readonly PosterDay[];
}

function PosterItem({ event }: { readonly event: PosterEvent }) {
  const words = `${event.time} ${event.label}, ${event.site}`;
  return (
    <li
      className="events-poster-event"
      data-category={CATEGORY_OF[event.kind]}
      data-over={event.over ? '' : undefined}
      title={event.over ? `${words}, over` : words}
    >
      <span className="events-poster-icon">
        <PixelPicture art={motifOf(event.kind)} scale={1} />
      </span>
      <span className="events-poster-time">{event.time}</span>
      <span className="ui-visually-hidden">
        {event.label} at {event.site}
        {event.over ? ', over' : ''}
      </span>
    </li>
  );
}

function PosterWeather({ day }: { readonly day: PosterDay }) {
  if (!day.weather) {
    return (
      <span className="events-poster-weather" title="Not forecast yet">
        ?
      </span>
    );
  }
  return (
    <span
      className="events-poster-weather"
      title={day.pinned ? `${day.weather}, pinned` : day.weather}
    >
      <PixelIcon name={day.weather} scale={2} />
    </span>
  );
}

function PosterColumn({ day }: { readonly day: PosterDay }) {
  return (
    <li className="events-poster-day" data-today={day.today ? '' : undefined}>
      <span className="events-poster-weekday">{day.weekday}</span>
      <span className="events-poster-date">{day.date}</span>
      <PosterWeather day={day} />
      {day.events.length > 0 ? (
        <ol className="events-poster-events">
          {day.events.map((event) => (
            <PosterItem key={event.key} event={event} />
          ))}
        </ol>
      ) : (
        <span className="events-poster-none">Nothing on</span>
      )}
    </li>
  );
}

// Read-only: the notice board is what guests see, and booking stays on the grid.
export function ProgrammePoster({ days }: ProgrammePosterProps) {
  return (
    <figure className="ui-print events-poster">
      <figcaption className="events-poster-head">
        <span>Reception notice board</span>
        <strong>What's on this week</strong>
      </figcaption>
      <ol className="events-poster-week">
        {days.map((day) => (
          <PosterColumn key={day.day} day={day} />
        ))}
      </ol>
    </figure>
  );
}
