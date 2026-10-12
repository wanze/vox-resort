// Least missed first: the forecast is also in the programme, the guests in their window, and the
// legends stay once their pickers go to the menu. The meter only shrinks to its most pressing bar,
// so it goes before the maps, which the menu alone could open then.
export const BAR_FOLDS = ['highlight', 'weather', 'demand', 'maps', 'guests', 'tight'] as const;

export type BarFold = (typeof BAR_FOLDS)[number];

// A fold is undone only with this much to spare, so a figure ticking over at the edge does not
// flick a chip in and out.
export const UNFOLD_SLACK = 12;

export function settleFolds(
  previous: readonly BarFold[],
  spareWith: (folds: readonly BarFold[]) => number,
): readonly BarFold[] {
  const fits = (folds: readonly BarFold[]): boolean => {
    const undoes = previous.some((fold) => !folds.includes(fold));
    return spareWith(folds) >= (undoes ? UNFOLD_SLACK : 0);
  };
  let count = 0;
  while (count < BAR_FOLDS.length && !fits(BAR_FOLDS.slice(0, count))) count++;
  // The last fold can free more than it needed to, and the room goes back to the earlier ones,
  // most missed first. It stops at the first that does not fit, so a narrow chip never comes back
  // in place of one the player misses more.
  let folds: readonly BarFold[] = BAR_FOLDS.slice(0, count);
  for (const fold of folds.slice(0, -1).toReversed()) {
    const without = folds.filter((each) => each !== fold);
    if (!fits(without)) break;
    folds = without;
  }
  return folds;
}
