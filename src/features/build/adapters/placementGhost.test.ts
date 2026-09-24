import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, type Mesh } from 'three/webgpu';
import { place, type LayoutItem } from '../../layout/domain/resortLayout';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { createPlacementGhost } from './placementGhost';

function geometry(): BufferGeometry {
  const buffer = new BufferGeometry();
  buffer.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  buffer.setIndex(new BufferAttribute(Uint16Array.from([0, 1, 2]), 1));
  return buffer;
}

function model(id: string, lit: BufferGeometry | null): ModelGeometry {
  return {
    id,
    lit,
    emissive: null,
    water: null,
    window: null,
    triangleCount: 1,
    unmergedTriangleCount: 2,
  };
}

const COTTAGE: LayoutItem = { id: 'cottage', tilesX: 2, tilesZ: 3, width: 32, depth: 44 };
const TORCH: LayoutItem = { id: 'tikitorch', tilesX: 1, tilesZ: 1, width: 16, depth: 16 };

const meshes = (ghost: { group: { children: readonly unknown[] } }) =>
  ghost.group.children as [Mesh, Mesh];

describe('createPlacementGhost', () => {
  it('stands the model where the placement puts it', () => {
    const lit = geometry();
    const ghost = createPlacementGhost([model('cottage', lit)]);
    const placement = place(COTTAGE, 'cottage@4,5', 4, 5);
    ghost.show(placement, false);

    const [pad, object] = meshes(ghost);
    expect(object.visible).toBe(true);
    expect(object.geometry).toBe(lit);
    expect(object.position.x).toBe(placement.x);
    expect(object.position.z).toBe(placement.z);
    expect(pad.scale.x).toBe(2);
    expect(pad.scale.z).toBe(3);
    expect(pad.position.x).toBe((4 + 1) * 16);
    expect(pad.position.z).toBe((5 + 1.5) * 16);
    ghost.dispose();
  });

  it('turns the preview the way the object would go down', () => {
    const ghost = createPlacementGhost([model('cottage', geometry())]);
    const placement = place(COTTAGE, 'cottage@4,5', 4, 5, 1);
    ghost.show(placement, false);

    const [pad, object] = meshes(ghost);
    expect(object.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(object.position.x).toBe(placement.x);
    expect(object.position.z).toBe(placement.z + placement.depth);
    expect([pad.scale.x, pad.scale.z]).toEqual([3, 2]);
    ghost.dispose();
  });

  it('draws a refused placement in its own colours', () => {
    const ghost = createPlacementGhost([model('cottage', geometry())]);
    const placement = place(COTTAGE, 'cottage@0,0', 0, 0);
    ghost.show(placement, false);
    const [pad, object] = meshes(ghost);
    const allowed = { pad: pad.material, object: object.material };

    ghost.show(placement, true);
    expect(pad.material).not.toBe(allowed.pad);
    expect(object.material).not.toBe(allowed.object);
    ghost.dispose();
  });

  it('shows the footprint alone for a model with nothing shaded to draw', () => {
    const ghost = createPlacementGhost([model('tikitorch', null)]);
    ghost.show(place(TORCH, 'tikitorch@1,1', 1, 1), false);
    const [pad, object] = meshes(ghost);
    expect(object.visible).toBe(false);
    expect(pad.position.x).toBe(24);
    ghost.dispose();
  });

  it('marks what the bulldozer would take with its footprint alone, drawn through it', () => {
    const ghost = createPlacementGhost([model('cottage', geometry())]);
    const placement = place(COTTAGE, 'cottage@4,5', 4, 5);
    ghost.show(placement, true);
    const [pad, object] = meshes(ghost);
    const refused = pad.material;

    ghost.showRemoval(placement);
    expect(object.visible).toBe(false);
    expect(ghost.group.visible).toBe(true);
    expect([pad.scale.x, pad.scale.z]).toEqual([2, 3]);
    expect(pad.material).not.toBe(refused);
    expect((pad.material as { depthTest: boolean }).depthTest).toBe(false);
    ghost.dispose();
  });

  it('hides itself entirely once the pointer leaves the ground', () => {
    const ghost = createPlacementGhost([model('cottage', geometry())]);
    ghost.show(place(COTTAGE, 'cottage@0,0', 0, 0), false);
    ghost.hide();
    expect(ghost.group.visible).toBe(false);
    expect(meshes(ghost)[1].visible).toBe(false);
    ghost.dispose();
  });

  it("leaves the catalogue's geometry for the world to dispose", () => {
    const lit = geometry();
    const ghost = createPlacementGhost([model('cottage', lit)]);
    ghost.show(place(COTTAGE, 'cottage@0,0', 0, 0), false);
    ghost.dispose();
    // Disposing geometry Three.js still holds would strip the model from the scene.
    expect(lit.getAttribute('position')).toBeDefined();
  });
});
