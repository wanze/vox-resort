import { useState } from 'react';
import { Cost } from '../shared/components/Cost';
import { HelpTip } from '../shared/components/HelpTip';
import { MenuOption } from '../shared/components/MenuOption';
import { Meter } from '../shared/components/Meter';
import { OptionHost } from '../shared/components/optionHost';
import { OutOf } from '../shared/components/OutOf';
import { PixelIcon } from '../shared/components/PixelIcon';
import { Receipt, ReceiptLines } from '../shared/components/Receipt';
import { LevelRow, StatRow } from '../shared/components/StatRow';
import { Stepper } from '../shared/components/Stepper';
import { Tabs } from '../shared/components/Tabs';
import type { IconName } from '../shared/components/pixelIcons';
import { PanelSummary } from '../features/hud/components/PanelSummary';
import { SAMPLE_TILL } from './styleguideSamples';

const noop = (): void => undefined;

function Specimen({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <figure className="styleguide-specimen-box">
      <figcaption className="ui-label">{title}</figcaption>
      <div className="styleguide-specimen-body">{children}</div>
    </figure>
  );
}

export function Buttons() {
  const [pressed, setPressed] = useState(false);
  return (
    <div className="styleguide-specimens">
      <Specimen title="ui-button">
        <button type="button" className="ui-button">
          Button
        </button>
        <button
          type="button"
          className="ui-button"
          aria-pressed={pressed}
          onClick={() => setPressed(!pressed)}
        >
          Toggle {pressed ? 'on' : 'off'}
        </button>
        <button type="button" className="ui-button" disabled>
          Disabled
        </button>
      </Specimen>
      <Specimen title="ui-button-primary · secondary · compact">
        <button type="button" className="ui-button-primary">
          Primary
        </button>
        <button type="button" className="ui-button-secondary">
          Secondary
        </button>
        <button type="button" className="ui-button ui-button-compact">
          Compact
        </button>
      </Specimen>
      <Specimen title="ui-button-tall">
        <button type="button" className="ui-button-primary ui-button-tall">
          Start the season
        </button>
      </Specimen>
      <Specimen title="ui-button-large">
        <button type="button" className="ui-button-large ui-button-large--primary">
          Take photo
        </button>
        <button type="button" className="ui-button-large">
          Skip
        </button>
      </Specimen>
      <Specimen title="ui-chip, as the top bar wears it">
        <span className="ui-chip">
          <PixelIcon name="inspect" />
          <span className="ui-chip-label">Highlight</span>
          <span className="ui-chip-caret">
            <PixelIcon name="caret" scale={1} />
          </span>
        </span>
        <button type="button" className="ui-chip" aria-expanded="true">
          <span className="ui-chip-label">Open</span>
        </button>
      </Specimen>
      <Specimen title="ui-plate">
        <span className="ui-plate styleguide-plate">
          <Cost amount={750} />
          <OutOf value={13} total={24} unit="guests" />
        </span>
      </Specimen>
      <Specimen title="ui-badge · ui-tag">
        <span className="styleguide-badged">
          <PixelIcon name="advice" />
          <span className="ui-badge">4</span>
        </span>
        <span className="styleguide-badged">
          <PixelIcon name="messages" />
          <span className="ui-badge">50</span>
        </span>
        <span className="ui-tag">
          <span className="ui-label">Staff</span>
          <strong>3</strong>
        </span>
      </Specimen>
      <Specimen title="Stepper">
        <Stepper
          label="Cleaners"
          less={{ label: 'Fewer', disabled: false, onClick: noop }}
          more={{ label: 'More', disabled: false, onClick: noop }}
          preset={{ text: 'Auto', label: 'Hire by itself', pressed: true, onClick: noop }}
        />
        <Stepper
          label="Mechanics"
          less={{ label: 'Fewer', disabled: true, onClick: noop }}
          more={{ label: 'More', disabled: false, onClick: noop }}
        />
      </Specimen>
    </div>
  );
}

const TAB_SETS: readonly (readonly {
  readonly id: string;
  readonly icon: IconName;
  readonly badge: number;
}[])[] = [
  [
    { id: 'Advice', icon: 'advice', badge: 4 },
    { id: 'Messages', icon: 'messages', badge: 50 },
    { id: 'Bookings', icon: 'bookings', badge: 0 },
  ],
  [
    { id: 'Resort', icon: 'overview', badge: 0 },
    { id: 'Day report', icon: 'report', badge: 0 },
    { id: 'Demand', icon: 'demand', badge: 0 },
    { id: 'Photo wall', icon: 'camera', badge: 0 },
    { id: 'Season', icon: 'clear', badge: 0 },
  ],
];

function TabStrip({ set, at }: { readonly set: (typeof TAB_SETS)[number]; readonly at: number }) {
  const [current, setCurrent] = useState(set[0]!.id);
  const byId = new Map(set.map((tab) => [tab.id, tab]));
  return (
    <Tabs
      tabs={set.map((tab) => tab.id)}
      current={current}
      onPick={setCurrent}
      titleOf={(tab) => tab}
      iconOf={(tab) => byId.get(tab)!.icon}
      badgeOf={(tab) => byId.get(tab)!.badge}
      label={`Sample tabs ${at + 1}`}
      panelId={`styleguide-tabs-${at}`}
    />
  );
}

