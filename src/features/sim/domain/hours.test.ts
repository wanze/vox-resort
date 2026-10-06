import { describe, expect, it } from 'vitest';
import { djPlays, openAt, openNow } from './hours';
import { weatherEffect } from './weather';

const HOUR = 60;
const EVENING = { opens: 20 * HOUR, closes: 2 * HOUR };

describe('openAt', () => {
  it('never shuts a venue without hours', () => {
    for (let hour = 0; hour < 24; hour++) expect(openAt(undefined, hour * HOUR)).toBe(true);
  });

  it('opens a window within the day from its opening minute to just before its closing one', () => {
    const lunch = { opens: 11 * HOUR, closes: 15 * HOUR };
    expect(openAt(lunch, 11 * HOUR - 1)).toBe(false);
    expect(openAt(lunch, 11 * HOUR)).toBe(true);
    expect(openAt(lunch, 15 * HOUR - 1)).toBe(true);
    expect(openAt(lunch, 15 * HOUR)).toBe(false);
  });

  it('runs a window past midnight on both sides of it, shut from its closing minute', () => {
    expect(openAt(EVENING, 12 * HOUR)).toBe(false);
    expect(openAt(EVENING, 20 * HOUR - 1)).toBe(false);
    expect(openAt(EVENING, 20 * HOUR)).toBe(true);
    expect(openAt(EVENING, 23 * HOUR + 59)).toBe(true);
    expect(openAt(EVENING, 0)).toBe(true);
    expect(openAt(EVENING, 2 * HOUR - 1)).toBe(true);
    expect(openAt(EVENING, 2 * HOUR)).toBe(false);
  });

  it('reads opening and closing at the same minute as open all day', () => {
    const always = { opens: 9 * HOUR, closes: 9 * HOUR };
    for (let hour = 0; hour < 24; hour++) expect(openAt(always, hour * HOUR)).toBe(true);
  });

  it('wraps a tick from outside the day onto it', () => {
    expect(openAt(EVENING, -HOUR)).toBe(true);
    expect(openAt(EVENING, -12 * HOUR)).toBe(false);
    expect(openAt(EVENING, 3 * 24 * HOUR + 21 * HOUR)).toBe(true);
  });
});

describe('openNow', () => {
  it('shuts an open-air venue in the rain whatever its hours say', () => {
    const rain = weatherEffect('rain');
    expect(openNow({ shelter: 'open' }, rain, 12 * HOUR)).toBe(false);
    expect(openNow({ shelter: 'open', hours: EVENING }, rain, 22 * HOUR)).toBe(false);
    expect(openNow({ shelter: 'covered', hours: EVENING }, rain, 22 * HOUR)).toBe(true);
    expect(openNow({ shelter: 'covered', hours: EVENING }, rain, 12 * HOUR)).toBe(false);
  });
});

describe('djPlays', () => {
  it('plays at a DJ venue while it is open and working, and nowhere else', () => {
    const clear = weatherEffect('clear');
    const club = { dj: true, hours: EVENING };
    expect(djPlays(club, clear, 22 * HOUR, false)).toBe(true);
    expect(djPlays(club, clear, 12 * HOUR, false)).toBe(false);
    expect(djPlays(club, clear, 22 * HOUR, true)).toBe(false);
    expect(djPlays({ hours: EVENING }, clear, 22 * HOUR, false)).toBe(false);
  });
});
