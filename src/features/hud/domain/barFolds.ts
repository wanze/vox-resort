// Least missed first: the forecast is also in the programme, and the highlight and map legends are
// fixed, so they stay once their pickers have gone to the menu.
export const BAR_FOLDS = ['highlight', 'maps', 'weather', 'tight'] as const;

// A fold is undone only with this much to spare, so a figure ticking over at the edge does not
// flick a chip in and out.
export const UNFOLD_SLACK = 12;

export function foldCount(folded: number, spareWith: (count: number) => number): number {
  for (let count = 0; count < BAR_FOLDS.length; count++) {
    if (spareWith(count) >= (count < folded ? UNFOLD_SLACK : 0)) return count;
  }
  return BAR_FOLDS.length;
}

export const foldsAt = (count: number): string => BAR_FOLDS.slice(0, count).join(' ');
