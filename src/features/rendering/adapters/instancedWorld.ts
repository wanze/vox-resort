/**
 * Builds the scene as instanced draws: one instanced mesh per model, however
 * many of that model the plan puts on the plot.
 *
 * Every object stands in its own footprint and never touches its neighbours, so
 * nothing is lost by meshing a model on its own and repeating it — and the win
 * is large. A resort of 1 100 objects uploads roughly 30 geometries instead of
 * one world-sized blob per colour, and submits on the order of 40 draw calls
 * rather than 217. A placement translates and takes a quarter turn, so the
 * per-instance matrix is a turn and an offset — which is the whole cost of a
 * building facing a different way: no second geometry, no second bucket.
 *
 * Instances are then split by chunk of the plot, so those meshes are small
 * enough for the renderer to cull — see `domain/spatialChunks.ts` for why one
 * mesh per model was never culled at all.
 *
 * **A bucket is a plain `Mesh` over an instanced geometry, not an
 * `InstancedMesh`, and that is the difference between a smooth zoom and a
 * stalled one.** Three.js's WebGPU renderer puts every `InstancedMesh`'s own
 * uuid into the key it caches built shaders under (`RenderObject.
 * getMaterialCacheKey`), because its instance matrices are bound through a node
 * of their own. So every bucket was a full node build — TSL to WGSL, milliseconds
 * of main thread — the first frame it was drawn, and a large plot has fifteen
 * thousand of them: zooming in turned a few hundred regions from far to near in
 * one frame and paid for thousands of builds at once. Here the matrices are four
 * columns of one interleaved instance buffer, read by the materials'
 * `positionNode` like any other attribute, so every bucket of a material and an
 * attribute layout shares one build. See {@link standOnInstances}.
 *
 * The scene is mutable. A bucket's buffer is allocated with room above what it
 * draws, the instance count says how much of it is live, and placing an object writes
 * one matrix into one bucket rather than rebuilding anything; a bucket that
 * overflows doubles, and only that bucket is reallocated. Removal fills the hole
 * with the last instance, which is why a bucket's slots are addressed by a map
 * from placement key rather than by the order the plan happened to be in.
 *
 * The policy — which chunk a placement falls in, what capacity a bucket should
 * get, what changed between two sets of placements — is in the domain module and
 * unit-tested there. What is left here is the buffer writes.
 */

import {
  DynamicDrawUsage,
  Group,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Sphere,
  type BufferGeometry,
  type Material,
  type NodeMaterial,
} from 'three/webgpu';
import {
  attribute,
  float,
  fract,
  instanceIndex,
  mat4,
  positionLocal,
  sin,
  smoothstep,
  step,
  uniform,
  vec3,
  vec4,
  vertexColor,
  vertexStage,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotationRadians, turnedOrigin } from '../../layout/domain/rotation';
import {
  distanceToBox,
  isFar,
  isHidden,
  pixelsPerVoxel,
  regionLevelOf,
  type DetailBox,
  type DetailView,
  type RegionLevel,
} from '../domain/levelOfDetail';
import {
  bucketByChunk,
  capacityFor,
  CHUNK_VOXELS,
  chunkKey,
  chunkOf,
  diffPlacements,
  REGION_CHUNKS,
  regionOf,
  type ChunkCoordinate,
} from '../domain/spatialChunks';
import { createPoolWaterMaterial } from './poolWaterMaterial';
import type { ModelGeometry } from './voxelMeshBuilder';

export interface InstancedWorld {
  readonly group: Group;
  /** Meshes in the scene: one per model, material kind and chunk it appears in. */
  readonly drawCalls: number;
  /** Chunks the plot was split into. */
  readonly chunkCount: number;
  /** Triangles uploaded to the GPU once, across all model geometries. */
  readonly uniqueTriangleCount: number;
  /** What the mesher emitted before coplanar faces were merged. */
  readonly unmergedTriangleCount: number;
  /** Triangles the renderer walks per frame, instances included. */
  readonly drawnTriangleCount: number;
  readonly instanceCount: number;
  /** Repaints the sky the resort's water reflects, in packed sRGB. */
  setSky(sky: number): void;
  /**
   * Sets how far through the evening the resort is, 0 by day and 1 after dark:
   * what turns the lights on behind the windows. The same number the baked lamp
   * volume takes — see `lighting/domain/dayNight.ts`.
   */
  setLampFactor(factor: number): void;
  /**
   * Sets the share of the resort's beds slept in tonight, 0..1: how many of the
   * rooms behind the windows are lit after dark. The resort's share and not a
   * building's - see `sim/domain/night.ts`'s `occupiedShare`.
   */
  setOccupiedShare(share: number): void;
  /** Stands one more object on the plot. Throws if its key is already taken. */
  add(placement: Placement): void;
  /** Takes one object off the plot. False if nothing stood under that key. */
  remove(key: string): boolean;
  /** Reconciles the scene against a whole set of placements, changing only what differs. */
  setPlacements(placements: readonly Placement[]): void;
  /**
   * Picks, per bucket, whether it is drawn in full, coarse or not at all, from
   * how large it comes out through this camera. Null draws everything in full.
   * Cheap enough to call every frame; see `domain/levelOfDetail.ts`.
   */
  updateDetail(view: DetailView | null): void;
  /** Buckets at each level after the last {@link updateDetail}. */
  readonly detailCounts: DetailCounts;
  dispose(): void;
}

