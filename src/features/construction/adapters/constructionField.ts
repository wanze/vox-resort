// Plain meshes, not instances: there is rarely more than one site at a time. The paint is
// per fragment because merged quads span many voxels, so colouring by vertex would paint a
// whole wall. The line rides on each mesh's userData so one material draws every site.

import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import {
  attribute,
  floor,
  fract,
  luminance,
  mix,
  positionGeometry,
  sin,
  step,
  userData,
  vec3,
  vec4,
  vertexColor,
  vertexStage,
} from 'three/tsl';
import type { BufferGeometry, Node, NodeMaterial } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotateExtent, rotationRadians, turnedOrigin } from '../../layout/domain/rotation';
import { litMaterial } from '../../rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { GRAIN_VOXELS, leadVoxels, POP_SECONDS, popStretchAt } from '../domain/construction';
import {
  createDustBuffer,
  MAX_GRAINS,
  puffOf,
  settleDust,
  stirDust,
  writeDust,
  type DustBuffer,
  type Puff,
} from '../domain/dust';

export interface ConstructionField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  // Coloured up to `paint` voxels; above it, grey from 0, its own colours, to 1, stone grey.
  show(placement: Placement, height: number, paint: number, grey: number): void;
  // A site shown whole gives its nod and a puff of dust, then is handed back by advance.
  open(placement: Placement): void;
  // The keys whose nod is over, taken down: the world draws them from now on.
  advance(dt: number): readonly string[];
  hide(key: string): boolean;
  dispose(): void;
}

// A backgrounded tab reports its whole absence as one frame.
const MAX_STEP = 0.1;

const hashOf = (value: Node<'float'>): Node<'float'> => fract(sin(value).mul(43758.5453));

// userData() is typed as returning an untyped node; the value is always a number.
const userFloat = (name: string): Node<'float'> =>
  userData(name, 'float') as unknown as Node<'float'>;

// A touch warm, so a greyed building reads as fresh plaster and dust sheets rather than as a
// missing texture.
const DUST = vec3(1, 0.97, 0.9);

// The hashes are subtracted from the line, so it must travel past the model top before the
// building is all colour. The vertex colours are mixed here rather than by the material, which
// would multiply them in a second time.
function painted<T extends NodeMaterial>(material: T, keep: Node<'bool'> | null = null): T {
  // Model space, so one material serves every building at every rotation.
  const local = vertexStage(positionGeometry);
  const column = floor(local.xz);
  const lead = hashOf(column.x.mul(12.9898).add(column.y.mul(78.233)));
  const cell = floor(local);
  const grain = hashOf(cell.x.mul(31.7).add(cell.y.mul(17.3)).add(cell.z.mul(57.1)));
  const line = userFloat('paint')
    .sub(lead.mul(userFloat('lead')))
    .sub(grain.mul(GRAIN_VOXELS));
  const above = step(line, local.y);
  const colour = vertexColor();
  const dust = vec3(luminance(colour.rgb)).mul(DUST);
  material.colorNode = vec4(mix(colour.rgb, dust, userFloat('grey').mul(above)), 1);
  material.vertexColors = false;
  if (keep) material.maskNode = keep;
  return material;
}

// A site has no lit windows or water yet, so only the shaded surface needs the resort material.
// A parasol goes up open, whatever the hour: furling is the finished world's business.
const SURFACES = [
  { kind: 'lit', of: (model: ModelGeometry) => model.lit, shaded: true },
  { kind: 'glow', of: (model: ModelGeometry) => model.emissive, shaded: false },
  { kind: 'water', of: (model: ModelGeometry) => model.water, shaded: false },
  { kind: 'window', of: (model: ModelGeometry) => model.window, shaded: false },
  { kind: 'canopy', of: (model: ModelGeometry) => model.canopy, shaded: true },
] as const;

const trianglesOf = (geometry: BufferGeometry): number => (geometry.getIndex()?.count ?? 0) / 3;

interface Site {
  // At the middle of the footprint on the ground, so the nod stretches up from the floor.
  readonly pivot: Group;
  readonly meshes: readonly Mesh[];
  // Seconds into the nod, or null while it is still being built.
  opened: number | null;
}

// Narrower as it stretches, so the nod keeps its volume and reads as give rather than growth.
function nod(site: Site, stretch: number): void {
  const narrow = 1 / Math.sqrt(stretch);
  site.pivot.scale.set(narrow, stretch, narrow);
}

const DUST_COLOUR = 0xd9cfbf;

function dustMesh(): InstancedMesh {
  const mesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardNodeMaterial({ color: DUST_COLOUR, roughness: 1, metalness: 0 }),
    MAX_GRAINS,
  );
  mesh.name = 'construction-dust';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  return mesh;
}

// Scale on the diagonal and position in the last column; the rest stays the identity it was made.
function writeGrains(mesh: InstancedMesh, grains: DustBuffer, count: number): void {
  const matrices = mesh.instanceMatrix.array;
  for (let index = 0; index < count; index++) {
    const at = index * 16;
    const scale = grains.scale[index]!;
    matrices[at] = scale;
    matrices[at + 5] = scale;
    matrices[at + 10] = scale;
    matrices[at + 12] = grains.x[index]!;
    matrices[at + 13] = grains.y[index]!;
    matrices[at + 14] = grains.z[index]!;
  }
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = count;
  mesh.visible = count > 0;
}

