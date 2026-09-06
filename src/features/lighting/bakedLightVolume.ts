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
import type { BakedLightGrid } from "./domain/lightGrid";

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
  dispose(): void;
}

function volumeTexture(data: Uint8Array, grid: BakedLightGrid): Data3DTexture {
  const { dims } = grid.spec;
  const texture = new Data3DTexture(data, dims.x, dims.y, dims.z);
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
    dispose() {
      irradianceTexture.dispose();
      directionTexture.dispose();
    },
  };
}
