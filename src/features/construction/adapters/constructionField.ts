/**
 * Draws the buildings that are still going up.
 *
 * A building under construction is not in the instanced world: it is a handful
 * of plain meshes standing off to one side of it, drawn with the catalogue's own
 * geometry and a material that discards everything above a line. When the site
 * finishes, `showcase.ts` takes these down and stands the building for real —
 * so nothing here has to know what a finished building costs, and the world
 * below does not have to grow a per-instance channel for a state that lasts ten
 * seconds and then never applies again.
 *
 * **Plain meshes rather than instances.** There is one site of a type at a time,
 * usually one site altogether, so a bucket, a slot table and a per-instance
 * buffer would be machinery for a population of one; four draw calls against
 * the resort's forty, for as long as the crane is up, is the cheaper trade. It
 * also means the geometry can be the catalogue's own, untouched — see the note
 * on {@link ConstructionField.dispose}, which is the one invariant here that is
 * invisible and fatal.
 *
 * **The cut is per fragment, and it has to be.** The mesher merges coplanar
 * faces, so a wall is often one quad many voxels tall; hiding whole vertices
 * could only take the wall away entire. Discarding by the interpolated
 * model-space height cuts through the middle of a merged quad, which is what
 * lets a building fill in a course at a time without a second geometry.
 *
 * How high the cut stands is the one number that differs between two sites, and
 * it rides on the mesh's own `userData`: a reference node updates per render
 * object and its uniform sits in the object group, so one material draws every
 * site and each mesh reads its own number. See `domain/construction.ts` for
 * where that number comes from.
 */

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
  /** Meshes standing on building sites: one per surface kind per site. */
  readonly drawCalls: number;
  /** Triangles those meshes walk, the discarded ones included. */
  readonly triangleCount: number;
  /**
   * Draws a building at the height it has reached, in the model's own voxels.
   *
   * Idempotent in the key: the first call puts the meshes up, every later one
   * only moves the line, which is what the render loop calls once a frame.
   */
  show(placement: Placement, height: number, reveal: number): void;
  /** Takes a site down, finished or bulldozed. False if nothing stood there. */
  hide(key: string): boolean;
  dispose(): void;
}

/** The same cheap, well-spread hash of one number `instancedWorld.ts` lights windows with. */
const hashOf = (value: Node<'float'>): Node<'float'> => fract(sin(value).mul(43758.5453));

/**
 * One of a mesh's own `userData` numbers, as the float it is.
 *
 * `userData()` declares its input type as a plain string and so hands back a
 * node of no particular type, which will not chain with the rest of a graph.
 * The type is not in doubt — what is written under these names is a number —
 * and this is the whole of the gap between that and the typings.
 */
const userFloat = (name: string): Node<'float'> =>
  userData(name, 'float') as unknown as Node<'float'>;

/**
 * Hangs the construction cut on a material.
 *
 * Two hashes, and they do different jobs. The first is per voxel *column*, and
 * it is the structure: a corner post standing while the wall beside it is still
 * knee high is what a building site looks like from across the plot. The second
 * is per voxel *cell*, and it is the grain: single voxels appearing along the
 * frontier rather than a clean stair edge. Both are subtracted from the line,
 * so a column never runs ahead of the reveal, only behind it — which is why the
 * reveal has to travel past the model's own top before a building is whole.
 *
 * `maskNode` rather than an alpha test: it is a plain discard, it runs before
 * the material has worked out a colour it is about to throw away, and the shadow
 * pass honours it too — so a half-built wall throws a half-built shadow without
 * being asked.
 */
function cut<T extends NodeMaterial>(material: T): T {
  // The model's own space, before the turn and before the placement: one
  // material serves every building, at every rotation, anywhere on the plot.
  const local = vertexStage(positionGeometry);
  const column = floor(local.xz);
  const lead = hashOf(column.x.mul(12.9898).add(column.y.mul(78.233)));
  const cell = floor(local);
  const grain = hashOf(cell.x.mul(31.7).add(cell.y.mul(17.3)).add(cell.z.mul(57.1)));

  const reveal = userFloat('reveal');
  const line = reveal
    .sub(lead.mul(userFloat('lead')))
    .sub(grain.mul(GRAIN_VOXELS))
    // The floor slab is never held back. Without it the first second of a build
    // is an empty tile, which reads as a misclick rather than as a foundation.
    .max(FOUNDATION_VOXELS);
  material.maskNode = local.y.lessThan(line);
  // A cut solid has no cap: the mesher never emitted the faces inside a wall,
  // so a single-sided model is a shell you can see straight through from above.
  // Drawn both ways it is a building without its roof on yet, which is the
  // thing it is.
  material.side = DoubleSide;
  return material;
}

/**
 * The four surfaces a model is meshed into, and which material each is drawn
 * with while it is going up.
 *
 * Two materials, not four. A building still going up has no lights burning
 * behind its windows and no water in its pool, so the glass, the glow and the
 * pool are all drawn flat — and the colour is in the vertices either way, so
 * they still come out the colour they are. Only the shaded half is the resort's
 * own material, because a half-built wall stands in the same lamplight a
 * finished one does.
 */
const SURFACES = [
  { kind: 'lit', of: (model: ModelGeometry) => model.lit, shaded: true },
  { kind: 'glow', of: (model: ModelGeometry) => model.emissive, shaded: false },
  { kind: 'water', of: (model: ModelGeometry) => model.water, shaded: false },
  { kind: 'window', of: (model: ModelGeometry) => model.window, shaded: false },
] as const;

/** Triangles in one geometry: what a site adds to the frame's count while it stands. */
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

  /** Stands one surface of one building site, at the height it has reached. */
  const pitch = (
    surface: (typeof SURFACES)[number],
    geometry: BufferGeometry,
    placement: Placement,
    height: number,
    reveal: number,
  ): Mesh => {
    const mesh = new Mesh(geometry, surface.shaded ? lit : unlit);
    mesh.name = `building-${placement.key}-${surface.kind}`;
    // Written before the mesh is ever drawn: a reference node reads the value
    // once to work out what type its uniform is, and it reads it off the first
    // object the material is compiled for.
    mesh.userData.reveal = reveal;
    // Fixed for the life of the site: how far one column of voxels may lag
    // behind the reveal, which is a share of this model's own height.
    mesh.userData.lead = leadVoxels(height);
    // The same matrix the instanced world writes for a finished placement — a
    // turn about Y, then the corner plus the offset that brings the turned model
    // back into its own footprint — so the building does not step sideways the
    // moment it is done. See `writeSlot` in `instancedWorld.ts`.
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
      // The geometries are not freed here, and must not be. They are the meshed
      // catalogue's, made once at load and shared with the instanced world that
      // is still drawing them — and Three.js frees a geometry's buffers by the
      // identity of its attributes, so disposing one of these would pull the
      // model out from under every finished building of the same type.
    },
  };
}
