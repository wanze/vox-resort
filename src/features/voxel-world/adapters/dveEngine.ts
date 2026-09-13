/**
 * Adapter around the Divine Voxel Engine.
 *
 * DVE normally runs split across web workers behind a Babylon.js renderer. This
 * milestone only needs its data model and mesher, so the engine is driven
 * directly on the main thread: register voxels, paint sectors, mesh sections and
 * hand the raw buffers back for Three.js to turn into geometry.
 *
 * Several DVE modules snapshot engine settings when they are first evaluated, so
 * every import below is deliberately dynamic and ordered after `syncSettings`.
 */

import type { MaterialDefinition } from '../../catalog/domain/materials';
import { materialIdFor, voxelIdFor } from '../../catalog/domain/materials';
import { groupBySection, originsFor, type VolumeSize } from '../domain/sectionGrid';
import type { PackedVoxelWrites } from '../domain/modelScratch';

/** Power-of-two exponents DVE uses to size sectors and sections. */
export interface WorldScale {
  readonly sectorPower2: VolumeSize;
  readonly sectionPower2: VolumeSize;
  /** Maximum world height in voxels. */
  readonly maxHeight: number;
  /** Horizontal half-extent of the world in voxels. */
  readonly horizontalExtent: number;
}

export interface RawSectionMesh {
  /** DVE material id of this submesh; maps back to a palette colour. */
  readonly materialId: string;
  /** World-space offset of the section the mesh came from. */
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  /** Interleaved DVE vertex stream. */
  readonly vertices: Float32Array;
  readonly vertexCount: number;
  readonly indices: Uint32Array;
}

const DIMENSION = 0;
/** A single shared placeholder texture; colour comes from the material instead. */
const PLACEHOLDER_TEXTURE = 'resort_placeholder';

const sizeFromPower2 = (power2: VolumeSize): VolumeSize => ({
  x: 1 << power2.x,
  y: 1 << power2.y,
  z: 1 << power2.z,
});

export const DEFAULT_WORLD_SCALE: WorldScale = {
  sectorPower2: { x: 4, y: 8, z: 4 },
  sectionPower2: { x: 4, y: 4, z: 4 },
  maxHeight: 256,
  // Wide enough for every model to be meshed in its own scratch region.
  horizontalExtent: 8192,
};

function sectorSizeOf(scale: WorldScale): VolumeSize {
  return sizeFromPower2(scale.sectorPower2);
}

export function sectionSizeOf(scale: WorldScale): VolumeSize {
  return sizeFromPower2(scale.sectionPower2);
}

let initialized = false;

/**
 * Boots DVE's data model and mesher for the given materials. Safe to call once
 * per page load; the engine keeps its registries in module-level statics.
 */
async function initializeEngine(
  materials: readonly MaterialDefinition[],
  scale: WorldScale,
): Promise<void> {
  if (initialized) return;

  // WorldSpaces installs the listener that turns settings into sector/section
  // maths, so it has to be loaded before the settings are pushed.
  await import('@divinevoxel/vlox/World/WorldSpaces');
  const { EngineSettings } = await import('@divinevoxel/vlox/Settings/EngineSettings');

  EngineSettings.syncSettings({
    // SharedArrayBuffer would require cross-origin isolation; this build is
    // single-threaded so plain ArrayBuffers are enough.
    memoryAndCPU: { useSharedMemory: false },
    // Lighting and AO come from the Three.js scene, not from DVE's shader data.
    mesher: { doSunLight: false, doAO: false, doColors: false },
    updating: { dirtyMechanism: false, autoRebuild: false },
    // Only the mesher's vertex layout depends on this; geometry is identical
    // either way, and the Three.js material does the shading.
    rendererSettings: {
      mode: 'webgl',
      cpuBound: false,
      bufferMode: 'multi',
      textureSize: [16, 16],
    },
    world: {
      min: { x: -scale.horizontalExtent, y: 0, z: -scale.horizontalExtent },
      max: { x: scale.horizontalExtent, y: scale.maxHeight, z: scale.horizontalExtent },
      sectorPower2Size: scale.sectorPower2,
      sectionPower2Size: scale.sectionPower2,
    },
    propagation: {
      rgbLightEnabled: false,
      sunLightEnabled: false,
      flowEnabled: false,
      powerEnabled: false,
    },
  });

  // DVE resolves every model's texture argument through a compiled texture set.
  // The showcase has no art yet, so one flat entry keeps that lookup happy.
  const { TextureManager } = await import('@divinevoxel/vlox/Textures/TextureManager');
  const { CompiledTexture } = await import('@divinevoxel/vlox/Textures/Classes/CompiledTexture');
  const placeholder = new CompiledTexture('dve_voxel');
  placeholder.textureMap[PLACEHOLDER_TEXTURE] = 0;
  TextureManager._compiledTextures.set('dve_voxel', placeholder);

  const { default: InitDataGenerator } =
    await import('@divinevoxel/vlox/Contexts/Base/Main/InitDataGenerator');
  const { default: InitMesher } = await import('@divinevoxel/vlox/Mesher/InitMesher');

  InitDataGenerator({
    threads: { nexus: false },
    // One rendered material per palette entry: DVE emits a submesh per material,
    // which is exactly the granularity the flat colours need.
    materials: materials.map((material) => ({ id: materialIdFor(material.key), properties: {} })),
    substances: [],
    voxels: materials.map((material) => ({
      id: voxelIdFor(material.key),
      name: material.key,
      title: material.key,
      properties: {
        dve_substance: 'dve_solid',
        dve_rendered_material: materialIdFor(material.key),
        dve_model_data: {
          id: 'dve_simple_cube',
          inputs: { '*': { texture: PLACEHOLDER_TEXTURE } },
        },
      },
    })),
  });
  InitMesher();

  initialized = true;
}

