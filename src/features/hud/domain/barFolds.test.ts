import { describe, expect, it } from 'vitest';
import { BAR_FOLDS, settleFolds, UNFOLD_SLACK, type BarFold } from './barFolds';

const WIDTHS: Record<BarFold, number> = {
  weather: 40,
  demand: 20,
  highlight: 120,
  guests: 40,
  maps: 40,
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
    expect(settleFolds([], saving(-50))).toEqual(['weather', 'demand']);
  });

  it('folds everything when even that is not enough', () => {
    expect(settleFolds([], saving(-1000))).toEqual(BAR_FOLDS);
  });

  it('gives the room the last fold frees back to the earlier ones, most missed first', () => {
    expect(settleFolds([], saving(-150))).toEqual(['weather', 'highlight']);
  });

  it('never gives a narrow fold back while a more missed one stays folded', () => {
    expect(settleFolds([], saving(-200))).toEqual(['weather', 'demand', 'highlight', 'guests']);
  });

  it('keeps a fold until undoing it leaves room to spare', () => {
    expect(settleFolds(['weather'], saving(UNFOLD_SLACK - 1))).toEqual(['weather']);
    expect(settleFolds(['weather'], saving(UNFOLD_SLACK))).toEqual([]);
  });

  it('keeps a fold that leaves the bar exactly full', () => {
    expect(settleFolds(['weather'], saving(-40))).toEqual(['weather']);
  });
});
