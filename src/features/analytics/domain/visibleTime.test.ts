import { describe, expect, it } from 'vitest';
import { drained, hidden, shown, visibleFrom } from './visibleTime';

describe('visibleTime', () => {
  it('counts only the time the page was seen', () => {
    let time = visibleFrom(0, true);
    time = hidden(time, 1_000);
    time = shown(time, 5_000);
    time = hidden(time, 5_500);
    expect(drained(time)[0]).toBe(1_500);
  });

  it('starts at nothing for a page opened in the background', () => {
    const time = hidden(visibleFrom(0, false), 2_000);
    expect(drained(time)[0]).toBe(0);
  });

  it('counts a second hide only once', () => {
    const time = hidden(hidden(visibleFrom(0, true), 1_000), 3_000);
    expect(drained(time)[0]).toBe(1_000);
  });

  it('starts again from nothing once drained', () => {
    const [, rest] = drained(hidden(visibleFrom(0, true), 1_000));
    expect(drained(hidden(shown(rest, 2_000), 2_500))[0]).toBe(500);
  });
});