/**
 * Registers the materials, paints the writes into a fresh voxel world and runs
 * the face-culling mesher over every touched section.
 */
export async function buildSectionMeshes(
  materials: readonly MaterialDefinition[],
  writes: PackedVoxelWrites,
  scale: WorldScale = DEFAULT_WORLD_SCALE,
): Promise<RawSectionMesh[]> {
  const { positions, voxelIds, palette } = writes;
  await initializeEngine(materials, scale);

  const { WorldRegister } = await import('@divinevoxel/vlox/World/WorldRegister');
  const { SectionCursor } = await import('@divinevoxel/vlox/World/Cursor/SectionCursor');
  const { MeshSection } = await import('@divinevoxel/vlox/Mesher/Voxels/MeshSection');
  const { CompactedMeshData, CompactedSectionVoxelMesh } =
    await import('@divinevoxel/vlox/Mesher/Voxels/Geometry/CompactedSectionVoxelMesh');
  const { VoxelLUT } = await import('@divinevoxel/vlox/Voxels/Data/VoxelLUT');

  // Resolved once per palette entry rather than once per voxel: `setStringId` is
  // exactly this lookup followed by `setId`, and the catalogue asks it three
  // quarters of a million times for a couple of hundred answers. An id the
  // registry never heard of would otherwise paint air, silently.
  const engineIds = palette.map((id) => {
    if (!VoxelLUT.voxelIds.isRegistered(id)) {
      throw new Error(`Voxel id ${id} was never registered with the engine`);
    }
    return VoxelLUT.getVoxelIdFromString(id);
  });

  const sectorSize = sectorSizeOf(scale);
  const sectionSize = sectionSizeOf(scale);

  for (const origin of originsFor(positions, sectorSize)) {
    WorldRegister.sectors.new(DIMENSION, origin.x, origin.y, origin.z);
  }

  const cursor = new SectionCursor();
  const buckets = groupBySection(positions, sectionSize);
  for (const bucket of buckets) {
    if (!cursor.loadSection(DIMENSION, bucket.origin.x, bucket.origin.y, bucket.origin.z)) {
      throw new Error(
        `No sector backing section ${bucket.origin.x},${bucket.origin.y},${bucket.origin.z}`,
      );
    }
    for (const write of bucket.indices) {
      const voxel = cursor.getVoxel(
        positions[write * 3]!,
        positions[write * 3 + 1]!,
        positions[write * 3 + 2]!,
      );
      if (!voxel) continue;
      const engineId = engineIds[voxelIds[write]!];
      if (engineId === undefined) {
        throw new Error(
          `Write ${write} names palette entry ${voxelIds[write]}, which is not there`,
        );
      }
      voxel.setId(engineId);
      voxel.updateVoxel(0);
    }
  }

  const reader = new CompactedSectionVoxelMesh();
  const meshData = new CompactedMeshData();
  const meshes: RawSectionMesh[] = [];

  for (const bucket of buckets) {
    const buffer = MeshSection([DIMENSION, bucket.origin.x, bucket.origin.y, bucket.origin.z]);
    if (!buffer) continue;
    reader.setData(buffer);
    for (let index = 0; index < reader.getTotalMeshes(); index++) {
      reader.getMeshData(index, meshData);
      if (meshData.vertexCount === 0) continue;
      meshes.push({
        materialId: meshData.materialId,
        origin: bucket.origin,
        // Copy out: DVE reuses the cursor's views on the next iteration.
        vertices: meshData.verticies.slice(),
        vertexCount: meshData.vertexCount,
        indices: meshData.indices.slice(),
      });
    }
  }

  return meshes;
}
