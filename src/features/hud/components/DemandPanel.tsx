import { Fragment } from 'react';
import { OutOf } from '../../../shared/components/OutOf';
import { DEMAND_GROUPS, type DemandGroup } from '../../sim/domain/demand';
import { DemandBar } from './DemandBar';
import {
  GROUP_TITLES,
  LINE_NAMES,
  pressureNote,
  pressureWord,
  turnedAwayShare,
} from './demandWords';
import type { StatusView } from '../domain/views';

export interface DemandPanelProps {
  readonly status: StatusView | null;
}

const GROUPS = Object.keys(DEMAND_GROUPS) as readonly DemandGroup[];

// One grid for every group, so the bars line up down the whole window.
export function DemandPanel({ status }: DemandPanelProps) {
  if (!status?.demand) return <p className="hud-rating-note">Nothing counted yet.</p>;
  const { demand, present } = status;
  return (
    <div className="hud-demand-grid">
      <span />
      <span className="hud-demand-head hud-demand-scale">
        <span>Enough</span>
        <span>Build</span>
      </span>
      <span className="hud-demand-head">Want / room</span>
      <span className="hud-demand-head">Away</span>
      {GROUPS.map((group) => (
        <Fragment key={group}>
          <h3 className="hud-report-heading hud-demand-group-heading">{GROUP_TITLES[group]}</h3>
          {DEMAND_GROUPS[group].map((line) => {
            const pressure = demand.lines[line];
            return (
              <div
                key={line}
                className="hud-demand-row"
                title={`${pressureWord(pressure.pressure)}: ${pressureNote(line, pressure, present)}`}
              >
                {/* Inside the name: the row is a run of grid cells, and a sibling would be one more. */}
                <span className="hud-demand-name">
                  {LINE_NAMES[line]}
                  <span className="ui-visually-hidden">{`: ${pressureWord(pressure.pressure)}`}</span>
                </span>
                <DemandBar pressure={pressure.pressure} across />
                <span className="hud-demand-figure">
                  <OutOf value={pressure.wanting} total={pressure.places} />
                </span>
                <span className="hud-demand-figure">{turnedAwayShare(pressure)}</span>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
