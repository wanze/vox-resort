import type { DirectionalLight, Scene } from 'three/webgpu';
import type { Vector3 } from '../../lighting/domain/dayNight';
import {
  SHADOW_MAP_SIZE,
  SHADOW_STRENGTH,
  shadowFrameFor,
  type ShadowFrame,
  type ShadowQuality,
  type ShadowView,
} from '../domain/sunShadows';

export interface SunShadowRig {
  // Switching changes every lit shader's light set: one recompile each way.
  setQuality(quality: ShadowQuality): void;
  setSunDirection(direction: Vector3): void;
  // Before the render: the map follows the view every frame it is on.
  fit(view: ShadowView): void;
}

// In voxels. Past the box's own size, so towers on its far side still fall inside the depth range.
const LIGHT_STANDOFF = 512;

// The terraces are whole voxels apart, so half a voxel along the normal clears acne on them all.
const NORMAL_BIAS = 0.5;
const DEPTH_BIAS = -0.0002;

export function createSunShadowRig(scene: Scene, sun: DirectionalLight): SunShadowRig {
  // Moving the target moves the light's direction, so it has to keep its world matrix current.
  scene.add(sun.target);
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = DEPTH_BIAS;
  sun.shadow.normalBias = NORMAL_BIAS;
  sun.shadow.intensity = SHADOW_STRENGTH;

  let quality: ShadowQuality = 'low';
  let sunDirection: Vector3 = { x: 0, y: 1, z: 0 };

  const aim = (frame: ShadowFrame): void => {
    const { focus, halfSize, sun: toward } = frame;
    const standoff = halfSize + LIGHT_STANDOFF;
    sun.position.set(
      focus.x + toward.x * standoff,
      focus.y + toward.y * standoff,
      focus.z + toward.z * standoff,
    );
    sun.target.position.set(focus.x, focus.y, focus.z);
    sun.target.updateMatrixWorld();
    const camera = sun.shadow.camera;
    camera.left = -halfSize;
    camera.right = halfSize;
    camera.top = halfSize;
    camera.bottom = -halfSize;
    camera.near = 1;
    camera.far = standoff * 2;
    camera.updateProjectionMatrix();
  };

  // Without a map the light is a direction only: offsetting its position without its target
  // tilted the light away from the sun the sky draws.
  const aimUnshadowed = (): void => {
    sun.position.set(sunDirection.x, sunDirection.y, sunDirection.z);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
  };

  return {
    setQuality(next) {
      if (next === quality) return;
      quality = next;
      sun.castShadow = quality === 'high';
      if (quality === 'low') aimUnshadowed();
    },
    setSunDirection(direction) {
      sunDirection = direction;
      if (quality === 'low') aimUnshadowed();
    },
    fit(view) {
      if (quality === 'high') aim(shadowFrameFor(view, sunDirection));
    },
  };
}
