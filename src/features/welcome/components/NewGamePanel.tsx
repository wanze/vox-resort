import { useState } from 'react';
import {
  clampParams,
  PLOT_DENSITY,
  PLOT_TILES,
  type ResortParams,
} from '../../layout/domain/resortGenerator';
import { clampLand, type LandConfig } from '../../layout/domain/landConfig';
import type { GameMode } from '../../sim/domain/ledger';
import type { SaveOutcome } from '../../saves/domain/saveSlots';
import type { SaveMeta } from '../../saves/domain/snapshot';
import { UnsavedWarning } from '../../saves/components/UnsavedWarning';
import { PixelIcon } from '../../hud/components/PixelIcon';
import type { IconName } from '../../hud/components/pixelIcons';
import { groundOf, paramsFor, type Ground, type NewGame } from '../domain/newGame';
import { MODE_LABELS } from './modeNames';
import { ResortAdvanced } from './ResortAdvanced';

export interface NewGamePanelProps {
  readonly params: ResortParams;
  readonly onStart: (params: ResortParams, game: NewGame) => void;
  readonly busy: boolean;
  // The game in the unsaved slot, which a new game would autosave over.
  readonly unsaved: SaveMeta | null;
  readonly onKeepUnsaved: (name: string, overwrite: boolean) => Promise<SaveOutcome>;
}

const MODES: readonly {
  readonly mode: GameMode;
  readonly icon: IconName;
  readonly note: string;
}[] = [
  {
    mode: 'tycoon',
    icon: 'books',
    note: 'Start on bare land with a budget. Every path, building and spadeful costs money.',
  },
  {
    mode: 'sandbox',
    icon: 'build',
    note: 'Money is no object. Build by hand, or let the generator lay out a whole resort.',
  },
];

const GROUNDS: readonly { readonly ground: Ground; readonly label: string }[] = [
  { ground: 'bare', label: 'Bare land' },
  { ground: 'grown', label: 'Generated resort' },
];

const rollSeed = (): number => Math.floor(Math.random() * 0xffffffff);

