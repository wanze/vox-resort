import { describe, expect, it } from 'vitest';
import { Matrix4, type InstancedMesh } from 'three/webgpu';
import { skyStateFor } from '../../lighting/domain/dayNight';
import type { BlobShadow } from '../domain/blobShadows';
import { buildBlobShadowField, type BlobShadowField } from './blobShadowField';

const blobAt = (key: string, x: number, z = 0): BlobShadow => ({
  key,
  x,
  z,
  y: 0,
  halfWidth: 1,
  halfDepth: 1,
  height: 6,
});

const meshOf = (field: BlobShadowField) => field.group.children[0] as InstancedMesh;

function drawnX(field: BlobShadowField): number[] {
  const mesh = meshOf(field);
  const matrix = new Matrix4();
  return Array.from({ length: mesh.count }, (_, slot) => {
    mesh.getMatrixAt(slot, matrix);
    return matrix.elements[12]!;
  });
}

describe('buildBlobShadowField', () => {
  it('builds an empty field that draws nothing', () => {
    const field = buildBlobShadowField([]);
    expect(field.count).toBe(0);
    expect(field.drawCalls).toBe(0);
    field.dispose();
  });

  it('draws every shadow it was built with in one call', () => {
    const field = buildBlobShadowField([blobAt('a', 0), blobAt('b', 10), blobAt('c', 20)]);
    expect(field.count).toBe(3);
    expect(field.drawCalls).toBe(1);
    expect(field.triangleCount).toBe(6);
    field.dispose();
  });

  it('takes a shadow away by its key', () => {
    const field = buildBlobShadowField([blobAt('a', 0), blobAt('b', 10), blobAt('c', 20)]);
    expect(field.remove('b')).toBe(true);
    expect(field.count).toBe(2);
    expect(field.triangleCount).toBe(4);
    field.dispose();
  });

  it('says so when nothing was cast under a key', () => {
    const field = buildBlobShadowField([blobAt('a', 0)]);
    expect(field.remove('nobody')).toBe(false);
    expect(field.count).toBe(1);
    field.dispose();
  });

  it('takes away the last shadow added without moving any other', () => {
    const field = buildBlobShadowField([blobAt('a', 0), blobAt('b', 10)]);
    field.add(blobAt('c', 20));
    expect(field.remove('c')).toBe(true);
    expect(drawnX(field)).toEqual([0, 10]);
    field.dispose();
  });

  it('fills the hole a removal leaves with the last shadow, and can still find it', () => {
    const field = buildBlobShadowField([blobAt('a', 0), blobAt('b', 10), blobAt('c', 20)]);
    field.remove('b');
    expect(drawnX(field)).toEqual([0, 20]);
    expect(field.remove('c')).toBe(true);
    expect(field.remove('a')).toBe(true);
    expect(field.count).toBe(0);
    expect(field.drawCalls).toBe(0);
    field.dispose();
  });

  it('keeps one shadow for a tile that is lifted and laid again, however often', () => {
    const field = buildBlobShadowField([blobAt('bank', 0), blobAt('deck', 10)]);
    for (let pass = 0; pass < 4; pass++) {
      field.remove('bank');
      field.add(blobAt('bank', 0));
    }
    expect(field.count).toBe(2);
    expect(drawnX(field).toSorted((a, b) => a - b)).toEqual([0, 10]);
    field.dispose();
  });

  it('uploads both the moved shadow and the added one when they land in the same frame', () => {
    // Three.js keeps an instance matrix's update ranges until replaced, so a range
    // covering only the add would leave the removed quad drawn.
    const field = buildBlobShadowField([blobAt('a', 0), blobAt('b', 10), blobAt('c', 20)]);
    field.remove('a');
    field.add(blobAt('a', 0));
    const ranges = meshOf(field).instanceMatrix.updateRanges;
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.start).toBeLessThanOrEqual(0);
    expect(ranges[0]!.start + ranges[0]!.count).toBeGreaterThanOrEqual(3 * 16);
    field.dispose();
  });

  it('reshapes what is left after a removal when the sun moves', () => {
    const field = buildBlobShadowField([blobAt('a', 0), blobAt('b', 10), blobAt('c', 20)]);
    field.remove('a');
    expect(() => field.applySky(skyStateFor(0.35))).not.toThrow();
    expect(field.count).toBe(2);
    expect(meshOf(field).count).toBe(2);
    field.dispose();
  });
});
