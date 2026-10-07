import { DEMAND_GROUPS, type Demand, type DemandGroup } from '../../sim/domain/demand';
import type { StatusView } from '../../../app/showcase';
import { DemandBar } from './DemandBar';
import { DemandPanel } from './DemandPanel';
import { GROUP_NAMES, GROUP_TITLES, LINE_NAMES, pressureWord } from './demandWords';
import { HudDropdown } from './HudDropdown';

export interface DemandMeterProps {
  // null before the first facts are counted, which shows flat bars.
  readonly status: StatusView | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const GROUPS = Object.keys(DEMAND_GROUPS) as readonly DemandGroup[];

const pressureOf = (demand: Demand | null, group: DemandGroup): number =>
  demand ? demand.lines[demand.groups[group]].pressure : 0;

function titleOf(demand: Demand | null): string {
  if (!demand) return 'Demand: not counted yet';
  const lines = GROUPS.map((group) => {
    const line = demand.groups[group];
    return `${GROUP_TITLES[group]}: ${LINE_NAMES[line]}, ${pressureWord(demand.lines[line].pressure)}`;
  });
  return ['Demand', ...lines].join('\n');
}

// The bars are the chip, so the meter reads at a glance; the dropdown says what is behind them.
export function DemandMeter({ status, open, onOpenChange }: DemandMeterProps) {
  const demand = status?.demand ?? null;
  return (
    <HudDropdown
      className="hud-demand-menu"
      open={open}
      onOpenChange={onOpenChange}
      title={titleOf(demand)}
      label={
        <span className="hud-demand">
          {GROUPS.map((group) => (
            <span key={group} className="hud-demand-group">
              <DemandBar pressure={pressureOf(demand, group)} />
              <span className="hud-demand-initial" aria-hidden="true">
                {GROUP_NAMES[group][0]}
              </span>
            </span>
          ))}
        </span>
      }
    >
      <DemandPanel status={status} />
    </HudDropdown>
  );
}
