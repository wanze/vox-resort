import type { MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import { derivedKey, type LayoutItem, type Placement, type Tile } from './resortLayout';
import { PATH_ID } from './resortPlan';
import { ROTATIONS, type Rotation } from './rotation';
import { CLIMBS } from './stairs';

export interface MosaicFit {
  readonly piece: number;
  readonly rotation: Rotation;
}

const sideOf = ({ dx, dz }: { readonly dx: number; readonly dz: number }): MosaicSide => {
  if (dz !== 0) return dz < 0 ? 'n' : 's';
  return dx < 0 ? 'w' : 'e';
};

// In turn order, read off the flights so a mosaic piece cannot turn the other way to a stair.
const SIDES: readonly MosaicSide[] = CLIMBS.map(sideOf);

export function turnedSide(side: MosaicSide, rotation: Rotation): MosaicSide {
  return SIDES[(SIDES.indexOf(side) + rotation) % SIDES.length]!;
}

// The lowest turn wins, so a symmetric piece is never re-laid only to turn it.
export function mosaicFit(
  bordered: ReadonlySet<MosaicSide>,
  pieces: readonly { readonly borders: readonly MosaicSide[] }[],
): MosaicFit | null {
  for (const rotation of ROTATIONS) {
    const piece = pieces.findIndex(
      ({ borders }) =>
        borders.length === bordered.size &&
        borders.every((side) => bordered.has(turnedSide(side, rotation))),
    );
    if (piece >= 0) return { piece, rotation };
  }
  return null;
}

export function borderedSides(
  tile: Tile,
  style: string,
  styleAt: (tileX: number, tileZ: number) => string | null,
): Set<MosaicSide> {
  return new Set(
    CLIMBS.filter(({ dx, dz }) => styleAt(tile.x + dx, tile.z + dz) !== style).map(sideOf),
  );
}

export interface MosaicKit {
  readonly styleOf: (id: string) => string | null;
  readonly pieceFor: (
    style: string,
    bordered: ReadonlySet<MosaicSide>,
  ) => { readonly item: LayoutItem; readonly rotation: Rotation } | null;
}

// Re-lays plain path tiles a style is chosen for, each by its neighbours in the result.
export function layMosaic(
  paths: readonly Placement[],
  styleFor: (tileX: number, tileZ: number) => string | null,
  kit: MosaicKit,
): Placement[] {
  const chosen = (placement: Placement): string | null =>
    placement.id === PATH_ID ? styleFor(placement.tileX, placement.tileZ) : null;
  const styles = new Map<string, string | null>();
  for (const placement of paths) {
    styles.set(
      `${placement.tileX},${placement.tileZ}`,
      chosen(placement) ?? kit.styleOf(placement.id),
    );
  }
  const styleAt = (tileX: number, tileZ: number): string | null =>
    styles.get(`${tileX},${tileZ}`) ?? null;
  return paths.map((placement) => {
    const style = chosen(placement);
    const tile = { x: placement.tileX, z: placement.tileZ };
    const fit = style === null ? null : kit.pieceFor(style, borderedSides(tile, style, styleAt));
    if (fit === null) return placement;
    // A paving tile is square, so turning it moves neither its corner nor its size.
    return {
      ...placement,
      key: derivedKey(fit.item.id, tile.x, tile.z),
      id: fit.item.id,
      rotation: fit.rotation,
    };
  });
}
