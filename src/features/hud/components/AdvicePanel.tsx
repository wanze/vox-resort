import { HelpTip } from '../../../shared/components/HelpTip';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { Advice } from '../../sim/domain/advice';
import { adviceTiers, type AdviceTier, type TierGroup } from '../domain/adviceTiers';
import { adviceKey } from '../domain/news';
import { adviceIcon, adviceSays } from './adviceWords';
import { HireButton, type HireControls } from './HireButton';
import { PanelSummary } from './PanelSummary';

export interface AdvicePanelProps {
  readonly advice: readonly Advice[];
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly hire?: HireControls;
}

const TIER_NAMES: { readonly [tier in AdviceTier]: string } = {
  urgent: 'Urgent',
  warning: 'Fix soon',
  note: 'Worth a look',
};

function AdviceRow({
  advice,
  tier,
  onShowOnPlot,
  hire,
}: {
  readonly advice: Advice;
  readonly tier: AdviceTier;
  readonly onShowOnPlot: AdvicePanelProps['onShowOnPlot'];
  readonly hire: AdvicePanelProps['hire'];
}) {
  const { at } = advice;
  return (
    <li className="hud-problem" data-severity={tier}>
      <span className="hud-problem-icon">
        <PixelIcon name={adviceIcon(advice.kind)} />
      </span>
      <span className="hud-problem-body">{adviceSays(advice)}</span>
      <span className="hud-problem-actions">
        {at ? (
          <button
            type="button"
            className="ui-button hud-advice-show"
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

function AdviceGroup({
  group,
  onShowOnPlot,
  hire,
}: {
  readonly group: TierGroup;
  readonly onShowOnPlot: AdvicePanelProps['onShowOnPlot'];
  readonly hire: AdvicePanelProps['hire'];
}) {
  return (
    <section className="hud-advice-group" aria-label={TIER_NAMES[group.tier]}>
      <h3 className="hud-report-heading">{TIER_NAMES[group.tier]}</h3>
      <ul className="hud-problems">
        {group.advice.map((each) => (
          <AdviceRow
            key={adviceKey(each)}
            advice={each}
            tier={group.tier}
            onShowOnPlot={onShowOnPlot}
            hire={hire}
          />
        ))}
      </ul>
    </section>
  );
}

function AdviceHelp() {
  return (
    <HelpTip label="How advice works">
      <p>What needs fixing right now, refreshed every resort hour.</p>
      <p>Urgent keeps guests away or hurts them; fix soon wears them down; notes are ideas.</p>
    </HelpTip>
  );
}

export function AdvicePanel({ advice, onShowOnPlot, hire }: AdvicePanelProps) {
  if (advice.length === 0) {
    return <p className="ui-loading">Nothing needs attention.</p>;
  }
  const groups = adviceTiers(advice);
  const countOf = (tier: AdviceTier): number =>
    groups.find((group) => group.tier === tier)?.advice.length ?? 0;
  return (
    <div className="hud-advice-tiers">
      <PanelSummary
        figures={[
          {
            label: 'Urgent',
            value: String(countOf('urgent')),
            tone: countOf('urgent') > 0 ? 'bad' : undefined,
          },
          { label: 'Fix soon', value: String(countOf('warning')) },
          { label: 'Notes', value: String(countOf('note')) },
        ]}
        help={<AdviceHelp />}
      />
      {groups.map((group) => (
        <AdviceGroup key={group.tier} group={group} onShowOnPlot={onShowOnPlot} hire={hire} />
      ))}
    </div>
  );
}
