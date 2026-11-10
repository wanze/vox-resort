import type { Advice } from '../../sim/domain/advice';
import type { PageId } from '../domain/windowLayout';
import { adviceFixedIn } from './adviceWords';
import { pageTitle } from './windowNames';

// Named after the page it opens, so the button says where the fix is made.
export function FixButton({
  advice,
  fallback,
  onOpenPage,
}: {
  readonly advice: Advice;
  readonly fallback?: PageId;
  readonly onOpenPage: (page: PageId) => void;
}) {
  const page = adviceFixedIn(advice.kind) ?? fallback;
  if (!page) return null;
  return (
    <button type="button" className="ui-button hud-advice-show" onClick={() => onOpenPage(page)}>
      {pageTitle(page)}
    </button>
  );
}
