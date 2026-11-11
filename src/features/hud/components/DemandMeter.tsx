import { DEMAND_GROUPS, type Demand, type DemandGroup } from '../../sim/domain/demand';
import { DemandBar } from './DemandBar';
import { DemandPanel } from './DemandPanel';
import { GROUP_ICONS, GROUP_TITLES, LINE_NAMES, pressureWord } from './demandWords';
import { DropdownPopover } from '../../../shared/components/Dropdown';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { StatusView } from '../domain/views';

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

const mostPressing = (demand: Demand | null): number =>
  Math.max(...GROUPS.map((group) => pressureOf(demand, group)));

// The bars are the key, so the meter reads at a glance; the dropdown says what is behind them.
export function DemandMeter({ status, open, onOpenChange }: DemandMeterProps) {
  const demand = status?.demand ?? null;
  return (
    <DropdownPopover
      name="Demand"
      className="hud-demand-menu"
      open={open}
      onOpenChange={onOpenChange}
      title={titleOf(demand)}
      label={
        <span className="hud-demand">
          {GROUPS.map((group) => (
            <span key={group} className="hud-demand-group">
              <PixelIcon name={GROUP_ICONS[group]} scale={1} />
              <DemandBar pressure={pressureOf(demand, group)} />
            </span>
          ))}
          {/* Shown in place of the four once the strip folds the meter. */}
          <span className="hud-demand-most">
            <DemandBar pressure={mostPressing(demand)} />
          </span>
        </span>
      }
    >
      <DemandPanel status={status} />
    </DropdownPopover>
  );
}