/**
 * Shaded surfaces; colour comes from the vertex attribute, shading from the
 * scene. One instance of this material is shared by every model: they differ
 * only in geometry, and a material per model is a shader program per model for
 * the renderer to compile, bind and sort.
 *
 * The resort's own lamps arrive through `emissiveNode`, read out of the baked
 * volume rather than evaluated per fragment — see `lighting/bakedLightVolume.ts`.
 * Out of the same volume comes how much sky the surface can see, which goes to
 * `aoNode` and so lands on the ambient term: it is what darkens a courtyard, an
 * alley and the ground under a canopy, and it costs nothing per frame because
 * the fetch was already happening.
 *
 * Exported because the crowd is drawn with it too — a person walks through the
 * pools of light the lamps cast for exactly the reason a wall stands in them,
 * and shading them from a second material would be two shaders that had to be
 * kept looking the same. The crowd builds its own instance of it and hangs a
 * `positionNode` off it for the walk cycle; see `crowd/adapters/crowdField.ts`.
 */
export function litMaterial(volume: BakedLightVolume | null): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
  });
  if (volume) {
    material.emissiveNode = volume.lampLight(vertexColor().rgb);
    material.aoNode = volume.skyVisibility();
  }
  return material;
}

/**
 * Glowing surfaces. Unlit rather than emissive-mapped: a basic material takes
 * the vertex colour straight to the screen, which is exactly what a lamp head
 * or a flame wants, in daylight and after dark alike. Shared for the same
 * reason the lit material is.
 */
function glowMaterial(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ vertexColors: true });
}

/**
 * How many of a building's windows have somebody behind them after dark, when
 * the resort is full.
 *
 * Half, which is what the resort's own evenings look like from the road, and
 * far more legible than either extreme: every window lit reads as a render with
 * the interior lighting left on, and a scattering of two or three reads as an
 * empty hotel. It is a fraction rather than a count because the buildings run
 * from a bungalow's three windows to a hotel's forty, and half of each is a
 * bungalow with one or two lights on and a hotel with a full facade of them.
 *
 * Scaled by how full the resort actually is - see {@link
 * InstancedWorld.setOccupiedShare}. A resort with half its beds empty lights
 * half as many rooms, which is the cheapest honest way to show occupancy: the
 * instance index is a slot and not a placement, so *which* building is full
 * cannot be said without a per-instance buffer kept in step through every
 * grow, push and swap. See the note on {@link windowMaterial}.
 */
const FULL_LIT_WINDOW_FRACTION = 0.5;

/** The warm interior a lit room throws onto its own glass. */
const WINDOW_GLOW = 0xffc27a;

/**
 * How brightly it burns, as outgoing radiance.
 *
 * Under one on purpose: a window is a room seen through glass, not a lamp, and
 * a pane at full strength blows out against the street lamps standing in front
 * of it — which are the thing that is actually a light.
 */
const WINDOW_GLOW_STRENGTH = 0.85;

/**
 * How the windows come on through the evening, against the lamp factor.
 *
 * `SPREAD` is how much of the dusk the first window and the last are apart, and
 * `RAMP` how long one of them takes to reach full. Together they are the reason
 * a building does not switch on like a signboard: each room takes its own
 * moment, drawn from the same hash that decided whether it is occupied at all.
 */
const WINDOW_DUSK_SPREAD = 0.55;
const WINDOW_DUSK_RAMP = 0.18;

/** A cheap, well-spread hash of one number, in the shader. */
const hashOf = (value: Node<'float'>): Node<'float'> => fract(sin(value).mul(43758.5453));

/** The lit material, and the evening the windows in it follow. */
interface WindowMaterial {
  readonly material: MeshStandardNodeMaterial;
  /** 0 by day, 1 after dark; see {@link InstancedWorld.setLampFactor}. */
  setLampFactor(factor: number): void;
  /** The share of beds slept in; see {@link InstancedWorld.setOccupiedShare}. */
  setOccupiedShare(share: number): void;
}

/**
 * Window glass: the resort's own lit material, with a light switched on behind
 * half the panes once the sun is down.
 *
 * **Which half is decided on the GPU, and it has to be.** A building is an
 * instance rather than a geometry — every hotel on the plot draws the one mesh
 * the catalogue meshed — so there is no CPU-side place to put "this hotel has
 * its third window lit" that the other hotels would not read too. What there
 * is instead is the two numbers a vertex already knows: which pane it belongs
 * to, baked per vertex by `domain/modelAttributes.ts` and equal across the four
 * corners of a quad, and which instance is being drawn. Hashed together they
 * give a room its own answer, stable from frame to frame and different in every
 * building — for one float of geometry and no per-frame work at all.
 *
 * The hash is computed in the vertex stage, which is not a micro-optimisation:
 * `instanceIndex` is a vertex builtin, and on the WebGL2 fallback it is
 * `gl_InstanceID`, which does not exist in a fragment shader. Being constant
 * across the quad, it survives the interpolation as exactly itself.
 *
 * What the instance index costs is that it is a *slot* and not a placement.
 * Demolishing a building moves the last instance of its bucket into the hole —
 * see {@link dropInstance} — so that one neighbour's rooms are redrawn, and two
 * buildings of one type that hold the same slot in two different chunks light
 * the same rooms. Neither is visible at the distance chunks are apart, and the
 * alternative is a per-instance buffer kept in step with the matrices through
 * every grow, push and swap — which is a great deal of machinery for a hotel
 * sixty metres away that switched a light on.
 *
 * A lit window glows and lights nothing. Casting light would mean a lamp per
 * pane in the bake — hundreds per building — and the bake is what the night
 * costs; a model that should light the street beneath it declares a `ModelLight`
 * as well, which is what the hotel's lanterns are.
 */
