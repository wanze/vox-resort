// Plain meshes, not instances: there is rarely more than one site at a time. The cut is
// per fragment because merged quads span many voxels, so hiding vertices would drop a
// whole wall. The height rides on each mesh's userData so one material draws every site.

import { DoubleSide, Group, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { floor, fract, positionGeometry, sin, userData, vertexStage } from 'three/tsl';
import type { BufferGeometry, Node, NodeMaterial } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotationRadians, turnedOrigin } from '../../layout/domain/rotation';
import { litMaterial } from '../../rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { FOUNDATION_VOXELS, GRAIN_VOXELS, leadVoxels } from '../domain/construction';

export interface ConstructionField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  show(placement: Placement, height: number, reveal: number): void;
  hide(key: string): boolean;
  dispose(): void;
}

const hashOf = (value: Node<'float'>): Node<'float'> => fract(sin(value).mul(43758.5453));

// userData() is typed as returning an untyped node; the value is always a number.
const userFloat = (name: string): Node<'float'> =>
  userData(name, 'float') as unknown as Node<'float'>;

// The hashes are subtracted from the line, so the reveal must travel past the model top
// before a building is whole. maskNode rather than an alpha test: it discards early and
// the shadow pass honours it.
function cut<T extends NodeMaterial>(material: T): T {
  // Model space, so one material serves every building at every rotation.
  const local = vertexStage(positionGeometry);
  const column = floor(local.xz);
  const lead = hashOf(column.x.mul(12.9898).add(column.y.mul(78.233)));
  const cell = floor(local);
  const grain = hashOf(cell.x.mul(31.7).add(cell.y.mul(17.3)).add(cell.z.mul(57.1)));

  const reveal = userFloat('reveal');
  const line = reveal
    .sub(lead.mul(userFloat('lead')))
    .sub(grain.mul(GRAIN_VOXELS))
    // The slab is never held back, or the first second of a build reads as a misclick.
    .max(FOUNDATION_VOXELS);
  material.maskNode = local.y.lessThan(line);
  // The mesher never emitted faces inside a wall, so a cut shell is see-through from above.
  material.side = DoubleSide;
  return material;
}

// A site has no lit windows or water yet, so only the shaded surface needs the resort material.
const SURFACES = [
  { kind: 'lit', of: (model: ModelGeometry) => model.lit, shaded: true },
  { kind: 'glow', of: (model: ModelGeometry) => model.emissive, shaded: false },
  { kind: 'water', of: (model: ModelGeometry) => model.water, shaded: false },
  { kind: 'window', of: (model: ModelGeometry) => model.window, shaded: false },
] as const;

const trianglesOf = (geometry: BufferGeometry): number => (geometry.getIndex()?.count ?? 0) / 3;

export function buildConstructionField(
  geometries: readonly ModelGeometry[],
  lightVolume: BakedLightVolume | null,
): ConstructionField {
  const group = new Group();
  group.name = 'construction';

  const lit = cut(litMaterial(lightVolume));
  const unlit = cut(new MeshBasicNodeMaterial({ vertexColors: true }));

  const modelById = new Map(geometries.map((entry) => [entry.id, entry]));
  const sites = new Map<string, Mesh[]>();
  let triangleCount = 0;

  const pitch = (
    surface: (typeof SURFACES)[number],
    geometry: BufferGeometry,
    placement: Placement,
    height: number,
    reveal: number,
  ): Mesh => {
    const mesh = new Mesh(geometry, surface.shaded ? lit : unlit);
    mesh.name = `building-${placement.key}-${surface.kind}`;
    // Written before the first draw: a reference node infers its uniform type from the first
    // object the material is compiled for.
    mesh.userData.reveal = reveal;
    mesh.userData.lead = leadVoxels(height);
    // The same matrix instancedWorld.ts writes for a finished placement, so the building does
    // not step sideways when done.
    const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
    mesh.rotation.y = rotationRadians(placement.rotation);
    mesh.position.set(placement.x + origin.x, placement.y, placement.z + origin.z);
    group.add(mesh);
    triangleCount += trianglesOf(geometry);
    return mesh;
  };

  const raise = (placement: Placement, height: number, reveal: number): Mesh[] => {
    const model = modelById.get(placement.id);
    if (!model) throw new Error(`No geometry was meshed for object type "${placement.id}"`);
    const standing: Mesh[] = [];
    for (const surface of SURFACES) {
      const geometry = surface.of(model);
      if (geometry) standing.push(pitch(surface, geometry, placement, height, reveal));
    }
    return standing;
  };

  return {
    group,
    get drawCalls() {
      return group.children.length;
    },
    get triangleCount() {
      return triangleCount;
    },
    show(placement, height, reveal) {
      const standing = sites.get(placement.key) ?? raise(placement, height, reveal);
      sites.set(placement.key, standing);
      for (const mesh of standing) mesh.userData.reveal = reveal;
    },
    hide(key) {
      const standing = sites.get(key);
      if (!standing) return false;
      for (const mesh of standing) {
        group.remove(mesh);
        triangleCount -= trianglesOf(mesh.geometry);
      }
      sites.delete(key);
      return true;
    },
    dispose() {
      group.clear();
      sites.clear();
      triangleCount = 0;
      lit.dispose();
      unlit.dispose();
      // Never dispose these geometries: they are shared with the instanced world, and Three.js
      // frees buffers by attribute identity, which would pull every finished building of the type.
    },
  };
}
