import { describe, expect, it } from 'vitest';
import { BRIDGE_VOXELS, PAVING_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { BRIDGE_ID, BRIDGE_RAMP_ID, JETTY_ID, PATH_ID } from './resortPlan';
import type { Tile } from './resortLayout';
import { spanAt, spanTilesFor, type SpanProvider } from './spans';

const tiles = (...pairs: readonly [number, number][]): Tile[] => pairs.map(([x, z]) => ({ x, z }));

/** Water a bridge would be raised over, on the listed tiles and nowhere else. */
const waterOn =
  (...on: readonly [number, number][]): SpanProvider =>
  (x, z) =>
    on.some(([wx, wz]) => wx === x && wz === z);

/** Paving on the listed tiles and nowhere else. */
const pavedOn =
  (...on: readonly [number, number][]) =>
  (x: number, z: number): boolean =>
    on.some(([px, pz]) => px === x && pz === z);

/** A channel two tiles wide running down x, crossed from west to east at `z`. */
const CHANNEL = waterOn([1, 0], [2, 0]);
const CROSSING: readonly [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
];

describe('spanAt', () => {
  it('makes a tile with a paved bank beside it the ramp, facing that bank', () => {
    const span = spanAt({ x: 1, z: 0 }, pavedOn(...CROSSING), CHANNEL);
    // Unturned the ramp comes ashore to the north, and a turn of one swings that
    // face west — the bank at x = 0 is west of this tile.
    expect(span).toEqual({ tile: { x: 1, z: 0 }, rotation: 1, kind: 'ramp' });
  });

  it('faces the bank whichever side of the span it is on', () => {
    const facing = (bank: [number, number], rotation: number): void => {
      const span = spanAt({ x: 1, z: 1 }, pavedOn(bank, [1, 1]), waterOn([1, 1]));
      expect({ bank, span }).toEqual({
        bank,
        span: { tile: { x: 1, z: 1 }, rotation, kind: 'ramp' },
      });
    };
    facing([1, 0], 0);
    facing([0, 1], 1);
    facing([1, 2], 2);
    facing([2, 1], 3);
  });

  it('makes a tile with span on both sides the deck, turned along the crossing', () => {
    const wide = waterOn([1, 0], [2, 0], [3, 0]);
    const paved = pavedOn([0, 0], [1, 0], [2, 0], [3, 0], [4, 0]);
    const span = spanAt({ x: 2, z: 0 }, paved, wide);
    // A deck is symmetric about its axis, so only the axis is read off the turn:
    // one and three are the same run, laid along x.
    expect({ kind: span.kind, axis: span.rotation % 2 }).toEqual({ kind: 'deck', axis: 1 });
  });

  it('reads the crossing axis off the span on both sides, not the lane beside it', () => {
    // A crossing two tiles wide over a channel three across: the middle tile of
    // one lane has span on both sides along the crossing and span on one side
    // across it, and the run is the pair.
    const wide = waterOn([1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [3, 1]);
    const paved = pavedOn(
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    );
    const span = spanAt({ x: 2, z: 0 }, paved, wide);
    expect({ kind: span.kind, axis: span.rotation % 2 }).toEqual({ kind: 'deck', axis: 1 });
  });

  it('lays a span with nothing paved around it yet unturned, as a deck', () => {
    const span = spanAt({ x: 1, z: 0 }, pavedOn([1, 0]), CHANNEL);
    expect(span).toEqual({ tile: { x: 1, z: 0 }, rotation: 0, kind: 'deck' });
  });

  it('picks one bank for a ditch a single tile across, north first', () => {
    // One tile cannot come ashore twice. Which bank it picks is a fact about the
    // compass order rather than about the order the tiles were paved in, exactly
    // as an L-bend on a terrace step is. See `stairs.ts`.
    const ditch = waterOn([1, 1]);
    const paved = pavedOn([1, 0], [1, 1], [1, 2]);
    expect(spanAt({ x: 1, z: 1 }, paved, ditch).rotation).toBe(0);
  });
});

describe('spanTilesFor', () => {
  it('finds nothing on a plot with no water under its paving', () => {
    expect(spanTilesFor(tiles([0, 0], [1, 0]), () => false)).toEqual([]);
  });

  it('makes a two-tile crossing two ramps meeting head to head', () => {
    const spans = spanTilesFor(tiles(...CROSSING), CHANNEL);
    expect(spans).toEqual([
      { tile: { x: 1, z: 0 }, rotation: 1, kind: 'ramp' },
      { tile: { x: 2, z: 0 }, rotation: 3, kind: 'ramp' },
    ]);
  });

  it('puts a deck between the ramps once the crossing is three tiles long', () => {
    const wide = waterOn([1, 0], [2, 0], [3, 0]);
    const spans = spanTilesFor(tiles([0, 0], [1, 0], [2, 0], [3, 0], [4, 0]), wide);
    expect(spans.map((span) => span.kind)).toEqual(['ramp', 'deck', 'ramp']);
  });

  it('does not depend on the order the tiles came in', () => {
    const forward = spanTilesFor(tiles(...CROSSING), CHANNEL);
    const backward = spanTilesFor(tiles(...CROSSING).toReversed(), CHANNEL);
    expect(backward.toReversed()).toEqual(forward);
  });
});

describe('the bridge models', () => {
  it('stands the deck a metre above the paving that runs into it', () => {
    // The contract the art is authored to, and the whole point of the pair: a
    // bridge is the one paving raised above the ground it is laid on. Its
    // parapets are railings of their own, so the deck's top is its planking.
    expect(objectTypeById(BRIDGE_ID).model.height).toBe(BRIDGE_VOXELS);
    expect(objectTypeById(PATH_ID).model.height).toBe(PAVING_VOXELS);
    expect(BRIDGE_VOXELS).toBeGreaterThan(PAVING_VOXELS);
  });

  it('climbs the ramp to exactly the height the deck runs at', () => {
    // Both are drawn from the same part, so the two models are as tall as each
    // other exactly when the top tread is the deck.
    expect(objectTypeById(BRIDGE_RAMP_ID).model.height).toBe(
      objectTypeById(BRIDGE_ID).model.height,
    );
  });

  it('leaves the pier flat on the water, which is what a jetty is', () => {
    expect(objectTypeById(JETTY_ID).model.height).toBe(PAVING_VOXELS);
  });

  it('fills the tile each of them claims, so a crossing has no gap in it', () => {
    for (const id of [BRIDGE_ID, BRIDGE_RAMP_ID]) {
      const { model } = objectTypeById(id);
      expect({ id, tiles: model.tiles, width: model.width, depth: model.depth }).toEqual({
        id,
        tiles: { x: 1, z: 1 },
        width: 16,
        depth: 16,
      });
    }
  });

  it('is never offered on the build palette: the ground lays both', () => {
    for (const id of [BRIDGE_ID, BRIDGE_RAMP_ID]) {
      expect({ id, decides: objectTypeById(id).model.groundDecides }).toEqual({
        id,
        decides: true,
      });
    }
  });
});
