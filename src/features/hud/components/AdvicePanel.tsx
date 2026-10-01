import type { Advice } from '../../sim/domain/advice';
import { isStaffRole, type StaffRole } from '../../sim/domain/staff';
import { adviceKey } from '../domain/news';
import { adviceLabel, adviceMeans, adviceSays } from './adviceWords';
import { StatRow } from './StatRow';
import { roleWord } from './staffWords';

export interface AdvicePanelProps {
  readonly advice: readonly Advice[];
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onHire?: (role: StaffRole) => void;
}

function noteOf(advice: Advice): string | null {
  const means = adviceMeans(advice);
  const where = advice.at ? `tile ${advice.at.tileX}, ${advice.at.tileZ}` : null;
  return [means, where].filter(Boolean).join(' · ') || null;
}

function HireButton({
  advice,
  onHire,
}: {
  readonly advice: Advice;
  readonly onHire: AdvicePanelProps['onHire'];
}) {
  const role = advice.subject;
  if (advice.kind !== 'short-staffed' || !isStaffRole(role) || !onHire) return null;
  return (
    <button
      type="button"
      className="hud-camera-mode hud-advice-show"
      aria-label={`Hire ${roleWord(role, 2)} up to what the plot needs`}
      onClick={() => onHire(role)}
    >
      Hire
    </button>
  );
}

function AdviceRow({
  advice,
  onShowOnPlot,
  onHire,
}: {
  readonly advice: Advice;
  readonly onShowOnPlot: AdvicePanelProps['onShowOnPlot'];
  readonly onHire: AdvicePanelProps['onHire'];
}) {
  const { at } = advice;
  return (
    <StatRow label={adviceLabel(advice.kind)} note={noteOf(advice)}>
      {adviceSays(advice)}
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
      <HireButton advice={advice} onHire={onHire} />
    </StatRow>
  );
}

export function AdvicePanel({ advice, onShowOnPlot, onHire }: AdvicePanelProps) {
  if (advice.length === 0) {
    return <p className="hud-loading">Nothing needs attention.</p>;
  }
  return (
    <dl className="hud-stats hud-advice">
      {advice.map((each) => (
        <AdviceRow
          key={adviceKey(each)}
          advice={each}
          onShowOnPlot={onShowOnPlot}
          onHire={onHire}
        />
      ))}
    </dl>
  );
}