function windowMaterial(volume: BakedLightVolume | null): WindowMaterial {
  const lampFactor = uniform(0);
  const litFraction = uniform(FULL_LIT_WINDOW_FRACTION);
  const material = litMaterial(volume);

  // The pane, and the building it is in. The instance is folded in through the
  // golden ratio and wrapped, which does two things: it spreads consecutive
  // buildings as far apart as a sequence can, and it keeps the number the hash
  // takes a sine of small. A raw index would put `sin` in the thousands, where a
  // GPU's own precision is what decides the answer — and the resort would show
  // it as banding down a facade.
  const building = fract(float(instanceIndex).mul(0.6180339887));
  const seed = attribute<'float'>('pane', 'float').add(building);
  const occupied = hashOf(seed.mul(12.9898).add(78.233));
  const eager = hashOf(seed.mul(39.3468).add(11.135));

  const dusk = eager.mul(WINDOW_DUSK_SPREAD);
  const burning = vertexStage(
    step(occupied, litFraction).mul(smoothstep(dusk, dusk.add(WINDOW_DUSK_RAMP), lampFactor)),
  );

  const [r, g, b] = linearRgbOf(WINDOW_GLOW);
  const glow = vec3(r, g, b).mul(WINDOW_GLOW_STRENGTH).mul(burning);
  // Added to the lamp light rather than replacing it: the glass still catches
  // the street lamp outside it, exactly as the wall around it does.
  material.emissiveNode = volume ? volume.lampLight(vertexColor().rgb).add(glow) : glow;

  return {
    material,
    setLampFactor(factor) {
      lampFactor.value = factor;
    },
    setOccupiedShare(share) {
      litFraction.value = FULL_LIT_WINDOW_FRACTION * Math.min(1, Math.max(0, share));
    },
  };
}

/** Groups placements by object type, preserving plan order. */
export function instancesByType(
  placements: readonly Placement[],
): ReadonlyMap<string, readonly Placement[]> {
  const byType = new Map<string, Placement[]>();
  for (const placement of placements) {
    let list = byType.get(placement.id);
    if (!list) {
      list = [];
      byType.set(placement.id, list);
    }
    list.push(placement);
  }
  return byType;
}

/** The four parts a model is split into, and the material each is drawn with. */
type MaterialKind = 'lit' | 'glow' | 'water' | 'window';

interface ModelPart {
  readonly kind: MaterialKind;
  readonly geometry: BufferGeometry;
  /**
   * What this surface is drawn with in a far region: the coarse copy's same
   * surface, the full geometry for a model with no coarse copy, or null when
   * the coarse copy lost this surface altogether — a sliver of glass painted
   * over — and it is simply not drawn from that far away.
   */
  readonly far: BufferGeometry | null;
  readonly material: Material;
  /** Triangles in a single instance of this geometry. */
  readonly triangles: number;
  /** The whole model's largest extent in voxels, which is what hides it. */
  readonly extent: number;
}

/**
 * One instanced draw: a model's surface in one cell of a layer — a chunk of the
 * near layer, or a region of the far one.
 *
 * `keys` is the slot table — `keys[i]` is the placement drawn at instance `i`,
 * and its length is the geometry's live instance count. The buffer behind it is
 * longer than that; see {@link capacityFor}.
 */
interface Bucket {
  readonly cell: string;
  readonly coordinate: ChunkCoordinate;
  readonly part: ModelPart;
  /** The catalogue's geometry this bucket draws, which it shares and never frees. */
  readonly geometry: BufferGeometry;
  /** A plain mesh over {@link instances}; see the note at the top of the file. */
  mesh: Mesh;
  /** The bucket's own geometry: the catalogue's attributes and its instance buffer. */
  instances: InstancedBufferGeometry;
  /** Sixteen floats per slot, column-major: the instance matrices. */
  matrices: InstancedInterleavedBuffer;
  readonly keys: string[];
  readonly slots: Map<string, number>;
  /** Slots written since the buffer was last uploaded whole. */
  dirtyLow: number;
  dirtyHigh: number;
  /** Highest ground any placement in the bucket has stood on; never lowered. */
  groundTop: number;
  hidden: boolean;
  /** The region this bucket's cell lies in, or null for a district's bucket. */
  readonly region: string | null;
  /** The district this bucket's cell lies in. */
  readonly district: string;
}

/**
 * Every placement, bucketed four times over.
 *
 * | layer    | cell                  | drawn with   |
 * | -------- | --------------------- | ------------ |
 * | near     | a chunk (64 m)        | the model    |
 * | mid      | a region (4 × 4)      | the model    |
 * | far      | a region              | coarse copy  |
 * | district | a district (4 × 4 regions, 1 km) | coarse copy |
 *
 * The renderer's cost is per draw, so the cells grow as fast as the eye allows:
 * chunks only where the frustum can throw most of a region away, whole regions
 * past that, coarse copies once they cannot be told from the model, and whole
 * districts once an entire district is that far. Each coarser cell is one draw
 * per model where the finer ones were sixteen. See `domain/levelOfDetail.ts`.
 */
