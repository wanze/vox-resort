import { useState } from 'react';
import { HelpTip } from '../../../shared/components/HelpTip';
import { Meter } from '../../../shared/components/Meter';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { percentOf } from '../../../shared/components/StatRow';
import type { UpkeepRow } from '../../resort-sim/domain/ageing';
import { bandOf, isShabby, type ConditionBand } from '../../sim/domain/condition';
import {
  filterUpkeep,
  keptFilter,
  upkeepChoices,
  type UpkeepChoice,
  type UpkeepFilter,
} from '../domain/upkeepFilter';
import { PanelSummary } from './PanelSummary';
import { RenovateAction, worksBrief, type RenovationControls } from './RenovateAction';
import { SettingGroup } from './SettingRows';
import { SIGN_ICONS } from './signIcons';

type Tile = { readonly tileX: number; readonly tileZ: number };

export interface UpkeepPanelProps {
  readonly rows: readonly UpkeepRow[];
  readonly controls: RenovationControls;
  readonly onSelect: (at: Tile) => void;
}

const BANDS: { readonly [band in ConditionBand]: string } = {
  good: 'Good',
  worn: 'Worn',
  shabby: 'Shabby',
  'run-down': 'Run-down',
};

const noteOf = (row: UpkeepRow): string =>
  row.works ? worksBrief(row.works) : BANDS[bandOf(row.level)];

function UpkeepLine({
  row,
  controls,
  onSelect,
}: {
  readonly row: UpkeepRow;
  readonly controls: RenovationControls;
  readonly onSelect: (at: Tile) => void;
}) {
  return (
    <div className="hud-settings-row">
      <dt className="hud-settings-name">
        <span className="hud-settings-icon">
          <PixelIcon name={row.sign ? SIGN_ICONS[row.sign] : 'lodging'} />
        </span>
        <span className="hud-settings-label">
          <button
            type="button"
            className="hud-upkeep-name"
            title={`Show ${row.label}`}
            onClick={() => onSelect(row.at)}
          >
            {row.label}
          </button>
          <Meter level={row.level} small />
        </span>
      </dt>
      <dd className="hud-settings-value" data-tone={isShabby(row.level) ? 'bad' : undefined}>
        {percentOf(row.level)}
      </dd>
      <dd className="hud-settings-note hud-upkeep-note">{noteOf(row)}</dd>
      <dd className="hud-upkeep-action">
        <RenovateAction
          target={row}
          controls={controls}
          className="ui-button ui-button-compact"
          brief
        />
      </dd>
    </div>
  );
}

function UpkeepHelp() {
  return (
    <HelpTip label="How buildings wear">
      <p>
        Every lodging and venue wears a little each day, and faster the busier it is. A worn
        building earns less, draws fewer guests, breaks down more often and costs more to keep up.
      </p>
      <p>
        Renovating makes it as good as new. A venue shuts for six hours. A lodging with guests in it
        takes no new ones, and is renovated once the last of them has left.
      </p>
    </HelpTip>
  );
}

function KindSelect({
  value,
  choices,
  onPick,
}: {
  readonly value: UpkeepFilter;
  readonly choices: readonly UpkeepChoice[];
  readonly onPick: (filter: UpkeepFilter) => void;
}) {
  return (
    <select
      className="ui-select hud-upkeep-filter"
      aria-label="Which buildings"
      value={value ?? ''}
      onChange={(event) => onPick(event.target.value || null)}
    >
      <option value="">All buildings</option>
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

// The summary counts the whole resort, whatever the list is narrowed to.
export function UpkeepPanel({ rows, controls, onSelect }: UpkeepPanelProps) {
  const [asked, setFilter] = useState<UpkeepFilter>(null);
  if (rows.length === 0) return <p className="ui-loading">Nothing on the plot wears yet.</p>;
  const choices = upkeepChoices(rows);
  const filter = keptFilter(asked, choices);
  const shabby = rows.filter((row) => isShabby(row.level)).length;
  const underWay = rows.filter((row) => row.works !== null).length;
  return (
    <div className="hud-settings">
      <PanelSummary
        figures={[
          { label: 'Shabby', value: String(shabby), tone: shabby > 0 ? 'bad' : undefined },
          { label: 'Renovating', value: String(underWay) },
        ]}
        help={<UpkeepHelp />}
      />
      <KindSelect value={filter} choices={choices} onPick={setFilter} />
      <SettingGroup title="Most worn first">
        {filterUpkeep(rows, filter).map((row) => (
          <UpkeepLine key={row.key} row={row} controls={controls} onSelect={onSelect} />
        ))}
      </SettingGroup>
    </div>
  );
}
