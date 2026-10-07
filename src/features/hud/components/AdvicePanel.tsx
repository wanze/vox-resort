import type { Advice } from '../../sim/domain/advice';
import { adviceKey } from '../domain/news';
import { adviceLabel, adviceSays } from './adviceWords';
import { HireButton, type HireControls } from './HireButton';

export interface AdvicePanelProps {
  readonly advice: readonly Advice[];
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly hire?: HireControls;
}

function AdviceRow({
  advice,
  onShowOnPlot,
  hire,
}: {
  readonly advice: Advice;
  readonly onShowOnPlot: AdvicePanelProps['onShowOnPlot'];
  readonly hire: AdvicePanelProps['hire'];
}) {
  const { at } = advice;
  return (
    <li className="hud-advice-row">
      <span className="hud-advice-subject">{adviceLabel(advice.kind)}</span>
      <span>{adviceSays(advice)}</span>
      <span className="hud-advice-actions">
        {at ? (
          <button
            type="button"
            className="hud-camera-mode hud-advice-show"
            aria-label={`Show ${advice.subject} at tile ${at.tileX}, ${at.tileZ}`}
            onClick={() => onShowOnPlot(at)}
          >
            Show
          </button>
        ) : null}
        <HireButton advice={advice} hire={hire} />
      </span>
    </li>
  );
}

export function AdvicePanel({ advice, onShowOnPlot, hire }: AdvicePanelProps) {
  if (advice.length === 0) {
    return <p className="hud-loading">Nothing needs attention.</p>;
  }
  return (
    <ul className="hud-advice-list">
      {advice.map((each) => (
        <AdviceRow key={adviceKey(each)} advice={each} onShowOnPlot={onShowOnPlot} hire={hire} />
      ))}
    </ul>
  );
}