interface Layer {
  readonly name: string;
  readonly cellVoxels: number;
  /** How many times a chunk the cell is grouped up: 0 a chunk, 1 a region, 2 a district. */
  readonly span: 0 | 1 | 2;
  readonly geometryOf: (part: ModelPart) => BufferGeometry | null;
  readonly buckets: Map<string, Bucket>;
}

/** Counts of buckets drawn at each level by the last pass, and left out as too small. */
export interface DetailCounts {
  readonly near: number;
  readonly mid: number;
  readonly far: number;
  readonly district: number;
  readonly hidden: number;
}

/** Whether two views would pick the same levels, so a still camera costs nothing. */
function sameView(a: DetailView | null, b: DetailView | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.x !== b.x || a.y !== b.y || a.z !== b.z || a.lens.kind !== b.lens.kind) return false;
  return a.lens.kind === 'perspective'
    ? a.lens.focalPixels === (b.lens as typeof a.lens).focalPixels
    : a.lens.pixelsPerVoxel === (b.lens as typeof a.lens).pixelsPerVoxel;
}

/** Scratch for a single matrix write; never escapes the call that uses it. */
const scratch = new Matrix4();

const bucketKey = (id: string, kind: MaterialKind, cell: string): string => `${id}|${kind}|${cell}`;

/** The geometry attributes an instance matrix's four columns are read from. */
const MATRIX_COLUMNS = [
  'instanceColumn0',
  'instanceColumn1',
  'instanceColumn2',
  'instanceColumn3',
] as const;

/**
 * Makes a material stand each vertex where its instance's matrix puts it.
 *
 * What `InstancedMesh` does inside Three.js, done in the material instead so
 * that the mesh stays a plain one and its shader is shared — see the note at the
 * top of the file. Only the position is transformed: the lit materials shade
 * flat, from the derivatives of the position this produces, the glow is unlit,
 * and the water bends a world-space normal of its own.
 */
function standOnInstances(material: NodeMaterial): void {
  const [c0, c1, c2, c3] = MATRIX_COLUMNS.map((name) => attribute<'vec4'>(name, 'vec4'));
  const matrix = mat4(c0!, c1!, c2!, c3!);
  material.positionNode = matrix.mul(vec4(positionLocal, 1)).xyz;
}

/**
 * Wraps a catalogue geometry for one bucket: its attributes and index shared,
 * not copied, and an instance buffer of `capacity` matrices of its own.
 *
 * One interleaved buffer rather than four attributes, so the matrices cost the
 * pipeline one vertex buffer of the eight WebGPU allows.
 */
function instancedGeometryOf(
  source: BufferGeometry,
  capacity: number,
): { readonly instances: InstancedBufferGeometry; readonly matrices: InstancedInterleavedBuffer } {
  const instances = new InstancedBufferGeometry();
  instances.setIndex(source.getIndex());
  for (const [name, shared] of Object.entries(source.attributes)) {
    instances.setAttribute(name, shared);
  }
  const matrices = new InstancedInterleavedBuffer(new Float32Array(capacity * 16), 16, 1);
  // The buffer is written a matrix at a time, which is what the dynamic hint is
  // for: it is what makes the renderer honour the update ranges below rather
  // than re-uploading the whole bucket for one changed instance.
  matrices.setUsage(DynamicDrawUsage);
  for (const [column, name] of MATRIX_COLUMNS.entries()) {
    instances.setAttribute(name, new InterleavedBufferAttribute(matrices, 4, column * 4));
  }
  instances.instanceCount = 0;
  // Kept by hand: the geometry's own would bound one model at the origin.
  instances.boundingSphere = new Sphere().makeEmpty();
  return { instances, matrices };
}

/** Allocates a mesh with room for `capacity` instances, drawing the first `count`. */
function createMesh(bucket: Bucket, name: string, capacity: number, count: number): void {
  const { instances, matrices } = instancedGeometryOf(bucket.geometry, capacity);
  instances.instanceCount = count;
  const mesh = new Mesh(instances, bucket.part.material);
  mesh.name = name;
  // Every bucket stands at the origin and the instances carry the placement, so
  // there is no transform to keep current — and on a large plot the scene's own
  // walk over thousands of meshes to recompute one was a cost per frame.
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  bucket.mesh = mesh;
  bucket.instances = instances;
  bucket.matrices = matrices;
}

/**
 * Lets a bucket's mesh go.
 *
 * Disposing the geometry is what frees the instance buffer on the GPU; it also
 * makes the renderer drop the catalogue's shared attributes, which it uploads
 * again the next time another bucket draws them. That is a few buffers per
 * model, once, on an edit that emptied or outgrew a bucket — against a renderer
 * that would otherwise hold every discarded bucket's buffer for as long as the
 * page is open.
 */
function releaseMesh(bucket: Bucket): void {
  bucket.instances.dispose();
}

/** Scratch for bounding one instance; never escapes the call that uses it. */
const instanceSphere = new Sphere();

/** Grows a bucket's bounding sphere over one more slot. */
function boundSlot(bucket: Bucket, slot: number): void {
  const source = bucket.geometry;
  if (!source.boundingSphere) source.computeBoundingSphere();
  scratch.fromArray(bucket.matrices.array, slot * 16);
  instanceSphere.copy(source.boundingSphere!).applyMatrix4(scratch);
  bucket.instances.boundingSphere!.union(instanceSphere);
}

