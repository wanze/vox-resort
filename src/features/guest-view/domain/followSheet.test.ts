import { describe, expect, it } from 'vitest';
import { collapsedOnView, swipeOf, SWIPE_PX } from './followSheet';

describe('swipeOf', () => {
  it('opens on a swipe up and shuts on a swipe down', () => {
    expect(swipeOf(0, -SWIPE_PX)).toBe('open');
    expect(swipeOf(4, 40)).toBe('shut');
  });

  it('leaves a tap that wobbles and a sideways drag alone', () => {
    expect(swipeOf(3, -SWIPE_PX + 1)).toBeNull();
    expect(swipeOf(60, -30)).toBeNull();
  });
});

describe('collapsedOnView', () => {
  it('collapses on going into first person', () => {
    expect(collapsedOnView(false, 'third', 'first')).toBe(true);
    expect(collapsedOnView(false, null, 'first')).toBe(true);
  });

  it('keeps what the player chose otherwise', () => {
    expect(collapsedOnView(false, 'first', 'first')).toBe(false);
    expect(collapsedOnView(false, 'first', 'third')).toBe(false);
    expect(collapsedOnView(true, 'first', 'third')).toBe(true);
    expect(collapsedOnView(false, 'third', null)).toBe(false);
  });
});
