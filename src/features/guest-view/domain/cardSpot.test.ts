import { describe, expect, it } from 'vitest';
import { keptOnScreen } from './cardSpot';

const VIEW = { width: 400, height: 300 };
// A card 100 wide and 50 high, standing at 150..250 across and 200..250 down.
const BOX = { left: 150, top: 200, right: 250, bottom: 250 };

describe('keptOnScreen', () => {
  it('moves the card where it is dragged while it fits', () => {
    expect(keptOnScreen({ x: -40, y: -100 }, { x: 0, y: 0 }, BOX, VIEW)).toEqual({
      x: -40,
      y: -100,
    });
  });

  it('stops the card 8 pixels from every edge', () => {
    expect(keptOnScreen({ x: -500, y: -500 }, { x: 0, y: 0 }, BOX, VIEW)).toEqual({
      x: -142,
      y: -192,
    });
    expect(keptOnScreen({ x: 500, y: 500 }, { x: 0, y: 0 }, BOX, VIEW)).toEqual({ x: 142, y: 42 });
  });

  it('measures from where the drag began', () => {
    const moved = { left: 190, top: 200, right: 290, bottom: 250 };
    expect(keptOnScreen({ x: 500, y: 0 }, { x: 40, y: 0 }, moved, VIEW)).toEqual({ x: 142, y: 0 });
  });

  it('keeps the top-left on a screen too small for the card', () => {
    const tiny = { width: 80, height: 40 };
    expect(keptOnScreen({ x: 50, y: 50 }, { x: 0, y: 0 }, BOX, tiny)).toEqual({ x: -142, y: -192 });
  });
});
