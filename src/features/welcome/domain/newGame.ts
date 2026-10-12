import { BARE_WORLD_TILES } from '../../land/domain/landRights';
import { cleanResortName, resortNameFor } from '../../naming/domain/resortName';
import {
  clampParams,
  LANDSCAPE_NEEDS,
  landscapeOffered,
  PLOT_TILES,
  type ResortParams,
} from '../../layout/domain/resortGenerator';
import type { LandConfig } from '../../layout/domain/landConfig';
import type { GameMode } from '../../sim/domain/ledger';

export type Ground = 'bare' | 'grown';

export interface NewGame {
  readonly mode: GameMode;
  readonly ground: Ground;
  readonly name: string;
}

type Start = Pick<NewGame, 'mode' | 'ground'>;

// A tycoon pays for everything that stands, so it never starts on a resort it did not build.
export function groundOf(game: Start): Ground {
  return game.mode === 'tycoon' ? 'bare' : game.ground;
}

// Bare land is a fixed world the player buys into, so its size is never asked.
export function paramsFor(game: Start, draft: ResortParams): ResortParams {
  if (groundOf(game) !== 'bare') return draft;
  return { ...draft, tilesX: BARE_WORLD_TILES, tilesZ: BARE_WORLD_TILES };
}

// Kept apart per ground, since each fills in its own defaults: switching to bare land and back
// must not carry the one's landscape over to the other.
export type LandDrafts = { readonly [ground in Ground]?: Partial<LandConfig> };

// A new game always grows with the default config: the panel no longer offers one to change.
export function startParamsFor(game: Start, draft: ResortParams, lands: LandDrafts): ResortParams {
  const land = lands[groundOf(game)];
  const { land: _land, config: _config, ...rest } = draft;
  return clampParams(paramsFor(game, land ? { ...rest, land } : rest));
}

const LANDSCAPE_LABELS: { readonly [option in keyof LandConfig]: string } = {
  river: 'River',
  hills: 'Hills',
  island: 'Island',
};

// Said in words rather than left to a greyed-out button: a touch screen shows no tooltip.
export function landscapeHintFor(tilesX: number, tilesZ: number): string | null {
  const offered = landscapeOffered(tilesX, tilesZ);
  const missing = (Object.keys(LANDSCAPE_LABELS) as (keyof LandConfig)[])
    .filter((option) => !offered[option])
    .map((option) => {
      const needs = LANDSCAPE_NEEDS[option];
      const size =
        needs.tilesZ > PLOT_TILES.min
          ? `${needs.tilesX} × ${needs.tilesZ}`
          : `${needs.tilesX} wide`;
      return `${LANDSCAPE_LABELS[option]} ${size}`;
    });
  return missing.length > 0 ? `Needs a larger plot: ${missing.join(', ')}.` : null;
}

// A field left empty still names the resort: there is never a game without one.
export function nameFor(typed: string, seed: number): string {
  return cleanResortName(typed) ?? resortNameFor(seed);
}
