import type { SeasonAction } from '../../resort-sim/domain/debugSteps';

export interface DebugControls {
  readonly turbo: boolean;
  setTurbo(on: boolean): void;
  // Always on for the player; off only to compare frame rate without it.
  readonly detail: boolean;
  setDetail(on: boolean): void;
  runSeasonAction(action: SeasonAction): void;
}