export function TabSets() {
  return (
    <div className="styleguide-specimens">
      {TAB_SETS.map((set, at) => (
        <Specimen key={set[0]!.id} title={`${set.length} tabs`}>
          <div className="styleguide-column styleguide-tab-host">
            <TabStrip set={set} at={at} />
          </div>
        </Specimen>
      ))}
    </div>
  );
}

export function Forms() {
  const [volume, setVolume] = useState(60);
  const [choice, setChoice] = useState('Island');
  return (
    <div className="styleguide-specimens">
      <Specimen title="ui-slider">
        <label className="ui-slider styleguide-control">
          <span className="ui-slider-label">Music</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <span className="ui-slider-value">{volume}%</span>
        </label>
      </Specimen>
      <Specimen title="ui-form-row">
        <div className="ui-form styleguide-control">
          <label className="ui-form-row">
            <span>Plot size</span>
            <input type="range" min={16} max={64} defaultValue={32} />
            <span className="ui-form-value">32</span>
          </label>
          <div className="ui-form-row ui-form-row--field">
            <span>Seed</span>
            <input type="text" className="ui-field" defaultValue="coral-7" />
          </div>
          <div className="ui-form-row ui-form-row--choice" role="group" aria-label="Landscape">
            <span>Landscape</span>
            <span className="ui-form-choices">
              {['River', 'Hills', 'Island'].map((name) => (
                <button
                  key={name}
                  type="button"
                  className="ui-form-choice"
                  aria-pressed={choice === name}
                  onClick={() => setChoice(name)}
                >
                  {name}
                </button>
              ))}
            </span>
          </div>
        </div>
      </Specimen>
      <Specimen title="ui-select · ui-field">
        <select className="ui-select" defaultValue="music">
          <option value="music">Live music</option>
          <option value="quiz">Quiz night</option>
        </select>
        <input className="ui-field" type="text" placeholder="Resort name" />
      </Specimen>
    </div>
  );
}

const LEVELS = [0, 0.15, 0.35, 0.5, 0.65, 0.82, 1] as const;

export function Figures() {
  return (
    <div className="styleguide-specimens">
      <Specimen title="Meter, red to green by level">
        <div className="styleguide-stack">
          {LEVELS.map((level) => (
            <span key={level} className="styleguide-meter-row">
              <code>{level}</code>
              <Meter level={level} label={`Level ${level}`} />
              <Meter level={level} small />
            </span>
          ))}
        </div>
      </Specimen>
      <Specimen title="StatRow · LevelRow in ui-stats">
        <dl className="ui-stats styleguide-column">
          <StatRow label="Guests" note="2 left today">
            <OutOf value={13} total={24} unit="beds" />
          </StatRow>
          <StatRow label="Balance">
            <Cost amount={405} />
          </StatRow>
          <LevelRow label="Happy guests" level={0.95} />
          <LevelRow label="Clean venues" level={0.42} word="grubby" />
        </dl>
      </Specimen>
      <Specimen title="OutOf with tones">
        <OutOf value={585} total={598} />
        <OutOf value={20} total={24} tone="good" />
        <OutOf value={59} total={59} tone="bad" />
      </Specimen>
      <Specimen title="PanelSummary with HelpTip">
        <div className="styleguide-column">
          <PanelSummary
            figures={[
              { label: 'Urgent', value: '0' },
              { label: 'Fix soon', value: '1', tone: 'bad' },
              { label: 'Rating', value: '4.7 ★', aside: '▲0.6', tone: 'good' },
            ]}
            help={
              <HelpTip label="About this">
                <p>A help card opens on hover, or on a tap or key press.</p>
              </HelpTip>
            }
          />
        </div>
      </Specimen>
    </div>
  );
}

export function Menus() {
  const [sound, setSound] = useState(false);
  return (
    <div className="styleguide-specimens">
      <Specimen title="MenuOption rows in ui-dropdown-panel">
        <OptionHost value="menu">
          <div
            className="ui-panel ui-dropdown-panel styleguide-menu"
            role="menu"
            aria-label="Sample menu"
          >
            <MenuOption
              icon="saves"
              label="Save game"
              note="Coral Shores"
              shortcut="⌘S"
              onSelect={noop}
            />
            <MenuOption icon="camera" label="Photo mode" shortcut="P" onSelect={noop} />
            <hr className="ui-rule" />
            <MenuOption
              icon="resort"
              label="Game"
              note="start, load, rename or share"
              more
              onSelect={noop}
            />
            <MenuOption icon="settings" label="Settings" more onSelect={noop} />
            <hr className="ui-rule" />
            <MenuOption label="Sound" checked={sound} many onSelect={() => setSound(!sound)} />
            <MenuOption label="Disabled row" disabled onSelect={noop} />
          </div>
        </OptionHost>
      </Specimen>
      <Specimen title="Receipt">
        <div className="styleguide-column">
          <Receipt label="Sample settlement">
            <ReceiptLines lines={SAMPLE_TILL} />
          </Receipt>
        </div>
      </Specimen>
    </div>
  );
}
