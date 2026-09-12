import { useState } from 'react';
import {
  clampParams,
  PLOT_DENSITY,
  PLOT_TILES,
  type ResortParams,
} from '../../layout/domain/resortGenerator';

export interface ResortPanelProps {
  /** What the resort on screen was grown from. */
  readonly params: ResortParams;
  readonly onGenerate: (params: ResortParams) => void;
  readonly onClear: (params: ResortParams) => void;
  /** True while a resort is being laid out and baked; the panel says so. */
  readonly busy: boolean;
}

/** A whole new plot to grow, in the range the seed field accepts. */
const rollSeed = (): number => Math.floor(Math.random() * 0xffffffff);

/** Whether the controls have been moved since the resort on screen was grown. */
function isStaged(draft: ResortParams, grown: ResortParams): boolean {
  return (
    draft.tilesX !== grown.tilesX ||
    draft.tilesZ !== grown.tilesZ ||
    draft.density !== grown.density ||
    draft.seed !== grown.seed
  );
}

/** What the button offers: the work, a different resort, or the same one again. */
function goLabel(busy: boolean, staged: boolean): string {
  if (busy) return 'Building…';
  return staged ? 'Generate' : 'Generate again';
}

/**
 * The controls that grow a resort.
 *
 * The sliders stage rather than apply: laying a plot out, baking a few hundred
 * lamps and uploading the meshes is most of a second, and a slider that spent
 * that on every tick would be unusable. So the panel holds an edit until it is
 * asked for, which also makes the seed and the size one gesture rather than
 * three resorts.
 */
export function ResortPanel({ params, onGenerate, onClear, busy }: ResortPanelProps) {
  const [draft, setDraft] = useState<ResortParams>(params);
  const change = (patch: Partial<ResortParams>): void => setDraft({ ...draft, ...patch });
  const staged = isStaged(draft, params);
  // Committing shows back what was actually used: a seed typed outside the range
  // the generator works in is pulled into it, and the field should say so rather
  // than leaving the panel claiming an edit nobody can apply.
  const commit = (run: (params: ResortParams) => void) => (): void => {
    const asked = clampParams(draft);
    setDraft(asked);
    run(asked);
  };

  return (
    <div className="hud-resort">
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
