import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, type Mesh } from 'three/webgpu';
import type { Placement } from '../../layout/domain/resortLayout';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { buildConstructionField } from './constructionField';

/** A geometry of `triangles` degenerate faces, enough to count and to bound. */
function geometryOf(triangles: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles * 9), 3));
  const indices = Uint16Array.from({ length: triangles * 3 }, (_, index) => index);
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/** A model meshed into shaded geometry, and optionally a glowing sign as well. */
function model(id: string, triangles: number, glowing = false): ModelGeometry {
  return {
    id,
    lit: geometryOf(triangles),
    emissive: glowing ? geometryOf(2) : null,
    water: null,
    window: null,
    triangleCount: triangles + (glowing ? 2 : 0),
    unmergedTriangleCount: triangles,
  };
}

const at = (key: string, id: string): Placement => ({
  key,
  id,
  tileX: 0,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x: 32,
  z: 16,
  y: 8,
  width: 16,
  depth: 16,
});

describe('buildConstructionField', () => {
  it('stands nothing until something is being built', () => {
    const field = buildConstructionField([model('cottage', 10)], null);
    expect(field.drawCalls).toBe(0);
    expect(field.triangleCount).toBe(0);
  });

  it('puts up one mesh per surface the model was meshed into', () => {
    const field = buildConstructionField([model('hotel', 10, true)], null);
    field.show(at('hotel#1', 'hotel'), 40, 6);
    expect(field.drawCalls).toBe(2);
    expect(field.triangleCount).toBe(12);
  });

  it('stands the site where the finished building will be', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    field.show(at('cottage#1', 'cottage'), 25, 3);
    const mesh = field.group.children[0] as Mesh;
    expect(mesh.position.toArray()).toEqual([32, 8, 16]);
  });

  it('only moves the line when the same site is shown again', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    const placement = at('cottage#1', 'cottage');
    field.show(placement, 25, 3);
    const first = field.group.children[0];
    field.show(placement, 25, 11);
    expect(field.group.children[0]).toBe(first);
    expect(field.drawCalls).toBe(1);
    expect(first?.userData.reveal).toBe(11);
  });

  it('takes a site down, and says whether there was one', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    field.show(at('cottage#1', 'cottage'), 25, 3);
    expect(field.hide('cottage#1')).toBe(true);
    expect(field.drawCalls).toBe(0);
    expect(field.triangleCount).toBe(0);
    expect(field.hide('cottage#1')).toBe(false);
  });

  it('leaves the catalogue geometry it was handed alone', () => {
    // The geometries are the meshed catalogue's, shared with the instanced
    // world that is still drawing them; Three.js frees a geometry's buffers by
    // the identity of its attributes, so disposing one here would pull the model
    // out from under every finished building of the same type.
    const catalogue = model('cottage', 4);
    const field = buildConstructionField([catalogue], null);
    field.show(at('cottage#1', 'cottage'), 25, 3);
    field.dispose();
    expect(field.group.children).toHaveLength(0);
    expect(catalogue.lit?.getAttribute('position')).toBeDefined();
    expect(catalogue.lit?.getIndex()?.count).toBe(12);
  });

  it('will not build something the catalogue never meshed', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    expect(() => field.show(at('hotel#1', 'hotel'), 40, 3)).toThrow(/hotel/);
  });
});
