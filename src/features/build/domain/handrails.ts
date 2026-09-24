import {
  railPlacementsFor,
  type Placement,
  type RailModels,
  type Tile,
} from '../../layout/domain/resortLayout';
import { railsAt, type WaterProvider } from '../../layout/domain/railings';
import type { SpanProvider } from '../../layout/domain/spans';
import type { LevelProvider } from '../../layout/domain/elevation';
import { CLIMBS, type PavedProvider } from '../../layout/domain/stairs';
import type { PavedGround } from './paving';

export interface StandingRails {
  (tileX: number, tileZ: number): readonly Placement[];
}

export interface HandrailRules {
  readonly pavedWith: PavedGround;
  readonly levelOf: LevelProvider;
  // A jetty's edge is railed against water even though the sea is at the pier's own level.
  readonly isWater: WaterProvider;
  // Without it a hand-drawn crossing gets rails stood in the river, inside its own deck.
  readonly isSpan: SpanProvider;
  readonly models: RailModels;
  readonly standing: StandingRails;
}

export interface RailChange {
  readonly stand: readonly Placement[];
  readonly lift: readonly Placement[];
}

// Only these five tiles can change: a rail depends on a tile and its neighbours alone.
const AROUND: readonly { readonly dx: number; readonly dz: number }[] = [
  { dx: 0, dz: 0 },
  ...CLIMBS.map(({ dx, dz }) => ({ dx, dz })),
];

// Asked after the tile and any flight it made are laid, so the rule reads the final paving.
export function railChangeAt(tile: Tile, rules: HandrailRules): RailChange {
  const { pavedWith, levelOf, isWater, isSpan, models, standing } = rules;
  const isPaved: PavedProvider = (tileX, tileZ) => pavedWith(tileX, tileZ) !== null;
  const stand: Placement[] = [];
  const lift: Placement[] = [];
  for (const { dx, dz } of AROUND) {
    const around: Tile = { x: tile.x + dx, z: tile.z + dz };
    const already = standing(around.x, around.z);
    // Still cleared: the bulldozer may just have taken the paving up, and its rails must go with it.
    if (!isPaved(around.x, around.z)) {
      lift.push(...already);
      continue;
    }
    const wanted = railPlacementsFor(
      models,
      railsAt(around, isPaved, levelOf, isWater, isSpan),
      levelOf,
    );
    const wantedKeys = new Set(wanted.map((rail) => rail.key));
    const standingKeys = new Set(already.map((rail) => rail.key));
    for (const rail of wanted) if (!standingKeys.has(rail.key)) stand.push(rail);
    for (const rail of already) if (!wantedKeys.has(rail.key)) lift.push(rail);
  }
  return { stand, lift };
}

export interface RailSink {
  (stand: readonly Placement[], lift: readonly Placement[]): void;
}

// Says nothing when nothing changed, so the HUD is not told once per tile.
export function reRailAround(tile: Tile, rules: HandrailRules, onRails: RailSink): void {
  const { stand, lift } = railChangeAt(tile, rules);
  if (stand.length === 0 && lift.length === 0) return;
  onRails(stand, lift);
}
