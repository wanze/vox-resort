import { describe, expect, it } from 'vitest';
import {
  createDay,
  createThoughts,
  forgetStay,
  latestOf,
  loudest,
  REPEAT_TICKS,
  stayCount,
  surroundingsThought,
  tallyInto,
  think,
  visitThought,
  worstOf,
} from './thoughts';

describe('a guest thinking', () => {
  it('keeps the first thought and hands it back as the latest', () => {
    const thoughts = createThoughts(3);
    expect(latestOf(thoughts, 1)).toBeNull();
    expect(think(thoughts, 1, 'queue-too-long', 'Bakery', 10)).toBe(true);
    expect(latestOf(thoughts, 1)).toEqual({ kind: 'queue-too-long', subject: 'Bakery' });
    expect(latestOf(thoughts, 0)).toBeNull();
  });

  it('ignores the same thought again within the window, and does not count it', () => {
    const thoughts = createThoughts(1);
    think(thoughts, 0, 'no-bed', null, 0);
    for (let tick = 1; tick < REPEAT_TICKS; tick++) {
      expect(think(thoughts, 0, 'no-bed', null, tick)).toBe(false);
    }
    expect(stayCount(thoughts, 0, 'no-bed')).toBe(1);
  });

  it('keeps the window per kind, so another thought in between is no reset', () => {
    const thoughts = createThoughts(1);
    think(thoughts, 0, 'no-bed', null, 0);
    expect(think(thoughts, 0, 'nothing-for', 'hunger', 1)).toBe(true);
    expect(think(thoughts, 0, 'no-bed', null, 2)).toBe(false);
    expect(stayCount(thoughts, 0, 'no-bed')).toBe(1);
  });

  it('counts the same kind about somewhere else as a new thought', () => {
    const thoughts = createThoughts(1);
    think(thoughts, 0, 'closed', 'Pool', 0);
    expect(think(thoughts, 0, 'closed', 'Beach', 1)).toBe(true);
    expect(stayCount(thoughts, 0, 'closed')).toBe(2);
    expect(latestOf(thoughts, 0)?.subject).toBe('Beach');
  });

  it('counts a repeat once the window has passed', () => {
    const thoughts = createThoughts(1);
    think(thoughts, 0, 'filthy', 'Bar', 5);
    expect(think(thoughts, 0, 'filthy', 'Bar', 5 + REPEAT_TICKS)).toBe(true);
    expect(stayCount(thoughts, 0, 'filthy')).toBe(2);
  });

  it('counts a stay per kind', () => {
    const thoughts = createThoughts(1);
    think(thoughts, 0, 'lovely', null, 0);
    think(thoughts, 0, 'lovely', null, REPEAT_TICKS);
    think(thoughts, 0, 'littered', null, 0);
    expect(stayCount(thoughts, 0, 'lovely')).toBe(2);
    expect(stayCount(thoughts, 0, 'littered')).toBe(1);
    expect(stayCount(thoughts, 0, 'enjoyed')).toBe(0);
  });

  it('remembers what the most repeated complaint was about, and never a praise', () => {
    const thoughts = createThoughts(1);
    think(thoughts, 0, 'closed', 'Pool', 0);
    expect(worstOf(thoughts, 0)).toEqual({ kind: 'closed', subject: 'Pool' });
    think(thoughts, 0, 'queue-too-long', 'Bar', 1);
    expect(worstOf(thoughts, 0), 'a tie moved the complaint').toEqual({
      kind: 'closed',
      subject: 'Pool',
    });
    think(thoughts, 0, 'queue-too-long', 'Snack Bar', 2);
    expect(worstOf(thoughts, 0)).toEqual({ kind: 'queue-too-long', subject: 'Snack Bar' });
    for (let tick = 0; tick < 5; tick++) think(thoughts, 0, 'enjoyed', 'Pool', tick * REPEAT_TICKS);
    expect(worstOf(thoughts, 0)?.kind).toBe('queue-too-long');
  });

  it('forgets a stay for the next guest in the same body', () => {
    const thoughts = createThoughts(2);
    think(thoughts, 1, 'closed', 'Pool', 0);
    think(thoughts, 0, 'closed', 'Pool', 0);
    forgetStay(thoughts, 1);
    expect(latestOf(thoughts, 1)).toBeNull();
    expect(worstOf(thoughts, 1)).toBeNull();
    expect(stayCount(thoughts, 1, 'closed')).toBe(0);
    expect(think(thoughts, 1, 'closed', 'Pool', 1), 'the old stay still counted').toBe(true);
    expect(stayCount(thoughts, 0, 'closed')).toBe(1);
  });

  it('saturates a stay count rather than wrapping it', () => {
    const thoughts = createThoughts(1);
    for (let time = 0; time < 65_540; time++) {
      think(thoughts, 0, 'lovely', null, time * REPEAT_TICKS);
    }
    expect(stayCount(thoughts, 0, 'lovely')).toBe(65_535);
  });

  it('turns away a body the memory was not sized for', () => {
    const thoughts = createThoughts(1);
    expect(think(thoughts, 1, 'closed', 'Pool', 0)).toBe(false);
    expect(think(thoughts, -1, 'closed', 'Pool', 0)).toBe(false);
  });
});

describe('what a guest notices', () => {
  it('finds a venue well past needing a clean filthy, whatever it is', () => {
    expect(visitThought('food', 0.3)).toBe('filthy');
    expect(visitThought('activity', 0.39)).toBe('filthy');
    expect(visitThought('food', 0.5), 'merely due a clean').toBeNull();
  });

  it('enjoys a clean activity, and says nothing about a clean meal', () => {
    expect(visitThought('activity', 0.8)).toBe('enjoyed');
    expect(visitThought('activity', 0.79)).toBeNull();
    expect(visitThought('food', 1)).toBeNull();
  });

  it('hears only the two ends of the surroundings', () => {
    expect(surroundingsThought(0.7)).toBe('lovely');
    expect(surroundingsThought(0.6)).toBeNull();
    expect(surroundingsThought(0)).toBeNull();
    expect(surroundingsThought(-0.31)).toBe('littered');
  });
});

describe("the day's loudest thoughts", () => {
  it('ranks by count, then by kind, then by subject, so two runs agree', () => {
    const day = createDay();
    const hear = (kind: Parameters<typeof tallyInto>[1], subject: string | null, times: number) => {
      for (let time = 0; time < times; time++) tallyInto(day, kind, subject);
    };
    hear('filthy', 'Bar', 2);
    hear('closed', 'Pool', 2);
    hear('closed', 'Beach', 2);
    hear('no-bed', null, 5);
    hear('lovely', null, 1);
    expect(loudest(day, 4)).toEqual([
      { kind: 'no-bed', subject: null, count: 5 },
      { kind: 'closed', subject: 'Beach', count: 2 },
      { kind: 'closed', subject: 'Pool', count: 2 },
      { kind: 'filthy', subject: 'Bar', count: 2 },
    ]);
  });

  it('shows nothing for a quiet day', () => {
    expect(loudest(createDay(), 5)).toEqual([]);
  });
});
