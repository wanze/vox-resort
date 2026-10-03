import { describe, expect, it } from 'vitest';
import type { ModelNameplate } from '../../../../voxel-gen/voxelgen.ts';
import { letteringFor, pixelOf } from './lettering';
import { setLine } from './signFont';

const FRONT = { surface: 10, outward: 1 } as const;
const BACK = { surface: 5, outward: -1 } as const;

// The original entrance's board: 24 × 3 voxels.
const PLATE: ModelNameplate = {
  x0: 20,
  x1: 43,
  y0: 30,
  y1: 32,
  faces: [FRONT, BACK],
  ink: 0x3a2a1c,
};

const facing = (face: ModelNameplate['faces'][number]): ModelNameplate => ({
  ...PLATE,
  faces: [face],
});

const vertices = (positions: Float32Array): (readonly [number, number, number])[] =>
  Array.from({ length: positions.length / 3 }, (_, at) => [
    positions[at * 3]!,
    positions[at * 3 + 1]!,
    positions[at * 3 + 2]!,
  ]);

const pointKey = ([x, y, z]: readonly [number, number, number]): string =>
  `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

const runCount = (text: string): number => {
  const line = setLine(text);
  let runs = 0;
  for (let at = 0; at < line.cells.length; at++) {
    const startsRow = at % line.width === 0;
    if (line.cells[at] === 1 && (startsRow || line.cells[at - 1] === 0)) runs++;
  }
  return runs;
};

describe('letteringFor', () => {
  it('draws nothing for an empty name', () => {
    const empty = letteringFor(setLine(''), PLATE);
    expect(empty.triangleCount).toBe(0);
    expect(empty.positions).toHaveLength(0);
  });

  it('keeps every letter on the board and in the layer in front of it', () => {
    for (const face of PLATE.faces) {
      const front = face.outward === 1 ? [11, 12] : [4, 5];
      for (const [x, y, z] of vertices(
        letteringFor(setLine('Coral Cove'), facing(face)).positions,
      )) {
        expect(x).toBeGreaterThanOrEqual(PLATE.x0 - 1e-6);
        expect(x).toBeLessThanOrEqual(PLATE.x1 + 1 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(PLATE.y0 - 1e-6);
        expect(y).toBeLessThanOrEqual(PLATE.y1 + 1 + 1e-6);
        expect(z).toBeGreaterThanOrEqual(front[0]! - 1e-6);
        expect(z).toBeLessThanOrEqual(front[1]! + 1e-6);
      }
    }
  });

  it('sets a long name finer than a short one, and never coarser than a voxel', () => {
    const short = pixelOf(setLine('Coral Cove'), PLATE);
    const long = pixelOf(setLine('Seashell Springs Harbour'), PLATE);
    expect(short).toBeCloseTo(0.6);
    expect(long).toBeLessThan(short);
    expect(pixelOf(setLine('I'), { ...PLATE, y1: PLATE.y0 + 9 })).toBe(1);
  });

  it('mirrors the face seen from -z, so it reads left to right from there', () => {
    const line = setLine('Lido 7');
    const front = vertices(letteringFor(line, facing(FRONT)).positions);
    const back = vertices(letteringFor(line, facing(BACK)).positions);
    // Turned about the board's centre line, and from the front of one face to the front of the other.
    const turned = front.map(
      ([x, y, z]) =>
        [PLATE.x0 + PLATE.x1 + 1 - x, y, FRONT.surface + 1 + BACK.surface - z] as const,
    );
    expect(new Set(back.map(pointKey))).toEqual(new Set(turned.map(pointKey)));
  });

  it('draws ten triangles for each run of letter pixels on each face', () => {
    const text = 'Café del Mar & Co';
    expect(letteringFor(setLine(text), PLATE).triangleCount).toBe(10 * runCount(text) * 2);
  });
});