/**
 * Bounds a bucket over every slot it draws: what the frustum test reads, so a
 * stale one would cull an instance out of a view it is plainly standing in.
 */
function boundBucket(bucket: Bucket): void {
  bucket.instances.boundingSphere!.makeEmpty();
  for (let slot = 0; slot < bucket.keys.length; slot++) boundSlot(bucket, slot);
}

/**
 * Marks one slot as needing an upload.
 *
 * The range is the union of everything written since the buffer was last
 * allocated, rather than a list: Three.js copies an instance matrix's ranges
 * every frame without consuming them, so a list would only ever grow. One range
 * costs a few unchanged matrices on a scattered edit and stays bounded.
 */
function markDirty(bucket: Bucket, slot: number): void {
  bucket.dirtyLow = Math.min(bucket.dirtyLow, slot);
  bucket.dirtyHigh = Math.max(bucket.dirtyHigh, slot);
  const matrices = bucket.matrices;
  matrices.clearUpdateRanges();
  matrices.addUpdateRange(bucket.dirtyLow * 16, (bucket.dirtyHigh - bucket.dirtyLow + 1) * 16);
  matrices.needsUpdate = true;
}

/**
 * Swaps in a longer buffer for this bucket, keeping what it already drew.
 *
 * The mesh itself is replaced rather than its attribute: the renderer keeps the
 * attributes a mesh had when it first drew it, so a buffer swapped in underneath
 * would never be read. A new mesh costs no new shader; see the file's note.
 */
function growBucket(bucket: Bucket, group: Group, capacity: number): void {
  const previous = { ...bucket };
  createMesh(bucket, previous.mesh.name, capacity, bucket.keys.length);
  bucket.matrices.array.set(previous.matrices.array);
  bucket.instances.boundingSphere!.copy(previous.instances.boundingSphere!);
  bucket.mesh.visible = previous.mesh.visible;
  group.remove(previous.mesh);
  releaseMesh(previous);
  group.add(bucket.mesh);
  // A fresh buffer is uploaded whole, so nothing is left partially written.
  bucket.dirtyLow = Number.POSITIVE_INFINITY;
  bucket.dirtyHigh = Number.NEGATIVE_INFINITY;
}

/**
 * Writes a placement's instance matrix into one slot, without touching the slot
 * table.
 *
 * A turn about Y, then the placement's corner — plus the offset that brings the
 * turned model back into its own footprint, since a rotation matrix turns about
 * the origin and would otherwise leave the model behind it. The height is the
 * placement's own, so an object on a terrace stands on it rather than sinking
 * to sea level. `setPosition` writes the translation column over the turn rather
 * than multiplying, which is the same matrix for none of the work.
 */
function writeSlot(bucket: Bucket, slot: number, placement: Placement): void {
  const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
  scratch
    .makeRotationY(rotationRadians(placement.rotation))
    .setPosition(placement.x + origin.x, placement.y, placement.z + origin.z)
    .toArray(bucket.matrices.array, slot * 16);
}

/**
 * Appends one instance, growing the bucket first if it has run out of room.
 *
 * The bounding sphere grows over it because it is what the frustum test reads:
 * left stale, the renderer would cull the new instance out of a view it is
 * plainly standing in.
 */
function pushInstance(bucket: Bucket, group: Group, placement: Placement): void {
  const slot = bucket.keys.length;
  const capacity = capacityFor(slot + 1, bucket.matrices.count);
  if (capacity !== bucket.matrices.count) growBucket(bucket, group, capacity);
  bucket.keys.push(placement.key);
  bucket.slots.set(placement.key, slot);
  bucket.instances.instanceCount = bucket.keys.length;
  bucket.groundTop = Math.max(bucket.groundTop, placement.y);
  writeSlot(bucket, slot, placement);
  markDirty(bucket, slot);
  boundSlot(bucket, slot);
}

/**
 * Takes one instance out by moving the last one into its slot.
 *
 * Compacting the whole bucket instead would rewrite every matrix after the hole
 * for nothing: instance order carries no meaning, only the slot table does.
 * Returns whether the bucket is now empty.
 */
function dropInstance(bucket: Bucket, key: string, live: ReadonlyMap<string, Placement>): boolean {
  const slot = bucket.slots.get(key);
  if (slot === undefined) return false;
  const last = bucket.keys.length - 1;
  if (slot !== last) {
    const movedKey = bucket.keys[last]!;
    const moved = live.get(movedKey)!;
    bucket.keys[slot] = movedKey;
    bucket.slots.set(movedKey, slot);
    writeSlot(bucket, slot, moved);
    markDirty(bucket, slot);
  }
  bucket.keys.length = last;
  bucket.slots.delete(key);
  bucket.instances.instanceCount = last;
  if (last > 0) boundBucket(bucket);
  return last === 0;
}

/**
 * The largest extent of a model across all of its surfaces, in voxels: the
 * size its level of detail is judged by.
 */