function ModeChoice(props: {
  readonly mode: GameMode | null;
  readonly onPick: (mode: GameMode) => void;
}) {
  return (
    <div className="new-game-modes" role="radiogroup" aria-label="Game mode">
      {MODES.map(({ mode, icon, note }) => (
        <button
          key={mode}
          type="button"
          role="radio"
          className="new-game-mode"
          aria-checked={mode === props.mode}
          onClick={() => props.onPick(mode)}
        >
          <PixelIcon name={icon} scale={3} />
          <span className="new-game-mode-text">
            <strong>{MODE_LABELS[mode]}</strong>
            <span>{note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function GroundChoice(props: {
  readonly ground: Ground;
  readonly onPick: (ground: Ground) => void;
}) {
  return (
    <div className="hud-resort-row hud-resort-choice-row" role="group" aria-label="Start from">
      <span>Start from</span>
      <div className="hud-resort-choices">
        {GROUNDS.map(({ ground, label }) => (
          <button
            key={ground}
            type="button"
            className="hud-resort-choice new-game-ground"
            aria-pressed={ground === props.ground}
            onClick={() => props.onPick(ground)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider(props: {
  readonly label: string;
  readonly aria: string;
  readonly range: { readonly min: number; readonly max: number };
  readonly step: number;
  readonly value: number;
  readonly shown: string;
  readonly onSlide: (value: number) => void;
}) {
  return (
    <label className="hud-resort-row">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.range.min}
        max={props.range.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onSlide(Number(event.target.value))}
        aria-label={props.aria}
      />
      <span className="hud-resort-value">{props.shown}</span>
    </label>
  );
}

const LAND_FLAGS: readonly { readonly flag: keyof LandConfig; readonly label: string }[] = [
  { flag: 'river', label: 'River' },
  { flag: 'hills', label: 'Hills' },
  { flag: 'island', label: 'Island' },
];

function LandFields(props: {
  readonly land: Partial<LandConfig> | undefined;
  readonly onChange: (land: LandConfig) => void;
}) {
  const current = clampLand(props.land);
  return (
    <div className="hud-resort-row hud-resort-choice-row" role="group" aria-label="Landscape">
      <span>Landscape</span>
      <div className="hud-resort-choices">
        {LAND_FLAGS.map(({ flag, label }) => (
          <button
            key={flag}
            type="button"
            className="hud-resort-choice"
            aria-pressed={current[flag]}
            onClick={() => props.onChange({ ...current, [flag]: !current[flag] })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlotFields(props: {
  readonly draft: ResortParams;
  readonly grown: boolean;
  readonly onChange: (patch: Partial<ResortParams>) => void;
}) {
  const { draft, grown, onChange } = props;
  return (
    <>
      {grown ? (
        <>
          <Slider
            label="Width"
            aria="Plot width in tiles"
            range={PLOT_TILES}
            step={4}
            value={draft.tilesX}
            shown={String(draft.tilesX)}
            onSlide={(tilesX) => onChange({ tilesX })}
          />
          <Slider
            label="Depth"
            aria="Plot depth in tiles"
            range={PLOT_TILES}
            step={4}
            value={draft.tilesZ}
            shown={String(draft.tilesZ)}
            onSlide={(tilesZ) => onChange({ tilesZ })}
          />
          <Slider
            label="Density"
            aria="How built-up the plot is"
            range={PLOT_DENSITY}
            step={0.05}
            value={draft.density}
            shown={`${Math.round(draft.density * 100)}%`}
            onSlide={(density) => onChange({ density })}
          />
        </>
      ) : null}
      <div className="hud-resort-row hud-resort-seed">
        <span>Seed</span>
        <input
          type="number"
          value={draft.seed}
          onChange={(event) => onChange({ seed: Number(event.target.value) })}
          aria-label="Seed the landscape is shaped from"
        />
        <button
          type="button"
          className="hud-resort-roll"
          onClick={() => onChange({ seed: rollSeed() })}
          aria-label="A different landscape"
        >
          ⟳
        </button>
      </div>
      {grown ? (
        <ResortAdvanced config={draft.config} onChange={(config) => onChange({ config })} />
      ) : (
        <LandFields land={draft.land} onChange={(land) => onChange({ land })} />
      )}
    </>
  );
}

// The mode comes first and alone: the rest only means something once it is chosen.
export function NewGamePanel({ params, onStart, busy, unsaved, onKeepUnsaved }: NewGamePanelProps) {
  const [draft, setDraft] = useState<ResortParams>(params);
  const [mode, setMode] = useState<GameMode | null>(null);
  const [ground, setGround] = useState<Ground>('grown');
  const change = (patch: Partial<ResortParams>): void => setDraft({ ...draft, ...patch });

  const start = (game: NewGame) => (): void => {
    // Shown back clamped, so the panel does not claim a size nobody can build.
    setDraft(clampParams(draft));
    onStart(clampParams(paramsFor(game, draft)), game);
  };

  return (
    <div className="hud-resort new-game">
      <UnsavedWarning unsaved={unsaved} onKeep={onKeepUnsaved} />
      <ModeChoice mode={mode} onPick={setMode} />
      {mode === null ? null : (
        <div className="new-game-options">
          {mode === 'sandbox' ? <GroundChoice ground={ground} onPick={setGround} /> : null}
          <PlotFields
            draft={draft}
            grown={groundOf({ mode, ground }) === 'grown'}
            onChange={change}
          />
          <button
            type="button"
            className="hud-resort-go new-game-start"
            disabled={busy}
            onClick={start({ mode, ground })}
          >
            {busy ? 'Building…' : 'Start game'}
          </button>
        </div>
      )}
    </div>
  );
}
