import type { LevelProvider } from '../../layout/domain/elevation';
import {
  derivedKey,
  place,
  type LayoutItem,
  type Placement,
  type Tile,
} from '../../layout/domain/resortLayout';
import type { Rotation } from '../../layout/domain/rotation';
import {
  aloneTurn,
  joinedSides,
  type PavedAt,
  type RunFit,
  type RunKit,
  type StyleAt,
} from '../../layout/domain/runs';
import type { Relaid } from './paving';

export interface RunRules {
  readonly kit: RunKit;
  readonly runAt: (tile: Tile) => Placement | undefined;
  readonly isPaved: PavedAt;
  readonly levelOf: LevelProvider;
}

const NEIGHBOURS: readonly Tile[] = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

const styleAtOf =
  (rules: RunRules): StyleAt =>
  (x, z) => {
    const standing = rules.runAt({ x, z });
    return standing ? rules.kit.styleOf(standing.id) : null;
  };

function fitAt(style: string, tile: Tile, rotation: Rotation, rules: RunRules): RunFit | null {
  const joined = joinedSides(tile, style, styleAtOf(rules));
  return rules.kit.pieceFor(style, joined, aloneTurn(tile, rules.isPaved, rotation));
}

// The piece of the picked run's style that joins what stands round the tile; anything else as it is.
export function runPieceAt(
  picked: LayoutItem,
  tile: Tile,
  rotation: Rotation,
  rules: RunRules,
): RunFit {
  const style = rules.kit.styleOf(picked.id);
  const fit = style === null ? null : fitAt(style, tile, rotation, rules);
  return fit ?? { item: picked, rotation };
}

// Asked once the tile has changed, so a run built or bulldozed beside them re-joins its neighbours.
export function rejoinedAround(tile: Tile, rules: RunRules): Relaid[] {
  return NEIGHBOURS.flatMap((step): Relaid[] => {
    const at = { x: tile.x + step.x, z: tile.z + step.z };
    const standing = rules.runAt(at);
    const style = standing ? rules.kit.styleOf(standing.id) : null;
    if (!standing || style === null) return [];
    const fit = fitAt(style, at, standing.rotation, rules);
    if (!fit || (fit.item.id === standing.id && fit.rotation === standing.rotation)) return [];
    const key = derivedKey(fit.item.id, at.x, at.z);
    const placement = place(fit.item, key, at.x, at.z, fit.rotation, rules.levelOf(at.x, at.z));
    return [{ placement, lifted: standing }];
  });
}