function extentOf(model: ModelGeometry): number {
  let extent = 0;
  for (const geometry of [model.lit, model.emissive, model.water, model.window]) {
    if (!geometry) continue;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    extent = Math.max(extent, box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  }
  return extent;
}

/** Which of a model's geometries each material kind draws. */
const SURFACES = [
  ['lit', 'lit'],
  ['glow', 'emissive'],
  ['water', 'water'],
  ['window', 'window'],
] as const;

/** Triangles in one instance of a geometry. */
const trianglesIn = (geometry: BufferGeometry): number => (geometry.getIndex()?.count ?? 0) / 3;

/** A model's surfaces, each with the material it is drawn in and what it is drawn with far away. */
function modelPartsFor(
  model: ModelGeometry,
  materials: Readonly<Record<MaterialKind, Material>>,
): ModelPart[] {
  const extent = extentOf(model);
  const coarse = model.coarse ?? null;
  const parts: ModelPart[] = [];
  for (const [kind, surface] of SURFACES) {
    const geometry = model[surface];
    if (!geometry) continue;
    parts.push({
      kind,
      geometry,
      far: coarse ? coarse[surface] : geometry,
      material: materials[kind],
      triangles: trianglesIn(geometry),
      extent,
    });
  }
  return parts;
}

/** The box a bucket's instances could reach, grown by the model for the ones that overhang. */
function reachOf(bucket: Bucket, cellVoxels: number): DetailBox {
  const { part, coordinate } = bucket;
  return {
    minX: coordinate.chunkX * cellVoxels - part.extent,
    maxX: (coordinate.chunkX + 1) * cellVoxels + part.extent,
    minZ: coordinate.chunkZ * cellVoxels - part.extent,
    maxZ: (coordinate.chunkZ + 1) * cellVoxels + part.extent,
    minY: 0,
    maxY: bucket.groundTop + part.extent,
  };
}

/** Whether a bucket is too small on screen to draw, remembered for its hysteresis. */
function hideIfSmall(bucket: Bucket, view: DetailView, cellVoxels: number): boolean {
  const box = reachOf(bucket, cellVoxels);
  const distance = distanceToBox(view.x, view.y, view.z, box);
  bucket.hidden = isHidden(bucket.hidden, pixelsPerVoxel(view.lens, distance), bucket.part.extent);
  return bucket.hidden;
}

/** The cell of a layer a placement falls in. */
const cellOf = (layer: Layer, placement: Placement): ChunkCoordinate =>
  chunkOf(placement.x, placement.z, layer.cellVoxels);

export interface InstancedWorldOptions {
  /** Baked lamp light to blend into the shaded material; without it, nothing glows at night. */
  readonly lightVolume?: BakedLightVolume | null;
  /** Chunk edge in voxels; a chunk is the unit the renderer culls. */
  readonly chunkVoxels?: number;
}

export function buildInstancedWorld(
  geometries: readonly ModelGeometry[],
  placements: readonly Placement[],
  options: InstancedWorldOptions = {},
): InstancedWorld {
  const group = new Group();
  group.name = 'voxel-world';

  const lit = litMaterial(options.lightVolume ?? null);
  const glow = glowMaterial();
  // The pools, drawn with the sea's own shader; see `poolWaterMaterial.ts`.
  const poolWater = createPoolWaterMaterial(options.lightVolume ?? null);
  const windows = windowMaterial(options.lightVolume ?? null);
  for (const material of [lit, glow, poolWater.material, windows.material]) {
    standOnInstances(material);
  }
  const chunkVoxels = options.chunkVoxels ?? CHUNK_VOXELS;

  const modelById = new Map(geometries.map((entry) => [entry.id, entry]));
  const materials: Record<MaterialKind, Material> = {
    lit,
    glow,
    water: poolWater.material,
    window: windows.material,
  };
  const partsById = new Map<string, readonly ModelPart[]>(
    geometries.map((model) => [model.id, modelPartsFor(model, materials)]),
  );
  /** The largest model in the catalogue: how far any region's objects can overhang it. */
  const reach = Math.max(0, ...[...partsById.values()].flat().map((part) => part.extent));

  const regionVoxels = chunkVoxels * REGION_CHUNKS;
  const near: Layer = {
    name: '',
    cellVoxels: chunkVoxels,
    span: 0,
    geometryOf: (part) => part.geometry,
    buckets: new Map(),
  };
  const mid: Layer = {
    name: '~mid',
    cellVoxels: regionVoxels,
    span: 1,
    geometryOf: (part) => part.geometry,
    buckets: new Map(),
  };
  const far: Layer = {
    name: '~far',
    cellVoxels: regionVoxels,
    span: 1,
    geometryOf: (part) => part.far,
    buckets: new Map(),
  };
  const district: Layer = {
    name: '~district',
    cellVoxels: regionVoxels * REGION_CHUNKS,
    span: 2,
    geometryOf: (part) => part.far,
    buckets: new Map(),
  };
  const layers = [near, mid, far, district] as const;

  /** How many near buckets each chunk holds, so an emptied chunk stops being counted. */
  const bucketsPerChunk = new Map<string, number>();
  const live = new Map<string, Placement>();
  /** Placements per object type, which is what says whose geometry is uploaded. */
  const typeCounts = new Map<string, number>();
  let drawnTriangleCount = 0;
  /** Highest ground anything has stood on: how high a region's box reaches. */
  let groundTop = 0;

  const partsOf = (id: string): readonly ModelPart[] => {
    const parts = partsById.get(id);
    if (!parts) throw new Error(`No geometry was meshed for object type "${id}"`);
    return parts;
  };

  /** Set whenever a bucket comes or goes, so the next detail pass is not skipped. */
  let detailStale = true;
  let lastView: DetailView | null = null;
  /** Each region's level on the last pass, which is what its hysteresis leans on. */
  let regionLevels = new Map<string, RegionLevel>();
  /** Districts drawn whole and coarse on the last pass. */
  let farDistricts = new Set<string>();
  const detailCounts = { near: 0, mid: 0, far: 0, district: 0, hidden: 0 };

  /** The bucket a placement's part belongs in on one layer, created on first use; null if it draws nothing there. */
  function openBucket(
    layer: Layer,
    id: string,
    part: ModelPart,
    coordinate: ChunkCoordinate,
    capacity: number,
  ): Bucket | null {
    const geometry = layer.geometryOf(part);
    if (!geometry) return null;
    const cell = chunkKey(coordinate);
    const key = bucketKey(id, part.kind, cell);
    const existing = layer.buckets.get(key);
    if (existing) return existing;
    const region = layer.span === 0 ? regionOf(coordinate) : layer.span === 1 ? coordinate : null;
    const bucket = {
      cell,
      coordinate,
      region: region ? chunkKey(region) : null,
      district: chunkKey(region ? regionOf(region) : coordinate),
      part,
      geometry,
      keys: [],
      slots: new Map(),
      dirtyLow: Number.POSITIVE_INFINITY,
      dirtyHigh: Number.NEGATIVE_INFINITY,
      groundTop: 0,
      hidden: false,
    } as unknown as Bucket;
    createMesh(bucket, `${id}@${cell}${layer.name}`, capacity, 0);
    // Every layer but the near one is off until a pass says otherwise; with no
    // view at all, everything is drawn a chunk at a time and in full.
    bucket.mesh.visible = layer === near;
    group.add(bucket.mesh);
    layer.buckets.set(key, bucket);
    if (layer === near) bucketsPerChunk.set(cell, (bucketsPerChunk.get(cell) ?? 0) + 1);
    detailStale = true;
    return bucket;
  }

  function closeBucket(layer: Layer, id: string, bucket: Bucket): void {
    group.remove(bucket.mesh);
    releaseMesh(bucket);
    layer.buckets.delete(bucketKey(id, bucket.part.kind, bucket.cell));
    detailStale = true;
    if (layer !== near) return;
    const remaining = (bucketsPerChunk.get(bucket.cell) ?? 1) - 1;
    if (remaining > 0) bucketsPerChunk.set(bucket.cell, remaining);
    else bucketsPerChunk.delete(bucket.cell);
  }

  const countType = (id: string, delta: number): void => {
    const count = (typeCounts.get(id) ?? 0) + delta;
    if (count > 0) typeCounts.set(id, count);
    else typeCounts.delete(id);
  };

  function add(placement: Placement): void {
    if (live.has(placement.key)) {
      throw new Error(`"${placement.key}" already stands on the plot`);
    }
    for (const part of partsOf(placement.id)) {
      for (const layer of layers) {
        const bucket = openBucket(
          layer,
          placement.id,
          part,
          cellOf(layer, placement),
          capacityFor(1),
        );
        if (bucket) pushInstance(bucket, group, placement);
      }
      drawnTriangleCount += part.triangles;
    }
    groundTop = Math.max(groundTop, placement.y);
    live.set(placement.key, placement);
    countType(placement.id, 1);
  }

  function remove(key: string): boolean {
    const placement = live.get(key);
    if (!placement) return false;
    // Removed first, so the swap-in below reads the placements that remain.
    live.delete(key);
    for (const part of partsOf(placement.id)) {
      drawnTriangleCount -= part.triangles;
      for (const layer of layers) {
        const cell = chunkKey(cellOf(layer, placement));
        const bucket = layer.buckets.get(bucketKey(placement.id, part.kind, cell));
        if (bucket && dropInstance(bucket, key, live)) closeBucket(layer, placement.id, bucket);
      }
    }
    countType(placement.id, -1);
    return true;
  }

  /** Fills one layer's buckets for one part in bulk, so a full plot costs one allocation per bucket. */
  function seedLayer(
    layer: Layer,
    id: string,
    part: ModelPart,
    instances: readonly Placement[],
  ): void {
    for (const chunked of bucketByChunk(instances, layer.cellVoxels)) {
      const bucket = openBucket(layer, id, part, chunked.chunk, capacityFor(chunked.items.length));
      if (!bucket) continue;
      for (const placement of chunked.items) {
        bucket.slots.set(placement.key, bucket.keys.length);
        bucket.keys.push(placement.key);
        bucket.groundTop = Math.max(bucket.groundTop, placement.y);
        writeSlot(bucket, bucket.keys.length - 1, placement);
      }
      bucket.instances.instanceCount = bucket.keys.length;
      bucket.matrices.needsUpdate = true;
      boundBucket(bucket);
    }
  }

  function seed(initial: readonly Placement[]): void {
    for (const [id, instances] of instancesByType(initial)) {
      for (const part of partsOf(id)) {
        for (const layer of layers) seedLayer(layer, id, part, instances);
        drawnTriangleCount += part.triangles * instances.length;
      }
      countType(id, instances.length);
    }
    for (const placement of initial) {
      groundTop = Math.max(groundTop, placement.y);
      live.set(placement.key, placement);
    }
  }

  seed(placements);

  /** How large a voxel comes out at the nearest point of a cell of this layer. */
  function pixelsPerVoxelAt(view: DetailView, layer: Layer, coordinate: ChunkCoordinate): number {
    const { chunkX, chunkZ } = coordinate;
    const distance = distanceToBox(view.x, view.y, view.z, {
      minX: chunkX * layer.cellVoxels - reach,
      maxX: (chunkX + 1) * layer.cellVoxels + reach,
      minZ: chunkZ * layer.cellVoxels - reach,
      maxZ: (chunkZ + 1) * layer.cellVoxels + reach,
      minY: 0,
      maxY: groundTop + reach,
    });
    return pixelsPerVoxel(view.lens, distance);
  }

  /**
   * Judges every region and district through this camera, each at its nearest
   * point: the cell, grown by the largest model for whatever overhangs it, from
   * the ground to the top of the tallest thing on the highest terrace.
   *
   * Off the mid layer's buckets, because every region anything stands in has
   * one: the full geometry is never missing, where a coarse copy can be.
   */
  function judgeCells(view: DetailView): void {
    const levels = new Map<string, RegionLevel>();
    const districts = new Set<string>();
    const askedDistricts = new Set<string>();
    for (const bucket of mid.buckets.values()) {
      if (!askedDistricts.has(bucket.district)) {
        askedDistricts.add(bucket.district);
        const ppv = pixelsPerVoxelAt(view, district, regionOf(bucket.coordinate));
        if (isFar(farDistricts.has(bucket.district), ppv)) districts.add(bucket.district);
      }
      if (levels.has(bucket.cell)) continue;
      const ppv = pixelsPerVoxelAt(view, mid, bucket.coordinate);
      levels.set(bucket.cell, regionLevelOf(regionLevels.get(bucket.cell) ?? null, ppv));
    }
    regionLevels = levels;
    farDistricts = districts;
  }

  const LAYER_OF_LEVEL: Readonly<Record<RegionLevel, Layer>> = { near, mid, far };

  /** The layer a bucket's placements are drawn from this pass. */
  function drawnLayerOf(bucket: Bucket): Layer {
    if (farDistricts.has(bucket.district)) return district;
    const level = bucket.region === null ? undefined : regionLevels.get(bucket.region);
    return LAYER_OF_LEVEL[level ?? 'near'];
  }

  /** Shows a bucket unless it is too small to see, and counts which way it went. */
  function showUnlessSmall(bucket: Bucket, layer: Layer, view: DetailView | null): void {
    const hidden = view ? hideIfSmall(bucket, view, layer.cellVoxels) : false;
    bucket.mesh.visible = !hidden;
    if (hidden) detailCounts.hidden++;
    else if (layer === near) detailCounts.near++;
    else if (layer === mid) detailCounts.mid++;
    else if (layer === far) detailCounts.far++;
    else detailCounts.district++;
  }

  function updateDetail(view: DetailView | null): void {
    if (!detailStale && sameView(view, lastView)) return;
    detailStale = false;
    lastView = view;
    detailCounts.near = 0;
    detailCounts.mid = 0;
    detailCounts.far = 0;
    detailCounts.district = 0;
    detailCounts.hidden = 0;
    if (view) {
      judgeCells(view);
    } else {
      regionLevels = new Map();
      farDistricts = new Set();
    }
    for (const layer of layers) {
      for (const bucket of layer.buckets.values()) {
        if (drawnLayerOf(bucket) === layer) showUnlessSmall(bucket, layer, view);
        else bucket.mesh.visible = false;
      }
    }
  }

  const sumOverTypes = (of: (model: ModelGeometry) => number): number => {
    let total = 0;
    for (const id of typeCounts.keys()) total += of(modelById.get(id)!);
    return total;
  };

  return {
    group,
    get drawCalls() {
      return near.buckets.size;
    },
    get chunkCount() {
      return bucketsPerChunk.size;
    },
    get uniqueTriangleCount() {
      return sumOverTypes((model) => model.triangleCount);
    },
    get unmergedTriangleCount() {
      return sumOverTypes((model) => model.unmergedTriangleCount);
    },
    get drawnTriangleCount() {
      return drawnTriangleCount;
    },
    get instanceCount() {
      return live.size;
    },
    setSky(sky) {
      poolWater.setSky(sky);
    },
    setLampFactor(factor) {
      windows.setLampFactor(factor);
    },
    setOccupiedShare(share) {
      windows.setOccupiedShare(share);
    },
    add,
    remove,
    setPlacements(next) {
      const diff = diffPlacements([...live.values()], next);
      for (const key of diff.removed) remove(key);
      for (const placement of diff.added) add(placement);
    },
    updateDetail,
    get detailCounts() {
      return { ...detailCounts };
    },
    dispose() {
      for (const layer of layers) {
        for (const bucket of layer.buckets.values()) releaseMesh(bucket);
        layer.buckets.clear();
      }
      bucketsPerChunk.clear();
      group.clear();
      lit.dispose();
      glow.dispose();
      poolWater.dispose();
      windows.material.dispose();
      // The geometries are not freed here. They are the meshed catalogue's, made
      // once at load and shared by every resort built over them — including the
      // one that replaces this world, which is bound to them before this runs.
      // The showcase frees them when it goes away. See `mountShowcase`.
    },
  };
}
