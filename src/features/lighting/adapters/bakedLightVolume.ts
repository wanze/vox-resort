import {
  ClampToEdgeWrapping,
  Data3DTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three/webgpu';
import { float, mix, normalWorld, positionWorld, texture3D, uniform } from 'three/tsl';
import type { Node } from 'three/webgpu';

export type ColorNode = Node<'vec3'>;
export type FloatNode = Node<'float'>;
import type { BakedLightGrid, CellRange } from '../domain/lightGrid';

// Light arriving equally from every direction meets a flat surface at a quarter
// strength on average.
const ISOTROPIC_RESPONSE = 0.25;

export interface BakedLightVolume {
  // Added as emissive rather than as a light: it is finished radiance and must stay
  // out of the renderer's lighting loop, which this replaces.
  lampLight(albedo: ColorNode): Node<'vec3'>;
  // For `aoNode`, which Three.js applies only to ambient light; dimming the sun without
  // a shadow map would darken the lit sides too.
  skyVisibility(): FloatNode;
  setLampFactor(factor: number): void;
  // Uploads made before the next frame merge into one, so a lamp drag pays per frame.
  update(region: CellRange, scale: number): void;
  // Only the direction volume, whose alpha holds sky visibility, is re-sent.
  updateSkyVisibility(region: CellRange): void;
  dispose(): void;
}

// Three.js r185 has no sub-box upload for 3D textures on WebGPU, but `updateTexture`
// honours `layerUpdates`, so only named z-slices upload. WebGL2 re-sends the whole volume.
interface SlicedVolumeTexture extends Data3DTexture {
  layerUpdates: Set<number>;
  clearLayerUpdates(): void;
}

function volumeTexture(data: Uint8Array, grid: BakedLightGrid): SlicedVolumeTexture {
  const { dims } = grid.spec;
  const texture = new Data3DTexture(data, dims.x, dims.y, dims.z) as SlicedVolumeTexture;
  // Every slice, so the first upload is whole even if an edit arrives before it.
  texture.layerUpdates = new Set(Array.from({ length: dims.z }, (_, z) => z));
  texture.clearLayerUpdates = () => texture.layerUpdates.clear();
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  // The bake is already linear; a transfer function would darken every lamp.
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
  // Dividing by the whole span puts cell centres on texel centres, so trilinear
  // filtering smooths the grid rather than shifting it half a cell.
  const spanNode = uniform(new Vector3(cellSize * dims.x, cellSize * dims.y, cellSize * dims.z));
  const scaleNode = uniform(grid.scale);

  const coordinate = positionWorld.sub(originNode).div(spanNode);
  const irradiance = texture3D(irradianceTexture, coordinate);
  // Alpha carries sky visibility, baked separately; the channel was spare.
  const directionSample = texture3D(directionTexture, coordinate);
  const direction = directionSample.xyz.mul(2).sub(1);
  const visibility = directionSample.a;

  // The bake square-root encodes the colour to keep dim values out of the banding.
  const energy = irradiance.rgb.mul(irradiance.rgb).mul(scaleNode);
  const agreement = irradiance.a;
  const facing = normalWorld.dot(direction.normalize()).clamp(0, 1);
  const response = mix(float(ISOTROPIC_RESPONSE), facing, agreement);

  // Only the backend clears the set, so marks between two frames accumulate.
  const markSlices = (texture: SlicedVolumeTexture, region: CellRange): void => {
    for (let z = Math.max(0, region.lowZ); z <= Math.min(dims.z - 1, region.highZ); z++) {
      texture.layerUpdates.add(z);
    }
    texture.needsUpdate = true;
  };

  return {
    lampLight(albedo) {
      // Lambert's albedo / PI, as the point lights used, so the exposure does not change.
      return energy
        .mul(albedo)
        .mul(response)
        .mul(lampFactor)
        .mul(1 / Math.PI);
    },
    skyVisibility() {
      return visibility;
    },
    setLampFactor(factor) {
      lampFactor.value = factor;
    },
    update(region, scale) {
      scaleNode.value = scale;
      markSlices(irradianceTexture, region);
      markSlices(directionTexture, region);
    },
    updateSkyVisibility(region) {
      markSlices(directionTexture, region);
    },
    dispose() {
      irradianceTexture.dispose();
      directionTexture.dispose();
    },
  };
}
