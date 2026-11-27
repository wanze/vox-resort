import { RUN_PIECES } from '../../../../voxel-gen/runs/pieces.ts';
import type { LayoutItem } from '../../layout/domain/resortLayout';
import { runFit, type RunKit, type RunPieceOf } from '../../layout/domain/runs';
import { runOf } from './objectTypes';

const pieceOrder = (piece: RunPieceOf): number =>
  RUN_PIECES.findIndex((each) => each.joins.join() === piece.joins.join());

export function runKitOf(items: readonly LayoutItem[]): RunKit {
  const byStyle = new Map<string, RunPieceOf[]>();
  for (const item of items) {
    const run = runOf(item.id);
    if (run === null) continue;
    const pieces = byStyle.get(run.style) ?? [];
    pieces.push({ item, joins: run.joins });
    byStyle.set(run.style, pieces);
  }
  for (const pieces of byStyle.values()) pieces.sort((a, b) => pieceOrder(a) - pieceOrder(b));
  return {
    styleOf: (id) => runOf(id)?.style ?? null,
    pieceFor: (style, joined, alone) => runFit(joined, byStyle.get(style) ?? [], alone),
  };
}
