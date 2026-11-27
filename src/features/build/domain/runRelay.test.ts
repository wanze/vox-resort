import { describe, expect, it } from 'vitest';
import { runKitOf } from '../../catalog/domain/runs';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { place, type Placement, type Tile } from '../../layout/domain/resortLayout';
import type { Rotation } from '../../layout/domain/rotation';
import { layoutItemFor } from './buildPlan';
import { rejoinedAround, runPieceAt, type RunRules } from './runRelay';

const ITEMS = new Map(OBJECT_TYPES.map((type) => [type.id, layoutItemFor(type)]));

const stand = (id: string, x: number, z: number, rotation: Rotation = 0): Placement =>
  place(ITEMS.get(id)!, `${id}@${x},${z}`, x, z, rotation);

function rulesFor(standing: readonly Placement[], paved: readonly Tile[] = []): RunRules {
  const kit = runKitOf([...ITEMS.values()]);
  return {
    kit,
    runAt: (tile) =>
      standing.find(
        (placement) =>
          placement.tileX === tile.x && placement.tileZ === tile.z && kit.styleOf(placement.id),
      ),
    isPaved: (x, z) => paved.some((tile) => tile.x === x && tile.z === z),
    levelOf: () => 0,
  };
}

describe('runPieceAt', () => {
  it('lays the corner where a hedge meets two at right angles', () => {
    const rules = rulesFor([stand('hedge', 6, 5), stand('hedge', 5, 6)]);
    expect(runPieceAt(ITEMS.get('hedge')!, { x: 5, z: 5 }, 0, rules).item.id).toBe('hedge-corner');
  });

  it('does not join a hedge to a stone wall', () => {
    const rules = rulesFor([stand('stone-wall', 6, 5)]);
    expect(runPieceAt(ITEMS.get('hedge')!, { x: 5, z: 5 }, 0, rules).item.id).toBe('hedge-single');
  });

  it('turns a lone hedge along the path beside it', () => {
    const rules = rulesFor([], [{ x: 4, z: 5 }]);
    expect(runPieceAt(ITEMS.get('hedge')!, { x: 5, z: 5 }, 0, rules).rotation).toBe(1);
  });

  it('passes anything else through as picked', () => {
    const lamp = ITEMS.get('street-lamp')!;
    expect(runPieceAt(lamp, { x: 5, z: 5 }, 2, rulesFor([]))).toEqual({ item: lamp, rotation: 2 });
  });
});

describe('rejoinedAround', () => {
  it('turns a lone neighbour into the end of the new row', () => {
    const lone = stand('hedge-single', 5, 4);
    const rules = rulesFor([lone, stand('hedge-end', 5, 5, 1)]);
    const [relaid, ...rest] = rejoinedAround({ x: 5, z: 5 }, rules);
    expect(rest).toEqual([]);
    expect(relaid!.lifted).toBe(lone);
    expect(relaid!.placement.id).toBe('hedge-end');
    expect(relaid!.placement.key).toBe('hedge-end@5,4');
  });

  it('leaves a neighbour that already fits', () => {
    const rules = rulesFor([stand('hedge-end', 4, 5), stand('hedge-end', 5, 5, 2)]);
    expect(rejoinedAround({ x: 5, z: 5 }, rules)).toEqual([]);
  });
});
