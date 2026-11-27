import type { MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import { mosaicFit, sidesWhere } from './mosaic';
import type { LayoutItem, Placement, Tile } from './resortLayout';
import { derivedKey } from './resortLayout';
import type { Rotation } from './rotation';
import { tileKey } from './tileKey';

export type StyleAt = (tileX: number, tileZ: number) => string | null;

export type PavedAt = (tileX: number, tileZ: number) => boolean;

export interface RunFit {
  readonly item: LayoutItem;
  readonly rotation: Rotation;
}

export interface RunKit {
  readonly styleOf: (id: string) => string | null;
  // Alone, a piece lies the way it is told: it has no neighbour to turn it.
  readonly pieceFor: (
    style: string,
    joined: ReadonlySet<MosaicSide>,
    alone: Rotation,
  ) => RunFit | null;
}

export interface RunPieceOf {
  readonly item: LayoutItem;
  readonly joins: readonly MosaicSide[];
}

export function runFit(
  joined: ReadonlySet<MosaicSide>,
  pieces: readonly RunPieceOf[],
  alone: Rotation,
): RunFit | null {
  if (joined.size === 0) {
    const single = pieces.find((piece) => piece.joins.length === 0);
    return single ? { item: single.item, rotation: alone } : null;
  }
  const fit = mosaicFit(
    joined,
    pieces.map((piece) => ({ borders: piece.joins })),
  );
  return fit && { item: pieces[fit.piece]!.item, rotation: fit.rotation };
}

export const joinedSides = (tile: Tile, style: string, styleAt: StyleAt): Set<MosaicSide> =>
  sidesWhere(tile, (x, z) => styleAt(x, z) === style);

// A lone piece lies along x unturned, so it follows the path beside it; with paving on both axes
// or none it keeps the turn it was given.
export function aloneTurn(tile: Tile, isPaved: PavedAt, otherwise: Rotation): Rotation {
  const paved = sidesWhere(tile, isPaved);
  const alongX = paved.has('n') || paved.has('s');
  const alongZ = paved.has('e') || paved.has('w');
  if (alongX === alongZ) return otherwise;
  return alongX ? 0 : 1;
}

const ALONG_X: ReadonlySet<MosaicSide> = new Set(['e', 'w']);
const ALONG_Z: ReadonlySet<MosaicSide> = new Set(['n', 's']);

// The generator lays each hedge along its path, and two rows back to back between parallel paths
// are not one hedge, so a laid run joins only along the way it was laid.
export function layRuns(props: readonly Placement[], kit: RunKit): Placement[] {
  const styles = new Map<string, string | null>();
  for (const placement of props) {
    styles.set(tileKey(placement.tileX, placement.tileZ), kit.styleOf(placement.id));
  }
  const styleAt: StyleAt = (x, z) => styles.get(tileKey(x, z)) ?? null;
  return props.map((placement) => {
    const style = kit.styleOf(placement.id);
    if (style === null) return placement;
    const tile = { x: placement.tileX, z: placement.tileZ };
    const way = placement.rotation % 2 === 0 ? ALONG_X : ALONG_Z;
    const joined = new Set([...joinedSides(tile, style, styleAt)].filter((side) => way.has(side)));
    const fit = kit.pieceFor(style, joined, placement.rotation);
    if (fit === null) return placement;
    return {
      ...placement,
      key: derivedKey(fit.item.id, tile.x, tile.z),
      id: fit.item.id,
      rotation: fit.rotation,
    };
  });
}
