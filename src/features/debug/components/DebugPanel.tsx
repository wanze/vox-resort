import { canRunSeasonAction, SEASON_ACTIONS } from '../../resort-sim/domain/debugSteps';
import { PHASE_WORDS, type SeasonView } from '../../sim/domain/season';
import type { DebugControls } from './debugControls';
import { SEASON_ACTION_WORDS, TURBO_WORDS } from './debugWords';

export interface DebugPanelProps {
  readonly debug: DebugControls;
  // Null where the resort runs no seasons.
  readonly season: SeasonView | null;
}

function seasonLine(season: SeasonView | null): string {
  if (!season) return 'No seasons';
  if (season.state === 'break') return `Break after season ${season.number}`;
  return `Season ${season.number}, day ${season.day}: ${PHASE_WORDS[season.phase]}`;
}

export function DebugPanel({ debug, season }: DebugPanelProps) {
  return (
    <div className="ui-stack debug-panel">
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-clock">
        <h3 id="debug-panel-clock" className="ui-label">
          Clock
        </h3>
        <button
          type="button"
          className="ui-button"
          aria-pressed={debug.turbo}
          onClick={() => debug.setTurbo(!debug.turbo)}
        >
          {TURBO_WORDS.label} {debug.turbo ? 'on' : 'off'}
        </button>
      </section>
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-render">
        <h3 id="debug-panel-render" className="ui-label">
          Render
        </h3>
        <button
          type="button"
          className="ui-button"
          aria-pressed={debug.detail}
          onClick={() => debug.setDetail(!debug.detail)}
        >
          Level of detail {debug.detail ? 'on' : 'off'}
        </button>
      </section>
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-season">
        <h3 id="debug-panel-season" className="ui-label">
          {seasonLine(season)}
        </h3>
        <div className="debug-panel-actions">
          {SEASON_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="ui-button"
              disabled={!canRunSeasonAction(season, action)}
              onClick={() => debug.runSeasonAction(action)}
            >
              {SEASON_ACTION_WORDS[action].label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
