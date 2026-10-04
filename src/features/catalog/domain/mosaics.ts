import { MOSAIC_STYLES } from '../../../../voxel-gen/mosaics/index.ts';
import { MOSAIC_PIECES } from '../../../../voxel-gen/mosaics/pieces.ts';
import type { MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import { mosaicFit, type MosaicKit } from '../../layout/domain/mosaic';
import type { LayoutItem, Placement } from '../../layout/domain/resortLayout';
import type { Plaza, ResortPlan } from '../../layout/domain/resortPlan';
import { familyOf, mosaicOf } from './objectTypes';
import { rollFor } from './styleMix';

interface Piece {
  readonly item: LayoutItem;
  readonly borders: readonly MosaicSide[];
}

const pieceOrder = (borders: readonly MosaicSide[]): number =>
  MOSAIC_PIECES.findIndex((piece) => piece.borders.join() === borders.join());

export function mosaicKitOf(items: readonly LayoutItem[]): MosaicKit {
  const byStyle = new Map<string, Piece[]>();
  for (const item of items) {
    const mosaic = mosaicOf(item.id);
    if (mosaic === null) continue;
    const pieces = byStyle.get(mosaic.style) ?? [];
    pieces.push({ item, borders: mosaic.borders });
    byStyle.set(mosaic.style, pieces);
  }
  for (const pieces of byStyle.values()) {
    pieces.sort((a, b) => pieceOrder(a.borders) - pieceOrder(b.borders));
  }
  return {
    styleOf: (id) => mosaicOf(id)?.style ?? null,
    pieceFor(style, bordered) {
      const pieces = byStyle.get(style) ?? [];
      const fit = mosaicFit(bordered, pieces);
      return fit && { item: pieces[fit.piece]!.item, rotation: fit.rotation };
    },
  };
}

const FOUNTAIN_ID = 'fountain';
const STATUE_ID = 'statue';

// One tile round a monument: a statue beside a street gets a small square, not a run of street.
const MONUMENT_REACH = 1;

const inside = (rect: Plaza, tileX: number, tileZ: number): boolean =>
  tileX >= rect.x0 && tileX <= rect.x1 && tileZ >= rect.z0 && tileZ <= rect.z1;

const around = (placement: Placement, reach: number): Plaza => ({
  x0: placement.tileX - reach,
  x1: placement.tileX + placement.tilesX - 1 + reach,
  z0: placement.tileZ - reach,
  z1: placement.tileZ + placement.tilesZ - 1 + reach,
});

const overlaps = (a: Plaza, b: Plaza): boolean =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

// Parks first, so a fountain in a park is paved in the park's style rather than a second one.
// Hashed by area, not drawn, so dressing a plot never shifts the generator's stream.
export function mosaicDressing(
  plan: ResortPlan,
  standing: readonly Placement[],
  seed: number,
): (tileX: number, tileZ: number) => string | null {
  const fountains = standing.filter((placement) => familyOf(placement.id) === FOUNTAIN_ID);
  const monuments = standing.filter((placement) =>
    [FOUNTAIN_ID, STATUE_ID].includes(familyOf(placement.id)),
  );
  const squares = plan.plazas.filter((plaza) =>
    fountains.some((fountain) => overlaps(plaza, around(fountain, 0))),
  );
  const areas = [
    ...(plan.parks ?? []),
    ...squares,
    ...monuments.map((monument) => around(monument, MONUMENT_REACH)),
  ];
  const styles = areas.map((area) => {
    const roll = rollFor(`${seed}|mosaic|${area.x0},${area.z0},${area.x1},${area.z1}`);
    return MOSAIC_STYLES[Math.floor(roll * MOSAIC_STYLES.length)]!.id;
  });
  return (tileX, tileZ) => {
    const index = areas.findIndex((area) => inside(area, tileX, tileZ));
    return index < 0 ? null : styles[index]!;
  };
}
