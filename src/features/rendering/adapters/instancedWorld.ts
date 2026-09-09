/**
 * Builds the scene as instanced draws: one `InstancedMesh` per model, however
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
 * The scene is mutable. A bucket's buffer is allocated with room above what it
 * draws, `mesh.count` says how much of it is live, and placing an object writes
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
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type BufferGeometry,
  type Material,
} from "three/webgpu";
import { vertexColor } from "three/tsl";
import type { BakedLightVolume } from "../../lighting/adapters/bakedLightVolume";
import type { Placement } from "../../layout/domain/resortLayout";
import { rotationRadians, turnedOrigin } from "../../layout/domain/rotation";
import {
  bucketByChunk,
  capacityFor,
  CHUNK_VOXELS,
  chunkKey,
  chunkOf,
  diffPlacements,
} from "../domain/spatialChunks";
import type { ModelGeometry } from "./voxelMeshBuilder";

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
  /** Stands one more object on the plot. Throws if its key is already taken. */
  add(placement: Placement): void;
  /** Takes one object off the plot. False if nothing stood under that key. */
  remove(key: string): boolean;
  /** Reconciles the scene against a whole set of placements, changing only what differs. */
  setPlacements(placements: readonly Placement[]): void;
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
 */
function litMaterial(volume: BakedLightVolume | null): MeshStandardNodeMaterial {
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

/** The two halves of a model, and the material each is drawn with. */
type MaterialKind = "lit" | "glow";

interface ModelPart {
  readonly kind: MaterialKind;
  readonly geometry: BufferGeometry;
  readonly material: Material;
  /** Triangles in a single instance of this geometry. */
  readonly triangles: number;
}

/**
 * One `InstancedMesh`: a model's geometry of one material kind, in one chunk.
 *
 * `keys` is the slot table — `keys[i]` is the placement drawn at instance `i`,
 * and its length is the mesh's live count. The buffer behind it is longer than
 * that; see {@link capacityFor}.
 */
interface Bucket {
  readonly chunk: string;
  readonly part: ModelPart;
  mesh: InstancedMesh;
  readonly keys: string[];
  readonly slots: Map<string, number>;
  /** Slots written since the buffer was last uploaded whole. */
  dirtyLow: number;
  dirtyHigh: number;
}

/** Scratch for a single matrix write; never escapes the call that uses it. */
const scratch = new Matrix4();

const bucketKey = (id: string, kind: MaterialKind, chunk: string): string =>
  `${id}|${kind}|${chunk}`;

/** Allocates a mesh with room for `capacity` instances, drawing the first `count`. */
function createMesh(part: ModelPart, name: string, capacity: number, count: number): InstancedMesh {
  const mesh = new InstancedMesh(part.geometry, part.material, capacity);
  mesh.name = name;
  // The buffer is written a matrix at a time, which is what the dynamic hint is
  // for: it is what makes the renderer honour the update ranges below rather
  // than re-uploading the whole bucket for one changed instance.
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = count;
  return mesh;
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
  const matrix = bucket.mesh.instanceMatrix;
  matrix.clearUpdateRanges();
  matrix.addUpdateRange(bucket.dirtyLow * 16, (bucket.dirtyHigh - bucket.dirtyLow + 1) * 16);
  matrix.needsUpdate = true;
}

/**
 * Swaps in a longer buffer for this bucket, keeping what it already drew.
 *
 * The mesh itself is replaced rather than its attribute: the shader's instance
 * matrix is built from the attribute the mesh had when the renderer first saw
 * it, so an attribute swapped in underneath would never be read.
 */
function growBucket(bucket: Bucket, group: Group, capacity: number): void {
  const previous = bucket.mesh;
  bucket.mesh = createMesh(bucket.part, previous.name, capacity, bucket.keys.length);
  bucket.mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
  group.remove(previous);
  previous.dispose();
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
 * the origin and would otherwise leave the model behind it. `setPosition` writes
 * the translation column over the turn rather than multiplying, which is the
 * same matrix for none of the work.
 */
function writeSlot(bucket: Bucket, slot: number, placement: Placement): void {
  const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
  bucket.mesh.setMatrixAt(
    slot,
    scratch
      .makeRotationY(rotationRadians(placement.rotation))
      .setPosition(placement.x + origin.x, 0, placement.z + origin.z),
  );
}

/**
 * Appends one instance, growing the bucket first if it has run out of room.
 *
 * The bounding sphere is recomputed because it is what the frustum test reads:
 * left stale, the renderer would cull the new instance out of a view it is
 * plainly standing in.
 */
function pushInstance(bucket: Bucket, group: Group, placement: Placement): void {
  const slot = bucket.keys.length;
  const capacity = capacityFor(slot + 1, bucket.mesh.instanceMatrix.count);
  if (capacity !== bucket.mesh.instanceMatrix.count) growBucket(bucket, group, capacity);
  bucket.keys.push(placement.key);
  bucket.slots.set(placement.key, slot);
  bucket.mesh.count = bucket.keys.length;
  writeSlot(bucket, slot, placement);
  markDirty(bucket, slot);
  bucket.mesh.computeBoundingSphere();
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
  bucket.mesh.count = last;
  if (last > 0) bucket.mesh.computeBoundingSphere();
  return last === 0;
}

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
  group.name = "voxel-world";

  const lit = litMaterial(options.lightVolume ?? null);
  const glow = glowMaterial();
  const chunkVoxels = options.chunkVoxels ?? CHUNK_VOXELS;

  const modelById = new Map(geometries.map((entry) => [entry.id, entry]));
  const partsById = new Map<string, readonly ModelPart[]>();
  for (const model of geometries) {
    const parts: ModelPart[] = [];
    for (const [kind, geometry, material] of [
      ["lit", model.lit, lit] as const,
      ["glow", model.emissive, glow] as const,
    ]) {
      if (!geometry) continue;
      parts.push({ kind, geometry, material, triangles: (geometry.getIndex()?.count ?? 0) / 3 });
    }
    partsById.set(model.id, parts);
  }

  const buckets = new Map<string, Bucket>();
  /** How many buckets each chunk holds, so an emptied chunk stops being counted. */
  const bucketsPerChunk = new Map<string, number>();
  const live = new Map<string, Placement>();
  /** Placements per object type, which is what says whose geometry is uploaded. */
  const typeCounts = new Map<string, number>();
  let drawnTriangleCount = 0;

  const partsOf = (id: string): readonly ModelPart[] => {
    const parts = partsById.get(id);
    if (!parts) throw new Error(`No geometry was meshed for object type "${id}"`);
    return parts;
  };

  const chunkOfPlacement = (placement: Placement): string =>
    chunkKey(chunkOf(placement.x, placement.z, chunkVoxels));

  /** The bucket a placement's part belongs in, created on first use. */
  function openBucket(id: string, part: ModelPart, chunk: string, capacity: number): Bucket {
    const key = bucketKey(id, part.kind, chunk);
    const existing = buckets.get(key);
    if (existing) return existing;
    const bucket: Bucket = {
      chunk,
      part,
      mesh: createMesh(part, `${id}@${chunk}`, capacity, 0),
      keys: [],
      slots: new Map(),
      dirtyLow: Number.POSITIVE_INFINITY,
      dirtyHigh: Number.NEGATIVE_INFINITY,
    };
    group.add(bucket.mesh);
    buckets.set(key, bucket);
    bucketsPerChunk.set(chunk, (bucketsPerChunk.get(chunk) ?? 0) + 1);
    return bucket;
  }

  function closeBucket(id: string, part: ModelPart, bucket: Bucket): void {
    group.remove(bucket.mesh);
    bucket.mesh.dispose();
    buckets.delete(bucketKey(id, part.kind, bucket.chunk));
    const remaining = (bucketsPerChunk.get(bucket.chunk) ?? 1) - 1;
    if (remaining > 0) bucketsPerChunk.set(bucket.chunk, remaining);
    else bucketsPerChunk.delete(bucket.chunk);
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
    const chunk = chunkOfPlacement(placement);
    for (const part of partsOf(placement.id)) {
      pushInstance(openBucket(placement.id, part, chunk, capacityFor(1)), group, placement);
      drawnTriangleCount += part.triangles;
    }
    live.set(placement.key, placement);
    countType(placement.id, 1);
  }

  function remove(key: string): boolean {
    const placement = live.get(key);
    if (!placement) return false;
    // Removed first, so the swap-in below reads the placements that remain.
    live.delete(key);
    const chunk = chunkOfPlacement(placement);
    for (const part of partsOf(placement.id)) {
      const bucket = buckets.get(bucketKey(placement.id, part.kind, chunk));
      if (!bucket) continue;
      drawnTriangleCount -= part.triangles;
      if (dropInstance(bucket, key, live)) closeBucket(placement.id, part, bucket);
    }
    countType(placement.id, -1);
    return true;
  }

  /** Fills the buckets in bulk, so a full plot costs one allocation per bucket. */
  function seed(initial: readonly Placement[]): void {
    for (const [id, instances] of instancesByType(initial)) {
      for (const part of partsOf(id)) {
        for (const chunked of bucketByChunk(instances, chunkVoxels)) {
          const chunk = chunkKey(chunked.chunk);
          const bucket = openBucket(id, part, chunk, capacityFor(chunked.items.length));
          for (const placement of chunked.items) {
            bucket.slots.set(placement.key, bucket.keys.length);
            bucket.keys.push(placement.key);
            writeSlot(bucket, bucket.keys.length - 1, placement);
          }
          bucket.mesh.count = bucket.keys.length;
          bucket.mesh.instanceMatrix.needsUpdate = true;
          bucket.mesh.computeBoundingSphere();
          drawnTriangleCount += part.triangles * chunked.items.length;
        }
      }
      countType(id, instances.length);
    }
    for (const placement of initial) live.set(placement.key, placement);
  }

  seed(placements);

  const sumOverTypes = (of: (model: ModelGeometry) => number): number => {
    let total = 0;
    for (const id of typeCounts.keys()) total += of(modelById.get(id)!);
    return total;
  };

  return {
    group,
    get drawCalls() {
      return buckets.size;
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
    add,
    remove,
    setPlacements(next) {
      const diff = diffPlacements([...live.values()], next);
      for (const key of diff.removed) remove(key);
      for (const placement of diff.added) add(placement);
    },
    dispose() {
      for (const bucket of buckets.values()) bucket.mesh.dispose();
      buckets.clear();
      bucketsPerChunk.clear();
      group.clear();
      lit.dispose();
      glow.dispose();
      for (const model of geometries) {
        model.lit?.dispose();
        model.emissive?.dispose();
      }
    },
  };
}
