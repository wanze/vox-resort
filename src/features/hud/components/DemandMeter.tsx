import type { CSSProperties } from 'react';
import { DEMAND_GROUPS, type Demand, type DemandGroup } from '../../sim/domain/demand';
import { GROUP_NAMES, GROUP_TITLES, LINE_NAMES, PRESSURE_LOUD, pressureWord } from './demandWords';

export interface DemandMeterProps {
  // null before the first facts are counted, which shows flat bars.
  readonly demand: Demand | null;
  readonly onOpen: () => void;
}

const GROUPS = Object.keys(DEMAND_GROUPS) as readonly DemandGroup[];

const pressureOf = (demand: Demand | null, group: DemandGroup): number =>
  demand ? demand.lines[demand.groups[group]].pressure : 0;

function toneOf(pressure: number): string {
  if (pressure > PRESSURE_LOUD) return 'loud';
  return pressure > 0 ? 'up' : 'down';
}

// Upright in the bar, across in the window: the same zero-centred scale either way.
export function DemandBar({
  pressure,
  across = false,
}: {
  readonly pressure: number;
  readonly across?: boolean;
}) {
  return (
    <span
      className="hud-demand-bar"
      data-tone={toneOf(pressure)}
      data-across={across || undefined}
      aria-hidden="true"
    >
      <span className="hud-demand-fill" style={{ '--pressure': pressure } as CSSProperties} />
    </span>
  );
}

function titleOf(demand: Demand | null): string {
  if (!demand) return 'Demand: not counted yet';
  const lines = GROUPS.map((group) => {
    const line = demand.groups[group];
    return `${GROUP_TITLES[group]}: ${LINE_NAMES[line]}, ${pressureWord(demand.lines[line].pressure)}`;
  });
  return ['Demand', ...lines].join('\n');
}

function labelOf(demand: Demand | null): string {
  const groups = GROUPS.map(
    (group) => `${GROUP_TITLES[group]} ${pressureWord(pressureOf(demand, group))}`,
  );
  return `Demand: ${groups.join(', ')}`;
}

export function DemandMeter({ demand, onOpen }: DemandMeterProps) {
  return (
    <div className="hud-plate">
      <button
        type="button"
        className="hud-demand"
        title={titleOf(demand)}
        aria-label={labelOf(demand)}
        onClick={onOpen}
      >
        {GROUPS.map((group) => (
          <span key={group} className="hud-demand-group">
            <DemandBar pressure={pressureOf(demand, group)} />
            <span className="hud-demand-initial" aria-hidden="true">
              {GROUP_NAMES[group][0]}
            </span>
          </span>
        ))}
      </button>
    </div>
  );
}
