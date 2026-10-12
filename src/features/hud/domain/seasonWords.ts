import type { PartyMix } from '../../guests/domain/parties';
import {
  nextPhaseOf,
  PHASE_WORDS,
  SEASON_DAYS,
  type SeasonPhase,
  type SeasonView,
} from '../../sim/domain/season';

// Short enough to sit above the clock.
export function seasonTitle(season: SeasonView): string {
  if (season.state === 'break') return `Before season ${season.number + 1}`;
  if (season.day < 1) return `Season ${season.number} from tomorrow`;
  if (season.phase === 'closing') return `Season ${season.number} closing`;
  return `${PHASE_WORDS[season.phase]} ${season.number}`;
}

// A season opened after the day's check-in starts with the next one.
export function seasonLine(season: SeasonView): string {
  if (season.state === 'break') return `Season ${season.number} is over`;
  if (season.day < 1) return `Season ${season.number} starts tomorrow`;
  if (season.phase === 'closing') return `Season ${season.number} · ${PHASE_WORDS.closing}`;
  return `Season ${season.number} · day ${season.day} of ${SEASON_DAYS} · ${PHASE_WORDS[season.phase]}`;
}

export const PHASE_GUESTS: { readonly [phase in SeasonPhase]: string } = {
  early: 'Few guests, mostly couples and people on their own. Mild, with the odd storm.',
  holidays: 'Families, and more of them than there are beds. Hot, with heatwaves.',
  late: 'Groups of friends and fewer guests, with more storms.',
  closing: 'Everybody checks out today, and the season report follows.',
};

export const MIX_LABELS: { readonly [kind in keyof PartyMix]: string } = {
  family: 'Families',
  couple: 'Couples',
  friends: 'Friends',
  solo: 'On their own',
};

export const shareWords = (share: number): string => `${Math.round(share * 100)} %`;

export const bookingsLine = (demand: number): string =>
  demand === 1 ? 'as usual' : `${demand.toFixed(1)}× the usual`;

const inDaysWords = (days: number): string => (days === 1 ? 'tomorrow' : `in ${days} days`);

export function nextLine(seasonDay: number): string | null {
  const next = nextPhaseOf(seasonDay);
  if (next === null) return null;
  if (next.phase === 'closing') return `The season closes ${inDaysWords(next.inDays)}.`;
  return `${PHASE_WORDS[next.phase]} ${inDaysWords(next.inDays)}.`;
}
