import { describe, expect, it } from 'vitest';
import { Matrix4, type InstancedMesh } from 'three/webgpu';
import type { HighlightBox } from '../domain/highlights';
import { buildHighlightField, type HighlightField } from './highlightField';

const box = (tileX: number, colour = 0): HighlightBox => ({
  tileX,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  y: 4,
  colour,
});

const meshOf = (field: HighlightField) => field.group.children[0] as InstancedMesh;

function stripAt(field: HighlightField, slot: number): number[] {
  const matrix = new Matrix4();
  meshOf(field).getMatrixAt(slot, matrix);
  return matrix.elements;
}

describe('buildHighlightField', () => {
  it('draws nothing until a ring width is known', () => {
    const field = buildHighlightField();
    field.show([box(0), box(2)]);
    expect(field.drawCalls).toBe(0);
    field.widen(4);
    expect(field.drawCalls).toBe(1);
    expect(field.triangleCount).toBe(16);
    field.dispose();
  });

  it('draws nothing once there is nothing to show', () => {
    const field = buildHighlightField();
    field.widen(4);
    field.show([box(0)]);
    field.show([]);
    expect(field.drawCalls).toBe(0);
    field.dispose();
  });

  it('rewrites the strips when the ring widens', () => {
    const field = buildHighlightField();
    field.widen(2);
    field.show([box(0)]);
    expect(stripAt(field, 0)[10]).toBe(2);
    field.widen(8);
    expect(stripAt(field, 0)[10]).toBe(8);
    expect(stripAt(field, 0)[13]).toBeCloseTo(6.2);
    field.dispose();
  });

  it('grows past its first capacity', () => {
    const field = buildHighlightField();
    field.widen(2);
    field.show(Array.from({ length: 300 }, (_, at) => box(at, at % 6)));
    expect(field.triangleCount).toBe(300 * 4 * 2);
    field.dispose();
  });
});
