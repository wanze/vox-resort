// Buckets are plain Meshes over an instanced geometry, not InstancedMeshes: the WebGPU
// renderer keys built shaders on each InstancedMesh's uuid, so every bucket paid a full
// node build. Read as an attribute in positionNode, the matrices let buckets share one.

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
  readonly drawCalls: number;
  readonly chunkCount: number;
  readonly uniqueTriangleCount: number;
  readonly unmergedTriangleCount: number;
  readonly drawnTriangleCount: number;
  readonly instanceCount: number;
  setSky(sky: number): void;
  setLampFactor(factor: number): void;
  setOccupiedShare(share: number): void;
  add(placement: Placement): void;
  remove(key: string): boolean;
  setPlacements(placements: readonly Placement[]): void;
  updateDetail(view: DetailView | null): void;
  readonly detailCounts: DetailCounts;
  dispose(): void;
}

// Shared by every model: a material per model is a shader program per model to compile.
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

function glowMaterial(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ vertexColors: true });
}

// Half: every window lit reads as a render left on, a few reads as an empty hotel.
const FULL_LIT_WINDOW_FRACTION = 0.5;

const WINDOW_GLOW = 0xffc27a;

// Under one: a pane at full strength blows out against the street lamps in front of it.
const WINDOW_GLOW_STRENGTH = 0.85;

// Each room takes its own moment, so a building does not switch on like a signboard.
const WINDOW_DUSK_SPREAD = 0.55;
const WINDOW_DUSK_RAMP = 0.18;

const hashOf = (value: Node<'float'>): Node<'float'> => fract(sin(value).mul(43758.5453));

interface WindowMaterial {
  readonly material: MeshStandardNodeMaterial;
  setLampFactor(factor: number): void;
  setOccupiedShare(share: number): void;
}

// Decided on the GPU: every hotel draws the one catalogue mesh, so only the pane and the
// instance index can tell rooms apart. Hashed in the vertex stage, because instanceIndex
// (gl_InstanceID on WebGL2) does not exist in a fragment shader.
function windowMaterial(volume: BakedLightVolume | null): WindowMaterial {
  const lampFactor = uniform(0);
  const litFraction = uniform(FULL_LIT_WINDOW_FRACTION);
  const material = litMaterial(volume);

  // Folded through the golden ratio and wrapped: a raw index puts sin in the thousands,
  // where GPU precision decides the answer and shows as banding down a facade.
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
  // Added to the lamp light, so the glass still catches the street lamp outside.
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

type MaterialKind = 'lit' | 'glow' | 'water' | 'window';

interface ModelPart {
  readonly kind: MaterialKind;
  readonly geometry: BufferGeometry;
  readonly far: BufferGeometry | null;
  readonly material: Material;
  readonly triangles: number;
  readonly extent: number;
}

interface Bucket {
  readonly cell: string;
  readonly coordinate: ChunkCoordinate;
  readonly part: ModelPart;
  readonly geometry: BufferGeometry;
  mesh: Mesh;
  instances: InstancedBufferGeometry;
  matrices: InstancedInterleavedBuffer;
  readonly keys: string[];
  readonly slots: Map<string, number>;
  dirtyLow: number;
  dirtyHigh: number;
  groundTop: number;
  hidden: boolean;
  readonly region: string | null;
  readonly district: string;
}

interface Layer {
  readonly name: string;
  readonly cellVoxels: number;
  readonly span: 0 | 1 | 2;
  readonly geometryOf: (part: ModelPart) => BufferGeometry | null;
  readonly buckets: Map<string, Bucket>;
}

export interface DetailCounts {
  readonly near: number;
  readonly mid: number;
  readonly far: number;
  readonly district: number;
  readonly hidden: number;
}

function sameView(a: DetailView | null, b: DetailView | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.x !== b.x || a.y !== b.y || a.z !== b.z || a.lens.kind !== b.lens.kind) return false;
  return a.lens.kind === 'perspective'
    ? a.lens.focalPixels === (b.lens as typeof a.lens).focalPixels
    : a.lens.pixelsPerVoxel === (b.lens as typeof a.lens).pixelsPerVoxel;
}

const scratch = new Matrix4();

const bucketKey = (id: string, kind: MaterialKind, cell: string): string => `${id}|${kind}|${cell}`;

const MATRIX_COLUMNS = [
  'instanceColumn0',
  'instanceColumn1',
  'instanceColumn2',
  'instanceColumn3',
] as const;

// Only the position is transformed: the lit materials shade flat from its derivatives,
// the glow is unlit and the water bends a normal of its own.
function standOnInstances(material: NodeMaterial): void {
  const [c0, c1, c2, c3] = MATRIX_COLUMNS.map((name) => attribute<'vec4'>(name, 'vec4'));
  const matrix = mat4(c0!, c1!, c2!, c3!);
  material.positionNode = matrix.mul(vec4(positionLocal, 1)).xyz;
}

