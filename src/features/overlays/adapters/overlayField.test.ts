import { describe, expect, it } from 'vitest';
import { Matrix4, type InstancedMesh } from 'three/webgpu';
import { NO_ZONE } from '../../sim/domain/zones';
import { buildOverlayField, type OverlayField, type OverlayTile } from './overlayField';

const tileAt = (node: number, x: number): OverlayTile => ({ x, y: 0, z: 0, node });

const meshOf = (field: OverlayField) => field.group.children[0] as InstancedMesh;

function scaleOf(field: OverlayField, slot: number): number {
  const matrix = new Matrix4();
  meshOf(field).getMatrixAt(slot, matrix);
  return matrix.elements[0]!;
}

describe('buildOverlayField', () => {
  it('draws nothing until it is painted', () => {
    const field = buildOverlayField();
    field.place([tileAt(0, 0), tileAt(1, 16)]);
    expect(field.drawCalls).toBe(0);
    expect(field.triangleCount).toBe(0);
    field.dispose();
  });

  it('draws every placed tile in one call once painted, and nothing once cleared', () => {
    const field = buildOverlayField();
    field.place([tileAt(0, 0), tileAt(1, 16), tileAt(2, 32)]);
    field.paint(Float32Array.from([0, 0.5, 1]));
    expect(field.drawCalls).toBe(1);
    expect(field.triangleCount).toBe(6);
    field.paint(null);
    expect(field.drawCalls).toBe(0);
    field.dispose();
  });

  it('shrinks a tile with no data to nothing and colours the rest', () => {
    const field = buildOverlayField();
    field.place([tileAt(1, 0), tileAt(0, 16)]);
    field.paint(Float32Array.from([Number.NaN, 0]));
    expect(scaleOf(field, 0)).toBe(1);
    expect(scaleOf(field, 1)).toBe(0);
    expect(meshOf(field).instanceColor).not.toBeNull();
    field.dispose();
  });

  it('paints zones, hiding an unzoned tile, and nothing once cleared', () => {
    const field = buildOverlayField();
    field.place([tileAt(0, 0), tileAt(1, 16)]);
    field.paintZones(Int8Array.from([NO_ZONE, 2]));
    expect(field.drawCalls).toBe(1);
    expect(scaleOf(field, 0)).toBe(0);
    expect(scaleOf(field, 1)).toBe(1);
    field.paintZones(null);
    expect(field.drawCalls).toBe(0);
    field.dispose();
  });

  it('grows past its first capacity and hides itself until painted again', () => {
    const field = buildOverlayField();
    field.paint(new Float32Array(0));
    const tiles = Array.from({ length: 5000 }, (_, node) => tileAt(node, node * 16));
    field.place(tiles);
    expect(field.drawCalls).toBe(0);
    field.paint(new Float32Array(tiles.length).fill(0.5));
    expect(field.triangleCount).toBe(10_000);
    expect(field.group.children).toHaveLength(1);
    field.dispose();
  });
});
