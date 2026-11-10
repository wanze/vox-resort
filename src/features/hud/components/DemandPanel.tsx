import type { CSSProperties } from 'react';
import { OutOf } from '../../../shared/components/OutOf';
import {
  COMFORTABLE,
  DEMAND_GROUPS,
  type Demand,
  type DemandGroup,
  type Pressure,
} from '../../sim/domain/demand';
import { LINE_NAMES, pressureBand, pressureNote, pressureWord, PRESSURE_LOUD } from './demandWords';
import type { StatusView } from '../domain/views';
import { PanelSummary } from '../../../shared/components/PanelSummary';
import { demandFigures } from '../domain/panelFigures';

export interface DemandPanelProps {
  readonly status: StatusView | null;
}

const GROUPS = Object.keys(DEMAND_GROUPS) as readonly DemandGroup[];

function DemandSummary({ demand }: { readonly demand: Demand }) {
  const { short, loud, most } = demandFigures(demand, PRESSURE_LOUD);
  return (
    <PanelSummary
      figures={[
        { label: 'Short', value: short, tone: short > 0 && loud ? 'bad' : undefined },
        { label: 'Most needed', value: most ? LINE_NAMES[most] : 'nothing' },
      ]}
    />
  );
}

// One grid for every group, so the bars line up down the whole window.
// How full the line got at its busiest, with a tick where enough room ends: past it, build.
function FullnessBar({ pressure }: { readonly pressure: Pressure }) {
  const full = pressure.places > 0 ? Math.min(pressure.used / pressure.places, 1) : 1;
  const style = { '--full': full, '--comfort': COMFORTABLE } as CSSProperties;
  return (
    <span className="ui-meter hud-demand-full" style={style} aria-hidden="true">
      <span className="hud-demand-full-fill" />
    </span>
  );
}

const LINES = GROUPS.flatMap((group) => DEMAND_GROUPS[group]);

export function DemandPanel({ status }: DemandPanelProps) {
  if (!status?.demand) return <p className="hud-rating-note">Nothing counted yet.</p>;
  const { demand } = status;
  return (
    <>
      <DemandSummary demand={demand} />
      <div className="hud-demand-grid">
        {LINES.map((line) => {
          const pressure = demand.lines[line];
          const word = pressureWord(pressure.pressure);
          return (
            <div
              key={line}
              className="hud-demand-row"
              data-band={pressureBand(pressure.pressure)}
              title={`${word}: ${pressureNote(line, pressure)}`}
            >
              <span className="hud-demand-name">{LINE_NAMES[line]}</span>
              <FullnessBar pressure={pressure} />
              <span className="hud-demand-figure">
                <OutOf value={pressure.used} total={pressure.places} />
              </span>
              <span className="hud-demand-word">{word}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
