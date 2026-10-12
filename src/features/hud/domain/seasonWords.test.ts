import { describe, expect, it } from 'vitest';
import { seasonViewOf, firstSeason, SEASON_DAYS } from '../../sim/domain/season';
import { bookingsLine, nextLine, seasonLine, seasonTitle, shareWords } from './seasonWords';

describe('the season in words', () => {
  it('names the phase and the day of a running season', () => {
    const view = seasonViewOf(firstSeason(0), 9);
    expect(seasonTitle(view)).toBe('School holidays 1');
    expect(seasonLine(view)).toBe(`Season 1 · day 10 of ${SEASON_DAYS} · School holidays`);
  });

  it('says a season in its break is over', () => {
    const view = seasonViewOf({ ...firstSeason(0), state: 'break' }, 30);
    expect(seasonTitle(view)).toBe('Before season 2');
    expect(seasonLine(view)).toBe('Season 1 is over');
  });

  it('counts the days to the next phase, and has none after the closing day', () => {
    expect(nextLine(7)).toBe('School holidays tomorrow.');
    expect(nextLine(SEASON_DAYS)).toBe('The season closes tomorrow.');
    expect(nextLine(SEASON_DAYS + 1)).toBeNull();
  });

  it('gives shares and bookings in plain numbers', () => {
    expect(shareWords(0.456)).toBe('46 %');
    expect(bookingsLine(1)).toBe('as usual');
    expect(bookingsLine(1.5)).toBe('1.5× the usual');
  });
});
