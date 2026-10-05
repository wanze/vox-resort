import type { EventNews } from '../../hud/domain/news';
import type { DayReport, EventTally, WelcomeGap } from '../../sim/domain/dayReport';
import type { CallOff } from '../domain/eventRuns';
import type { BookingRefusal } from '../domain/programme';
import type { Weather } from '../../sim/domain/weather';
import { clockWords, minuteOf } from '../domain/week';

const AFTERNOON_FROM = 12 * 60;

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

function whenWords(minute: number): string {
  if (minute >= EVENING_FROM) return 'Tonight';
  return minute >= AFTERNOON_FROM ? 'This afternoon' : 'This morning';
}

const SHELTERED_FROM: { readonly [weather in Weather]: string } = {
  clear: 'Weather',
  rain: 'Rain',
  storm: 'Storm',
  heatwave: 'Heat',
};

const movedWords = (news: EventNews): string => {
  const when = whenWords(minuteOf(news.start)).toLowerCase();
  const to = news.venue ? ` moves to ${news.venue}` : ' moves';
  return `${SHELTERED_FROM[news.weather ?? 'rain']}: ${when}'s ${news.label}${to}`;
};

const LINES: { readonly [kind in EventNews['kind']]: (news: EventNews) => string } = {
  announce: (news) => {
    if (news.movedFrom !== undefined) return movedWords(news);
    const minute = minuteOf(news.start);
    return `${whenWords(minute)} ${clockWords(minute)}: ${news.label}${at(news)}`;
  },
  'call-off': (news) => `${news.label}${at(news)} called off: ${reasonWords(news)}`,
  postpone: (news) => `${news.label} moved to tomorrow: ${reasonWords(news)}`,
  tonight: (news) => `${news.label} tonight at ${clockWords(minuteOf(news.start))}`,
};

export const eventNewsLine = (news: EventNews): string => LINES[news.kind](news);

export const refusalWords = (refusal: BookingRefusal): string => REFUSAL_WORDS[refusal];

// Null for a day with no event held, called off or moved, which the report leaves out. The
// fireworks and the moved are told only on a day that had some.
export function tallyWords(tally: EventTally | undefined): string | null {
  const fireworks = tally?.fireworks ?? 0;
  const moved = tally?.postponed ?? 0;
  if (!tally || tally.held + tally.called + moved === 0) return null;
  const guests = tally.audience.toLocaleString('en-US');
  const shows = fireworks > 0 ? ` · ${fireworks} fireworks` : '';
  const later = moved > 0 ? ` · ${moved} moved` : '';
  return `${tally.held} held${shows} · ${guests} guests · ${tally.called} called off${later}`;
}

const GAP_WORDS: { readonly [gap in WelcomeGap]: string } = {
  'no-stage': 'None: no stage',
  off: 'None: switched off',
  'called-off': 'None: called off',
};

// Null for a day nobody arrived on, or from before the welcome, which the report leaves out.
export function welcomeWords(report: DayReport): string | null {
  const { welcome, arrived } = report;
  if (!welcome || arrived === 0) return null;
  if (welcome.welcomed === 0 && welcome.gap !== null) return GAP_WORDS[welcome.gap];
  return `${welcome.welcomed.toLocaleString('en-US')} of ${arrived.toLocaleString('en-US')} new guests`;
}
