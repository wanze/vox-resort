import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Vector3, type Mesh } from 'three/webgpu';
import type { Placement } from '../../layout/domain/resortLayout';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { buildConstructionField } from './constructionField';

function geometryOf(triangles: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles * 9), 3));
  const indices = Uint16Array.from({ length: triangles * 3 }, (_, index) => index);
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

function model(id: string, triangles: number, glowing = false): ModelGeometry {
  return {
    id,
    lit: geometryOf(triangles),
    emissive: glowing ? geometryOf(2) : null,
    water: null,
    window: null,
    canopy: null,
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

const meshesOf = (field: ReturnType<typeof buildConstructionField>): Mesh[] => {
  const meshes: Mesh[] = [];
  field.group.traverse((child) => {
    if ((child as Mesh).isMesh && child.name.startsWith('building-')) meshes.push(child as Mesh);
  });
  return meshes;
};

describe('buildConstructionField', () => {
  it('stands nothing until something is being built', () => {
    const field = buildConstructionField([model('cottage', 10)], null);
    expect(field.drawCalls).toBe(0);
    expect(field.triangleCount).toBe(0);
  });

  it('puts up one mesh per surface the model was meshed into', () => {
    const field = buildConstructionField([model('hotel', 10, true)], null);
    field.show(at('hotel#1', 'hotel'), 40, 6, 0.9);
    expect(field.drawCalls).toBe(2);
    expect(field.triangleCount).toBe(12);
  });

  it('stands the site where the finished building will be', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    field.show(at('cottage#1', 'cottage'), 25, 3, 0.9);
    field.group.updateMatrixWorld(true);
    const mesh = meshesOf(field)[0]!;
    expect(mesh.getWorldPosition(new Vector3()).toArray()).toEqual([32, 8, 16]);
  });

  it('only moves the line and the grey when the same site is shown again', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    const placement = at('cottage#1', 'cottage');
    field.show(placement, 25, 3, 0.9);
    const first = meshesOf(field)[0];
    field.show(placement, 25, 11, 0.5);
    expect(meshesOf(field)[0]).toBe(first);
    expect(field.drawCalls).toBe(1);
    expect(first?.userData.paint).toBe(11);
    expect(first?.userData.grey).toBe(0.5);
  });

  it('takes a site down, and says whether there was one', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    field.show(at('cottage#1', 'cottage'), 25, 3, 0.9);
    expect(field.hide('cottage#1')).toBe(true);
    expect(field.drawCalls).toBe(0);
    expect(field.triangleCount).toBe(0);
    expect(field.hide('cottage#1')).toBe(false);
  });

  it('hands an opened building back once its nod is over, in full colour', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    const placement = at('cottage#1', 'cottage');
    field.show(placement, 25, 40, 0.9);
    field.open(placement);
    expect(meshesOf(field)[0]?.userData.grey).toBe(0);
    expect(field.advance(0.05)).toEqual([]);
    let done: readonly string[] = [];
    for (let frame = 0; frame < 20 && done.length === 0; frame++) done = field.advance(0.05);
    expect(done).toEqual(['cottage#1']);
    expect(meshesOf(field)).toHaveLength(0);
  });

  it('keeps a site that has not been opened however long it stands', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    field.show(at('cottage#1', 'cottage'), 25, 3, 0.9);
    for (let frame = 0; frame < 100; frame++) expect(field.advance(0.1)).toEqual([]);
    expect(meshesOf(field)).toHaveLength(1);
  });

  it('nods from the middle of the footprint, so the building does not slide', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    const placement = at('cottage#1', 'cottage');
    field.show(placement, 25, 40, 0.9);
    field.open(placement);
    field.advance(0.1);
    const pivot = meshesOf(field)[0]!.parent!;
    expect(pivot.position.toArray()).toEqual([40, 8, 24]);
    expect(pivot.scale.y).not.toBe(1);
  });

  it('leaves the catalogue geometry it was handed alone', () => {
    // Three.js frees buffers by attribute identity, so disposing this shared geometry would pull it out
    // from under every finished building of the same type.
    const catalogue = model('cottage', 4);
    const field = buildConstructionField([catalogue], null);
    field.show(at('cottage#1', 'cottage'), 25, 3, 0.9);
    field.dispose();
    expect(field.group.children).toHaveLength(0);
    expect(catalogue.lit?.getAttribute('position')).toBeDefined();
    expect(catalogue.lit?.getIndex()?.count).toBe(12);
  });

  it('will not build something the catalogue never meshed', () => {
    const field = buildConstructionField([model('cottage', 4)], null);
    expect(() => field.show(at('hotel#1', 'hotel'), 40, 3, 0.9)).toThrow(/hotel/);
  });
});
