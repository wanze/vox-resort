import { useState } from 'react';
import {
  clampParams,
  PLOT_DENSITY,
  PLOT_TILES,
  type ResortParams,
} from '../../layout/domain/resortGenerator';
import { sameConfig } from '../../layout/domain/resortConfig';
import { ResortAdvanced } from './ResortAdvanced';

export interface ResortPanelProps {
  readonly params: ResortParams;
  readonly onGenerate: (params: ResortParams) => void;
  readonly onClear: (params: ResortParams) => void;
  readonly busy: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const rollSeed = (): number => Math.floor(Math.random() * 0xffffffff);

function isStaged(draft: ResortParams, grown: ResortParams): boolean {
  const moved = (['tilesX', 'tilesZ', 'density', 'seed'] as const).some(
    (key) => draft[key] !== grown[key],
  );
  return moved || !sameConfig(draft.config, grown.config);
}

function goLabel(busy: boolean, staged: boolean): string {
  if (busy) return 'Building…';
  return staged ? 'Generate' : 'Generate again';
}

// Sliders stage rather than apply: growing a resort takes most of a second.
export function ResortPanel({
  params,
  onGenerate,
  onClear,
  busy,
  open,
  onOpenChange,
}: ResortPanelProps) {
  const [draft, setDraft] = useState<ResortParams>(params);
  const change = (patch: Partial<ResortParams>): void => setDraft({ ...draft, ...patch });
  const staged = isStaged(draft, params);
  // Show back the clamped params, so the panel does not claim an edit nobody can apply.
  const commit = (run: (params: ResortParams) => void) => (): void => {
    const asked = clampParams(draft);
    setDraft(asked);
    run(asked);
  };

  return (
    <div className="hud-resort">
      <div className="hud-resort-row">
        <span>Gates</span>
        <div className="hud-time-speeds" role="group" aria-label="Whether new guests may arrive">
          <button
            type="button"
            className="hud-time-speed"
            aria-pressed={open}
            onClick={() => onOpenChange(true)}
          >
            Open
          </button>
          <button
            type="button"
            className="hud-time-speed"
            aria-pressed={!open}
            onClick={() => onOpenChange(false)}
          >
            Closed
          </button>
        </div>
      </div>

      <label className="hud-resort-row">
        <span>Width</span>
        <input
          type="range"
          min={PLOT_TILES.min}
          max={PLOT_TILES.max}
          step={4}
          value={draft.tilesX}
          onChange={(event) => change({ tilesX: Number(event.target.value) })}
          aria-label="Plot width in tiles"
        />
        <span className="hud-resort-value">{draft.tilesX}</span>
      </label>

      <label className="hud-resort-row">
        <span>Depth</span>
        <input
          type="range"
          min={PLOT_TILES.min}
          max={PLOT_TILES.max}
          step={4}
          value={draft.tilesZ}
          onChange={(event) => change({ tilesZ: Number(event.target.value) })}
          aria-label="Plot depth in tiles"
        />
        <span className="hud-resort-value">{draft.tilesZ}</span>
      </label>

      <label className="hud-resort-row">
        <span>Density</span>
        <input
          type="range"
          min={PLOT_DENSITY.min}
          max={PLOT_DENSITY.max}
          step={0.05}
          value={draft.density}
          onChange={(event) => change({ density: Number(event.target.value) })}
          aria-label="How built-up the plot is"
        />
        <span className="hud-resort-value">{Math.round(draft.density * 100)}%</span>
      </label>

      <div className="hud-resort-row hud-resort-seed">
        <span>Seed</span>
        <input
          type="number"
          value={draft.seed}
          onChange={(event) => change({ seed: Number(event.target.value) })}
          aria-label="Seed the resort is grown from"
        />
        <button
          type="button"
          className="hud-resort-roll"
          onClick={() => change({ seed: rollSeed() })}
          aria-label="A different resort"
        >
          ⟳
        </button>
      </div>

      <ResortAdvanced config={draft.config} onChange={(config) => change({ config })} />

      <div className="hud-resort-actions">
        <button
          type="button"
          className="hud-resort-go"
          disabled={busy}
          onClick={commit(onGenerate)}
        >
          {goLabel(busy, staged)}
        </button>
        <button
          type="button"
          className="hud-resort-clear"
          disabled={busy}
          onClick={commit(onClear)}
          aria-label="A bare landscape to build on by hand: a bay, a hill and a river"
          title="Bare ground: a bay, a terraced hill and a river off it, nothing built"
        >
          Terrain
        </button>
      </div>
    </div>
  );
}
