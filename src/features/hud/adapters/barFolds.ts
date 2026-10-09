import { foldCount, foldsAt } from '../domain/barFolds';

// What grows with the resort. No fold changes their size, so watching them rather than the groups
// the folds resize cannot set the observer looping.
const FIGURES = '.hud-readout-value, .hud-time-clock';

// Each count is laid out at the bar's natural width and the fold settled before the frame is
// painted, so an overflowing or half-folded bar never shows.
export function watchBarFolds(bar: HTMLElement): () => void {
  let folded = 0;
  const naturalWidth = (count: number): number => {
    bar.dataset['fold'] = foldsAt(count);
    return bar.getBoundingClientRect().width;
  };
  const refold = (): void => {
    const room = bar.getBoundingClientRect().width;
    // Hidden in photo mode, with no room to judge by.
    if (room === 0) return;
    bar.toggleAttribute('data-measuring', true);
    folded = foldCount(folded, (count) => room - naturalWidth(count));
    bar.toggleAttribute('data-measuring', false);
    bar.dataset['fold'] = foldsAt(folded);
  };

  const sizes = new ResizeObserver(refold);
  const watch = (): void => {
    sizes.disconnect();
    sizes.observe(bar);
    for (const figure of bar.querySelectorAll(FIGURES)) sizes.observe(figure);
  };
  // A readout mounting or a trend arrow appearing. The clock's text is rewritten every game minute
  // and its size is already watched, so that alone is passed over.
  const inFigure = (record: MutationRecord): boolean =>
    record.target instanceof Element && record.target.closest(FIGURES) !== null;
  const structure = new MutationObserver((records) => {
    if (!records.every(inFigure)) watch();
  });
  structure.observe(bar, { childList: true, subtree: true });
  watch();
  return () => {
    sizes.disconnect();
    structure.disconnect();
    bar.removeAttribute('data-fold');
  };
}