// One interleaved buffer, so the matrices take one of the eight vertex buffers WebGPU allows.
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
  // Dynamic, so the renderer honours the update ranges instead of re-uploading the bucket.
  matrices.setUsage(DynamicDrawUsage);
  for (const [column, name] of MATRIX_COLUMNS.entries()) {
    instances.setAttribute(name, new InterleavedBufferAttribute(matrices, 4, column * 4));
  }
  instances.instanceCount = 0;
  // Kept by hand: the geometry's own would bound one model at the origin.
  instances.boundingSphere = new Sphere().makeEmpty();
  return { instances, matrices };
}

function createMesh(bucket: Bucket, name: string, capacity: number, count: number): void {
  const { instances, matrices } = instancedGeometryOf(bucket.geometry, capacity);
  instances.instanceCount = count;
  const mesh = new Mesh(instances, bucket.part.material);
  mesh.name = name;
  // The instances carry the placement, and a per-frame matrix walk over
  // thousands of meshes was a real cost.
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  bucket.mesh = mesh;
  bucket.instances = instances;
  bucket.matrices = matrices;
}

// Disposing frees the instance buffer on the GPU; the shared catalogue attributes are
// simply uploaded again by the next bucket that draws them.
function releaseMesh(bucket: Bucket): void {
  bucket.instances.dispose();
}

const instanceSphere = new Sphere();

function boundSlot(bucket: Bucket, slot: number): void {
  const source = bucket.geometry;
  if (!source.boundingSphere) source.computeBoundingSphere();
  scratch.fromArray(bucket.matrices.array, slot * 16);
  instanceSphere.copy(source.boundingSphere!).applyMatrix4(scratch);
  bucket.instances.boundingSphere!.union(instanceSphere);
}

// A stale sphere would make the frustum test cull instances that are plainly in view.
function boundBucket(bucket: Bucket): void {
  bucket.instances.boundingSphere!.makeEmpty();
  for (let slot = 0; slot < bucket.keys.length; slot++) boundSlot(bucket, slot);
}

// One union range, not a list: Three.js copies the ranges every frame without consuming
// them, so a list would only ever grow.
function markDirty(bucket: Bucket, slot: number): void {
  bucket.dirtyLow = Math.min(bucket.dirtyLow, slot);
  bucket.dirtyHigh = Math.max(bucket.dirtyHigh, slot);
  const matrices = bucket.matrices;
  matrices.clearUpdateRanges();
  matrices.addUpdateRange(bucket.dirtyLow * 16, (bucket.dirtyHigh - bucket.dirtyLow + 1) * 16);
  matrices.needsUpdate = true;
}

// The mesh is replaced, not its attribute: the renderer keeps the attributes a
// mesh first drew with.
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

// The turned origin brings the model back into its footprint, since a rotation
// turns about the origin.
function writeSlot(bucket: Bucket, slot: number, placement: Placement): void {
  const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
  scratch
    .makeRotationY(rotationRadians(placement.rotation))
    .setPosition(placement.x + origin.x, placement.y, placement.z + origin.z)
    .toArray(bucket.matrices.array, slot * 16);
}

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

// Moves the last instance into the hole: instance order carries no meaning.
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

const SURFACES = [
  ['lit', 'lit'],
  ['glow', 'emissive'],
  ['water', 'water'],
  ['window', 'window'],
] as const;

const trianglesIn = (geometry: BufferGeometry): number => (geometry.getIndex()?.count ?? 0) / 3;

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

function hideIfSmall(bucket: Bucket, view: DetailView, cellVoxels: number): boolean {
  const box = reachOf(bucket, cellVoxels);
  const distance = distanceToBox(view.x, view.y, view.z, box);
  bucket.hidden = isHidden(bucket.hidden, pixelsPerVoxel(view.lens, distance), bucket.part.extent);
  return bucket.hidden;
}

const cellOf = (layer: Layer, placement: Placement): ChunkCoordinate =>
  chunkOf(placement.x, placement.z, layer.cellVoxels);

export interface InstancedWorldOptions {
  readonly lightVolume?: BakedLightVolume | null;
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

  const bucketsPerChunk = new Map<string, number>();
  const live = new Map<string, Placement>();
  const typeCounts = new Map<string, number>();
  let drawnTriangleCount = 0;
  let groundTop = 0;

  const partsOf = (id: string): readonly ModelPart[] => {
    const parts = partsById.get(id);
    if (!parts) throw new Error(`No geometry was meshed for object type "${id}"`);
    return parts;
  };

  let detailStale = true;
  let lastView: DetailView | null = null;
  let regionLevels = new Map<string, RegionLevel>();
  let farDistricts = new Set<string>();
  const detailCounts = { near: 0, mid: 0, far: 0, district: 0, hidden: 0 };

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
    // With no view at all, everything is drawn a chunk at a time and in full.
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

  // Judged off the mid layer: every occupied region has a bucket there, where a
  // coarse copy can be missing.
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

  function drawnLayerOf(bucket: Bucket): Layer {
    if (farDistricts.has(bucket.district)) return district;
    const level = bucket.region === null ? undefined : regionLevels.get(bucket.region);
    return LAYER_OF_LEVEL[level ?? 'near'];
  }

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
      // The geometries belong to the meshed catalogue and are shared with the world that
      // replaces this one; the showcase frees them.
    },
  };
}
