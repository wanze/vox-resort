import { describe, expect, it } from 'vitest';
import type { MosaicSide } from '../../../../voxel-gen/voxelgen.ts';
import { place, type LayoutItem } from './resortLayout';
import { aloneTurn, joinedSides, layRuns, runFit, type RunKit, type RunPieceOf } from './runs';

const item = (id: string): LayoutItem => ({ id, tilesX: 1, tilesZ: 1, width: 16, depth: 16 });

const PIECES: readonly RunPieceOf[] = [
  { item: item('hedge'), joins: ['e', 'w'] },
  { item: item('hedge-single'), joins: [] },
  { item: item('hedge-end'), joins: ['e'] },
  { item: item('hedge-corner'), joins: ['e', 's'] },
  { item: item('hedge-tee'), joins: ['e', 's', 'w'] },
  { item: item('hedge-cross'), joins: ['n', 'e', 's', 'w'] },
];

const KIT: RunKit = {
  styleOf: (id) => (id.startsWith('hedge') ? 'hedge' : null),
  pieceFor: (_style, joined, alone) => runFit(joined, PIECES, alone),
};

const sides = (...list: MosaicSide[]): Set<MosaicSide> => new Set(list);

const at = (tiles: readonly (readonly [number, number])[]) => {
  const keys = new Set(tiles.map(([x, z]) => `${x},${z}`));
  return (x: number, z: number): boolean => keys.has(`${x},${z}`);
};

describe('runFit', () => {
  it('lays a corner for two sides at right angles', () => {
    expect(runFit(sides('n', 'e'), PIECES, 0)?.item.id).toBe('hedge-corner');
  });

  it('turns a straight length onto the axis it joins', () => {
    expect(runFit(sides('e', 'w'), PIECES, 1)).toEqual({ item: PIECES[0]!.item, rotation: 0 });
    expect(runFit(sides('n', 's'), PIECES, 0)?.rotation).toBe(1);
  });

  it('lays a lone piece the way it is told', () => {
    expect(runFit(sides(), PIECES, 3)).toEqual({ item: PIECES[1]!.item, rotation: 3 });
  });
});

const styleAt = (x: number, z: number) => (x === 6 ? 'hedge' : z === 6 ? 'stone-wall' : null);

describe('joinedSides', () => {
  it('joins only neighbours of the same style', () => {
    expect(joinedSides({ x: 5, z: 5 }, 'hedge', styleAt)).toEqual(sides('e'));
  });
});

describe('aloneTurn', () => {
  it('follows a path along either axis', () => {
    expect(aloneTurn({ x: 5, z: 5 }, at([[5, 6]]), 1)).toBe(0);
    expect(aloneTurn({ x: 5, z: 5 }, at([[4, 5]]), 0)).toBe(1);
  });

  it('keeps the given turn with paving on both axes or none', () => {
    expect(aloneTurn({ x: 5, z: 5 }, at([]), 3)).toBe(3);
    expect(
      aloneTurn(
        { x: 5, z: 5 },
        at([
          [4, 5],
          [5, 4],
        ]),
        2,
      ),
    ).toBe(2);
  });
});

describe('layRuns', () => {
  const hedge = (x: number, z: number, rotation: 0 | 1) =>
    place(item('hedge'), `hedge:${x},${z}`, x, z, rotation);

  it('ends a row and joins it along the way it was laid, not to a row behind it', () => {
    const laid = layRuns([hedge(1, 1, 0), hedge(2, 1, 0), hedge(3, 1, 0), hedge(2, 2, 0)], KIT);
    expect(laid.map((placement) => placement.id)).toEqual([
      'hedge-end',
      'hedge',
      'hedge-end',
      'hedge-single',
    ]);
    expect(laid[0]!.key).toBe('hedge-end@1,1');
  });

  it('turns a corner where a row along each axis runs into it', () => {
    const along = (x: number, z: number, rotation: 0 | 1) =>
      place(item('hedge'), `hedge:${x},${z}`, x, z, rotation);
    const laid = layRuns([along(1, 1, 0), along(2, 1, 0), along(1, 2, 1), along(1, 3, 1)], KIT);
    expect(laid[0]!.id).toBe('hedge-corner');
    expect(laid.slice(1).map((placement) => placement.id)).toEqual([
      'hedge-end',
      'hedge',
      'hedge-end',
    ]);
  });

  it('leaves what is not a run alone', () => {
    const lamp = place(item('street-lamp'), 'lamp', 1, 1, 0);
    expect(layRuns([lamp], KIT)).toEqual([lamp]);
  });
});
