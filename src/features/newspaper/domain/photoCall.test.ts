import { describe, expect, it } from 'vitest';
import { closingDayOf, firstSeason, lastNightOf } from '../../sim/domain/season';
import { PHOTO_CALL_HOUR, photoCallDue } from './photoCall';

const SEASON = { ...firstSeason(10), number: 3 };
const LAST = lastNightOf(SEASON);

describe('the call for a front-page photo', () => {
  it('comes on the last night from the evening on', () => {
    expect(photoCallDue(SEASON, LAST, PHOTO_CALL_HOUR, null)).toBe(true);
    expect(photoCallDue(SEASON, LAST, 21, null)).toBe(true);
    expect(photoCallDue(SEASON, LAST, PHOTO_CALL_HOUR - 1, null)).toBe(false);
  });

  it('never comes the night before, on the closing day or in a break', () => {
    expect(photoCallDue(SEASON, LAST - 1, 20, null)).toBe(false);
    expect(photoCallDue(SEASON, closingDayOf(SEASON), 20, null)).toBe(false);
    expect(photoCallDue({ ...SEASON, state: 'closing' }, LAST, 20, null)).toBe(false);
    expect(photoCallDue({ ...SEASON, state: 'break' }, LAST, 20, null)).toBe(false);
    expect(photoCallDue(null, LAST, 20, null)).toBe(false);
  });

  it('comes once a season: a photo kept for it answers the call', () => {
    expect(photoCallDue(SEASON, LAST, 20, 3)).toBe(false);
    expect(photoCallDue(SEASON, LAST, 20, 2)).toBe(true);
  });
});
