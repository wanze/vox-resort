import { describe, expect, it } from 'vitest';
import {
  ADULT_VOXELS,
  ARM_VOXELS,
  CHEST_HALF_WIDTH,
  CHILD_VOXELS,
  handHeight,
  hipHeight,
  shoulderHeight,
} from '../../../../voxel-gen/people/figure.ts';
import guestA from '../../../../voxel-gen/people/guest-a.ts';
import child from '../../../../voxel-gen/people/child.ts';
import { buildModel, type VoxelModelSource } from '../../../../voxel-gen/voxelgen.ts';
import { meshVoxelModel } from '../../model-compare/domain/voxelMesh';
import { PALETTE } from '../../../../voxel-gen/palette.ts';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import { sealFigure, type FigureHeights, type FigureSeams } from './figureLimbs';

interface Figure {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  readonly heights: FigureHeights;
}

// Centred and scaled, as figureGeometry hands the mesh over.
function figureOf(source: VoxelModelSource): Figure {
  const model = buildModel(source);
  const lit = meshVoxelModel(model).surfaces.lit!;
  const scale = model.scale ?? 1;
  const [width, depth] = [model.width * scale, model.depth * scale];
  const positions = lit.positions.map((value, index) => {
    const axis = index % 3;
    if (axis === 0) return value * scale - width / 2;
    if (axis === 2) return value * scale - depth / 2;
    return value * scale;
  });
  const height = model.height * scale;
  return {
    positions,
    colors: lit.colors,
    indices: lit.indices,
    heights: {
      hip: hipHeight(height),
      shoulder: shoulderHeight(height),
      hand: handHeight(height),
      chestHalfWidth: CHEST_HALF_WIDTH,
    },
  };
}

const FIGURES = [
  { source: guestA, height: ADULT_VOXELS },
  { source: child, height: CHILD_VOXELS },
];

interface Facing {
  readonly plus: number;
  readonly minus: number;
}

// Face area on the plane at x, split by which way the winding turns it.
function facingOn(positions: ArrayLike<number>, indices: ArrayLike<number>, x: number): Facing {
  let plus = 0;
  let minus = 0;
  const at = (vertex: number, axis: number): number => positions[vertex * 3 + axis]!;
  for (let first = 0; first < indices.length; first += 3) {
    const [a, b, c] = [0, 1, 2].map((corner) => indices[first + corner]!) as [
      number,
      number,
      number,
    ];
    if (![a, b, c].every((vertex) => Math.abs(at(vertex, 0) - x) < 1e-4)) continue;
    const [uy, uz] = [at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)];
    const [vy, vz] = [at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)];
    const area = (uy * vz - uz * vy) / 2;
    if (area > 0) plus += area;
    else minus -= area;
  }
  return { plus, minus };
}

const toward = (facing: Facing, side: number): number => (side > 0 ? facing.plus : facing.minus);

function sealed(figure: Figure): { seams: FigureSeams; positions: Float32Array } {
  const seams = sealFigure(figure, figure.heights);
  const positions = new Float32Array(figure.positions.length + seams.positions.length);
  positions.set(figure.positions);
  positions.set(seams.positions, figure.positions.length);
  return { seams, positions };
}

describe('sealFigure', () => {
  it('marks both arms from the shoulder to the hand, and nothing else', () => {
    for (const { source } of FIGURES) {
      const figure = figureOf(source);
      const { onArm } = sealFigure(figure, figure.heights);
      const sides = new Set<number>();
      for (let vertex = 0; vertex < figure.positions.length / 3; vertex++) {
        if (onArm[vertex] !== 1) continue;
        const x = figure.positions[vertex * 3]!;
        const y = figure.positions[vertex * 3 + 1]!;
        expect(Math.abs(x), source.id).toBeGreaterThanOrEqual(CHEST_HALF_WIDTH);
        expect(y).toBeGreaterThanOrEqual(figure.heights.hand);
        expect(y).toBeLessThanOrEqual(figure.heights.shoulder);
        sides.add(Math.sign(x));
      }
      expect(sides).toEqual(new Set([-1, 1]));
    }
  });

  it('closes the inner side of each arm, where the mesher culled it against the body', () => {
    for (const { source } of FIGURES) {
      const figure = figureOf(source);
      const { seams, positions } = sealed(figure);
      for (const side of [-1, 1]) {
        const x = side * CHEST_HALF_WIDTH;
        expect(toward(facingOn(figure.positions, figure.indices, x), -side), source.id).toBe(0);
        // One voxel deep, the whole arm's length.
        expect(toward(facingOn(positions, seams.indices, x), -side), source.id).toBeCloseTo(
          ARM_VOXELS,
          5,
        );
      }
    }
  });

  it('closes the side of the body behind each arm, chest and thigh', () => {
    for (const { source, height } of FIGURES) {
      const figure = figureOf(source);
      const { seams, positions } = sealed(figure);
      // The chest is two deep and the thigh one, each whole once the arm swings away.
      const hip = hipHeight(height);
      const whole = 2 * (shoulderHeight(height) - hip) + hip;
      for (const side of [-1, 1]) {
        const x = side * CHEST_HALF_WIDTH;
        const culled = facingOn(figure.positions, figure.indices, x);
        const closed = facingOn(positions, seams.indices, x);
        expect(toward(closed, side) - toward(culled, side), source.id).toBeCloseTo(ARM_VOXELS, 5);
        expect(toward(closed, side), source.id).toBeCloseTo(whole, 5);
      }
    }
  });

  it('colours the body behind the arm as the part it closes, shirt or trousers', () => {
    const figure = figureOf(guestA);
    const { seams, positions } = sealed(figure);
    const count = figure.positions.length / 3;
    const colorOf = (vertex: number): number[] =>
      Array.from(figure.colors.subarray(vertex * 3, vertex * 3 + 3));
    const shirt = linearRgbOf(PALETTE.stucco.base);
    const trousers = linearRgbOf(PALETTE.slate.shade);
    let checked = 0;
    for (let first = figure.indices.length; first < seams.indices.length; first += 3) {
      const corners = [0, 1, 2].map((corner) => seams.indices[first + corner]!);
      if (corners.some((vertex) => seams.onArm[vertex] === 1)) continue;
      const y = corners.reduce((sum, vertex) => sum + positions[vertex * 3 + 1]!, 0) / 3;
      const expected = y < figure.heights.hip ? trousers : shirt;
      for (const vertex of corners) {
        const color = colorOf(seams.templates[vertex - count]!);
        color.forEach((channel, index) => expect(channel).toBeCloseTo(expected[index]!, 5));
      }
      checked++;
    }
    expect(checked).toBe(8);
  });

  it('leaves a mesh with nothing hanging in the arm’s band as it is', () => {
    const positions = Float32Array.from([-1.5, 0, 0, -1.5, 7, 0, -1.5, 7, 1]);
    const seams = sealFigure(
      { positions, indices: [0, 1, 2] },
      { hip: 3, shoulder: 5, hand: 2, chestHalfWidth: CHEST_HALF_WIDTH },
    );
    expect(seams.templates).toHaveLength(0);
    expect([...seams.indices]).toEqual([0, 1, 2]);
    expect([...seams.onArm]).toEqual([0, 0, 0]);
  });
});
