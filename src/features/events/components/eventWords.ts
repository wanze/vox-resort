import type { EventNews } from '../../hud/domain/news';
import type { EventTally } from '../../sim/domain/dayReport';
import type { CallOff } from '../domain/eventRuns';
import type { BookingRefusal } from '../domain/programme';
import { clockWords, minuteOf } from '../domain/week';

const EVENING_FROM = 18 * 60;

const CALL_OFF_WORDS: { readonly [reason in CallOff]: string } = {
  weather: 'rain',
  'no-host': 'no animator on duty',
  unpaid: 'could not pay the act',
  'no-site': 'the stage is gone',
};

const REFUSAL_WORDS: { readonly [refusal in BookingRefusal]: string } = {
  overlap: 'Something else is on that stage then, or too close to it.',
  hours: 'It does not start at that time.',
  site: 'It cannot be held there.',
  past: 'That is too late to announce.',
  'built-in': 'That one comes with the resort.',
};

const at = (news: EventNews): string => (news.venue ? ` at ${news.venue}` : '');

const reasonWords = (news: EventNews): string => CALL_OFF_WORDS[news.reason ?? 'weather'];

const whenWords = (minute: number): string =>
  minute >= EVENING_FROM ? 'Tonight' : 'This afternoon';

const LINES: { readonly [kind in EventNews['kind']]: (news: EventNews) => string } = {
  announce: (news) => {
    const minute = minuteOf(news.start);
    return `${whenWords(minute)} ${clockWords(minute)}: ${news.label}${at(news)}`;
  },
  'call-off': (news) => `${news.label}${at(news)} called off: ${reasonWords(news)}`,
  postpone: (news) => `${news.label} moved to tomorrow: ${reasonWords(news)}`,
};

export const eventNewsLine = (news: EventNews): string => LINES[news.kind](news);

export const refusalWords = (refusal: BookingRefusal): string => REFUSAL_WORDS[refusal];

// Null for a day with no event held or called off, which the report leaves out.
export function tallyWords(tally: EventTally | undefined): string | null {
  if (!tally || tally.held + tally.called === 0) return null;
  const guests = tally.audience.toLocaleString('en-US');
  return `${tally.held} held · ${guests} guests · ${tally.called} called off`;
}
