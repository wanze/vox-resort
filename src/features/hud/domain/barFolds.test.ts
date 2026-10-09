import { describe, expect, it } from 'vitest';
import { BAR_FOLDS, foldCount, foldsAt, UNFOLD_SLACK } from './barFolds';

const saving = (base: number) => (count: number) => base + count * 40;

describe('foldCount', () => {
  it('folds nothing while the bar fits', () => {
    expect(foldCount(0, saving(0))).toBe(0);
  });

  it('folds the fewest that make the bar fit', () => {
    expect(foldCount(0, saving(-50))).toBe(2);
  });

  it('folds everything when even that is not enough', () => {
    expect(foldCount(0, saving(-1000))).toBe(BAR_FOLDS.length);
  });

  it('keeps a fold until undoing it leaves room to spare', () => {
    expect(foldCount(1, saving(UNFOLD_SLACK - 1))).toBe(1);
    expect(foldCount(1, saving(UNFOLD_SLACK))).toBe(0);
  });

  it('keeps a fold that leaves the bar exactly full', () => {
    expect(foldCount(1, saving(-40))).toBe(1);
  });
});

describe('foldsAt', () => {
  it('names the folds made, least missed first', () => {
    expect(foldsAt(0)).toBe('');
    expect(foldsAt(2)).toBe('highlight maps');
  });
});
