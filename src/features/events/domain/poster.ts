import { shownDay } from '../../../shared/domain/dayNumber';
import type { Weather } from '../../sim/domain/weather';
import { EVENT_KINDS, labelOf, type EventKindId } from './catalogue';
import { occurrencesOn, siteKey, type Programme } from './programme';
import { clockWords, dayAt, minuteOf, WEEKDAY_NAMES, weekdayOf } from './week';

export interface PosterForecast {
  readonly day: number;
  readonly weather: Weather;
  readonly pinned: boolean;
}

export interface PosterEvent {
  readonly key: string;
  readonly kind: EventKindId;
  readonly time: string;
  readonly label: string;
  readonly site: string;
  // Already over, so the board shows it struck through rather than taking it down.
  readonly over: boolean;
}

export interface PosterDay {
  readonly day: number;
  readonly weekday: string;
  readonly date: number;
  readonly today: boolean;
  readonly weather: Weather | null;
  readonly pinned: boolean;
  readonly events: readonly PosterEvent[];
}

const UNKNOWN_WEATHER = { weather: null, pinned: false } as const;

// Every stage at once, as the reception pins up one sheet for the whole resort.
export function posterWeek(
  programme: Programme,
  now: number,
  length: number,
  forecast: readonly PosterForecast[],
  siteLabels: ReadonlyMap<string, string>,
): readonly PosterDay[] {
  const today = dayAt(now);
  const weather = new Map(forecast.map((each) => [each.day, each]));
  return Array.from({ length }, (_, offset) => {
    const day = today + offset;
    const { weather: sky, pinned } = weather.get(day) ?? UNKNOWN_WEATHER;
    return {
      day,
      weekday: WEEKDAY_NAMES[weekdayOf(day)],
      date: shownDay(day),
      today: offset === 0,
      weather: sky,
      pinned,
      events: occurrencesOn(programme, day).map((each) => ({
        key: `${each.booking}:${day}`,
        kind: each.kind,
        time: clockWords(minuteOf(each.start)),
        label: labelOf(EVENT_KINDS[each.kind], each.tier, each.site.kind),
        site: siteLabels.get(siteKey(each.site)) ?? 'nowhere',
        over: each.end <= now,
      })),
    };
  });
}