const footprintOf = (placement: Placement) => {
  const extent = rotateExtent(placement.width, placement.depth, placement.rotation);
  return { x: placement.x, z: placement.z, width: extent.x, depth: extent.z, y: placement.y };
};

export function buildConstructionField(
  geometries: readonly ModelGeometry[],
  lightVolume: BakedLightVolume | null,
): ConstructionField {
  const group = new Group();
  group.name = 'construction';

  const lit = painted(litMaterial(lightVolume));
  const unlit = painted(new MeshBasicNodeMaterial({ vertexColors: true }));
  const open = painted(
    litMaterial(lightVolume),
    attribute<'float'>('furled', 'float').lessThan(0.5),
  );
  const materialOf = (surface: (typeof SURFACES)[number]) =>
    surface.kind === 'canopy' ? open : surface.shaded ? lit : unlit;

  const dust = dustMesh();
  group.add(dust);
  const grains = createDustBuffer();
  const puffs: Puff[] = [];

  const modelById = new Map(geometries.map((entry) => [entry.id, entry]));
  const sites = new Map<string, Site>();
  let meshCount = 0;
  let triangleCount = 0;

  const pitch = (
    surface: (typeof SURFACES)[number],
    geometry: BufferGeometry,
    placement: Placement,
    pivot: Group,
    height: number,
  ): Mesh => {
    const mesh = new Mesh(geometry, materialOf(surface));
    mesh.name = `building-${placement.key}-${surface.kind}`;
    // Written before the first draw: a reference node infers its uniform type from the first
    // object the material is compiled for.
    mesh.userData.paint = 0;
    mesh.userData.lead = leadVoxels(height);
    mesh.userData.grey = 0;
    // The same matrix instancedWorld.ts writes for a finished placement, less the pivot, so the
    // building does not step sideways when done.
    const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
    mesh.rotation.y = rotationRadians(placement.rotation);
    mesh.position.set(
      placement.x + origin.x - pivot.position.x,
      0,
      placement.z + origin.z - pivot.position.z,
    );
    pivot.add(mesh);
    meshCount++;
    triangleCount += trianglesOf(geometry);
    return mesh;
  };

  const raise = (placement: Placement, height: number): Site => {
    const model = modelById.get(placement.id);
    if (!model) throw new Error(`No geometry was meshed for object type "${placement.id}"`);
    const { x, z, width, depth, y } = footprintOf(placement);
    const pivot = new Group();
    pivot.name = `site-${placement.key}`;
    pivot.position.set(x + width / 2, y, z + depth / 2);
    group.add(pivot);
    const meshes: Mesh[] = [];
    for (const surface of SURFACES) {
      const geometry = surface.of(model);
      if (geometry) meshes.push(pitch(surface, geometry, placement, pivot, height));
    }
    return { pivot, meshes, opened: null };
  };

  const takeDown = (key: string, site: Site): void => {
    group.remove(site.pivot);
    for (const mesh of site.meshes) {
      meshCount--;
      triangleCount -= trianglesOf(mesh.geometry);
    }
    sites.delete(key);
  };

  return {
    group,
    get drawCalls() {
      return meshCount + (dust.visible ? 1 : 0);
    },
    get triangleCount() {
      return triangleCount + (dust.visible ? 12 * dust.count : 0);
    },
    show(placement, height, paint, grey) {
      const site = sites.get(placement.key) ?? raise(placement, height);
      sites.set(placement.key, site);
      for (const mesh of site.meshes) {
        mesh.userData.paint = paint;
        mesh.userData.grey = grey;
      }
    },
    open(placement) {
      const site = sites.get(placement.key);
      if (!site) return;
      site.opened = 0;
      for (const mesh of site.meshes) mesh.userData.grey = 0;
      stirDust(puffs, puffOf(footprintOf(placement), placement.key));
    },
    // Plays on while the resort is paused, as the fireworks do: it is the player's moment.
    advance(dt) {
      const seconds = Math.min(Math.max(dt, 0), MAX_STEP);
      const done: string[] = [];
      for (const [key, site] of sites) {
        if (site.opened === null) continue;
        site.opened += seconds;
        nod(site, popStretchAt(site.opened));
        if (site.opened < POP_SECONDS) continue;
        takeDown(key, site);
        done.push(key);
      }
      if (puffs.length > 0 || dust.visible) {
        settleDust(puffs, seconds);
        writeGrains(dust, grains, writeDust(puffs, grains));
      }
      return done;
    },
    hide(key) {
      const site = sites.get(key);
      if (!site) return false;
      takeDown(key, site);
      return true;
    },
    dispose() {
      group.clear();
      sites.clear();
      meshCount = 0;
      triangleCount = 0;
      lit.dispose();
      unlit.dispose();
      open.dispose();
      dust.geometry.dispose();
      (dust.material as MeshStandardNodeMaterial).dispose();
      dust.dispose();
      // Never dispose the catalogue's geometries: they are shared with the instanced world, and
      // Three.js frees buffers by attribute identity, which would pull every finished building of
      // the type.
    },
  };
}
