import { describe, expect, it } from 'vitest';
import { BAR_FOLDS, settleFolds, UNFOLD_SLACK, type BarFold } from './barFolds';

const WIDTHS: Record<BarFold, number> = {
  highlight: 40,
  weather: 20,
  demand: 120,
  maps: 40,
  guests: 40,
  tight: 30,
};

const saving =
  (base: number) =>
  (folds: readonly BarFold[]): number =>
    folds.reduce((spare, fold) => spare + WIDTHS[fold], base);

describe('settleFolds', () => {
  it('folds nothing while the bar fits', () => {
    expect(settleFolds([], saving(0))).toEqual([]);
  });

  it('folds the fewest that make the bar fit, least missed first', () => {
    expect(settleFolds([], saving(-50))).toEqual(['highlight', 'weather']);
  });

  it('folds everything when even that is not enough', () => {
    expect(settleFolds([], saving(-1000))).toEqual(BAR_FOLDS);
  });

  it('gives the room the last fold frees back to the earlier ones, most missed first', () => {
    expect(settleFolds([], saving(-150))).toEqual(['highlight', 'demand']);
  });

  it('never gives a narrow fold back while a more missed one stays folded', () => {
    expect(settleFolds([], saving(-200))).toEqual(['highlight', 'weather', 'demand', 'maps']);
  });

  it('keeps a fold until undoing it leaves room to spare', () => {
    expect(settleFolds(['highlight'], saving(UNFOLD_SLACK - 1))).toEqual(['highlight']);
    expect(settleFolds(['highlight'], saving(UNFOLD_SLACK))).toEqual([]);
  });

  it('keeps a fold that leaves the bar exactly full', () => {
    expect(settleFolds(['highlight'], saving(-40))).toEqual(['highlight']);
  });
});
