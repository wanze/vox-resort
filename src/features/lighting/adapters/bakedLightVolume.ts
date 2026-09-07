/**
 * The GPU half of the baked lamp light: two 3D textures and the TSL that reads
 * them back.
 *
 * `domain/lightGrid.ts` does the arithmetic and explains why. This module only
 * uploads the result and expresses the reconstruction as a node, so any material
 * can add lamp light with one property assignment:
 *
 * ```ts
 * material.emissiveNode = volume.lampLight(albedoNode);
 * ```
 *
 * It is `emissiveNode` rather than a light: the contribution is already the
 * finished outgoing radiance, and adding it to the emissive term keeps it clear
 * of the renderer's own lighting loop — which is exactly the loop this replaces.
 *
 * Both backends handle this: TSL compiles the same graph to WGSL and to GLSL ES
 * 3.0, where the volumes become `texture_3d` and `sampler3D` respectively.
 */

import {
  ClampToEdgeWrapping,
  Data3DTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from "three/webgpu";
import { float, mix, normalWorld, positionWorld, texture3D, uniform } from "three/tsl";
import type { Node } from "three/webgpu";

/** A TSL node carrying an RGB albedo. */
export type ColorNode = Node<"vec3">;
import type { BakedLightGrid, CellRange } from "../domain/lightGrid";

/**
 * What a surface receives when the lamps around it agree on no direction at all.
 *
 * Light arriving equally from every direction meets a flat surface at an average
 * of a quarter strength, so that is what a cell with no dominant direction —
 * the middle of a ring of lamps, say — shades to.
 */
const ISOTROPIC_RESPONSE = 0.25;

export interface BakedLightVolume {
  /**
   * Outgoing lamp radiance for a surface of this albedo, as a `vec3` node.
   * Zero in daylight, because the day/night factor scales it.
   */
  lampLight(albedo: ColorNode): Node<"vec3">;
  /** The day/night lamp factor, 0 by day and 1 after dark. */
  setLampFactor(factor: number): void;
  /**
   * Sends a re-baked block of cells to the GPU, and the scale it was baked
   * against.
   *
   * The bytes are read from the arrays the volume was built on, so the caller
   * writes into those and then says which cells it touched. Uploads made before
   * the next frame is drawn are merged into one; a drag that stands a lamp per
   * pointer move pays for a frame's worth of them, not for each.
   */
  update(region: CellRange, scale: number): void;
  dispose(): void;
}

/**
 * A `Data3DTexture` that can be re-uploaded a z-slice at a time.
 *
 * Three.js has no CPU-side sub-box upload for a 3D texture in r185. Marking one
 * `needsUpdate` re-sends the whole volume, and neither of the two mechanisms
 * that sound like they would help does:
 *
 * - `updateRanges` is honoured for buffer attributes and for 2D `DataTexture` on
 *   the WebGL renderer. The WebGPU backend does not read it for textures at all.
 * - `Renderer.copyTextureToTexture` does take a `Box3` and does target 3D
 *   textures, but on the WebGPU backend it is a command-encoder copy between two
 *   textures already resident on the GPU. Driving it from an array in JavaScript
 *   means uploading a staging texture per edit first, which is the upload it was
 *   supposed to avoid.
 *
 * What is there is `layerUpdates`: `WebGPUTextureUtils.updateTexture` branches on
 * it for `isData3DTexture`, and uploads exactly the z-slices it names. The class
 * that ships the set is `DataArrayTexture`, not `Data3DTexture` — but the branch
 * is guarded on the property being present rather than on the class, so a
 * `Data3DTexture` that carries the same two members takes the same path.
 *
 * What that costs, on this plot's 482 x 27 x 438 grid:
 *
 * - Whole volume: 43.5 MB across the two textures, sent as one `writeTexture`
 *   per slice per texture — 876 calls. Fine once at load; not fine on a click,
 *   and emphatically not fine on a drag that stands one lamp per pointer move.
 * - The slices one street lamp's 46-voxel reach spans: 25 of them, 1.2 MB per
 *   texture, 2.5 MB and 50 calls in total. Seventeen times less.
 * - The box that lamp actually changed is 25 x 19 x 25 cells — 46 kB per texture
 *   — so a true sub-box upload would be twenty-seven times better again. It is
 *   not available, and the slice is close enough that chasing it through a
 *   staging texture is not worth the machinery.
 *
 * The WebGL2 fallback ignores `layerUpdates` for a 3D texture and re-sends the
 * whole volume however few slices are marked, so on that backend an edit costs
 * the full 43.5 MB. It is the fallback; it is correct, and it is slower.
 */
interface SlicedVolumeTexture extends Data3DTexture {
  /** Z-slices to send on the next upload. */
  layerUpdates: Set<number>;
  clearLayerUpdates(): void;
}

function volumeTexture(data: Uint8Array, grid: BakedLightGrid): SlicedVolumeTexture {
  const { dims } = grid.spec;
  const texture = new Data3DTexture(data, dims.x, dims.y, dims.z) as SlicedVolumeTexture;
  // Every slice, so that the first upload is a whole one however early an edit
  // arrives: a set that named only the block one lamp changed would leave the
  // rest of a texture that had never been sent at whatever the GPU allocated.
  // The backend uploads a 3D texture slice by slice regardless, so naming them
  // all costs nothing, and it clears the set once it has them.
  texture.layerUpdates = new Set(Array.from({ length: dims.z }, (_, z) => z));
  texture.clearLayerUpdates = () => texture.layerUpdates.clear();
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  // The bake already works in linear light; letting the sampler apply a transfer
  // function would darken every lamp on the plot.
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createBakedLightVolume(grid: BakedLightGrid): BakedLightVolume {
  const { origin, cellSize, dims } = grid.spec;
  const irradianceTexture = volumeTexture(grid.irradiance, grid);
  const directionTexture = volumeTexture(grid.direction, grid);

  const lampFactor = uniform(0);
  const originNode = uniform(new Vector3(origin.x, origin.y, origin.z));
  // Dividing by cell size and then by the cell count lands a world position at
  // the centre of its cell on the sampler's texel centre, which is what makes
  // the trilinear filter smooth the grid out rather than shift it half a cell.
  const spanNode = uniform(new Vector3(cellSize * dims.x, cellSize * dims.y, cellSize * dims.z));
  const scaleNode = uniform(grid.scale);

  const coordinate = positionWorld.sub(originNode).div(spanNode);
  const irradiance = texture3D(irradianceTexture, coordinate);
  const direction = texture3D(directionTexture, coordinate).xyz.mul(2).sub(1);

  // The bake square-root encodes the colour to keep the dim majority of the
  // scene out of the banding; squaring it undoes that.
  const energy = irradiance.rgb.mul(irradiance.rgb).mul(scaleNode);
  const agreement = irradiance.a;
  const facing = normalWorld.dot(direction.normalize()).clamp(0, 1);
  const response = mix(float(ISOTROPIC_RESPONSE), facing, agreement);

  /**
   * Marks the slices a block of cells lies in, for the backend to pick up.
   *
   * The set is only cleared by the backend that consumed it, so slices marked
   * between two frames accumulate rather than replacing each other, and the
   * WebGL2 fallback — which never clears it — simply keeps a set that is at most
   * one entry per slice and re-sends everything regardless.
   */
  const markSlices = (texture: SlicedVolumeTexture, region: CellRange): void => {
    for (let z = Math.max(0, region.lowZ); z <= Math.min(dims.z - 1, region.highZ); z++) {
      texture.layerUpdates.add(z);
    }
    texture.needsUpdate = true;
  };

  return {
    lampLight(albedo) {
      // Lambert's `albedo / PI`, the same factor the renderer's own point lights
      // went through, so switching to the bake does not change the exposure.
      return energy
        .mul(albedo)
        .mul(response)
        .mul(lampFactor)
        .mul(1 / Math.PI);
    },
    setLampFactor(factor) {
      lampFactor.value = factor;
    },
    update(region, scale) {
      scaleNode.value = scale;
      markSlices(irradianceTexture, region);
      markSlices(directionTexture, region);
    },
    dispose() {
      irradianceTexture.dispose();
      directionTexture.dispose();
    },
  };
}
