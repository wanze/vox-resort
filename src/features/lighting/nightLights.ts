/**
 * The resort's own lights: street lamps, torches, the pool floods.
 *
 * Every model declares where it glows, so the plan yields a few hundred light
 * anchors. Only a small pool of real point lights exists; each frame budget the
 * pool is aimed at the anchors nearest the camera and scaled by how dark it is.
 * Below a threshold the whole pool is simply switched off, which is what keeps
 * a bright noon frame as cheap as it was before any of this existed.
 */

import { PointLight, type Object3D } from "three/webgpu";
import { nearestAnchors, type LightAnchor, type Point3 } from "./domain/lightAnchors";

/**
 * How many point lights ever exist; the rest of the anchors stay dark.
 *
 * The cost is steeply non-linear, because Three.js compiles the light count
 * into the shader and every lit fragment then walks the whole list. Measured on
 * this resort (1 101 instances, 3.1 M triangles, WebGPU): 8 lights held 60 fps,
 * 16 gave 50, and 24 dropped to 23. Sixteen is the point where the resort still
 * reads as lit after dark without the frame budget going with it.
 */
export const MAX_ACTIVE_LIGHTS = 16;

/** Frames between re-picking which anchors the pool points at. */
const REPICK_INTERVAL = 12;

export interface NightLights {
  /** Aims and dims the pool. `factor` is the day/night lamp factor, 0..1. */
  update(cameraPosition: Point3, factor: number): void;
  /** Point lights currently switched on. */
  readonly activeCount: number;
  dispose(): void;
}

export interface NightLightsOptions {
  readonly parent: Object3D;
  readonly anchors: readonly LightAnchor[];
  readonly maxLights?: number;
}

export function createNightLights(options: NightLightsOptions): NightLights {
  const { parent, anchors } = options;
  const poolSize = Math.min(options.maxLights ?? MAX_ACTIVE_LIGHTS, anchors.length);

  const pool = Array.from({ length: poolSize }, () => {
    const light = new PointLight(0xffffff, 0, 1);
    light.visible = false;
    parent.add(light);
    return light;
  });

  let frame = 0;
  let chosen: LightAnchor[] = [];
  let active = 0;

  return {
    get activeCount() {
      return active;
    },
    update(cameraPosition, factor) {
      if (factor <= 0.01) {
        if (active !== 0) {
          for (const light of pool) light.visible = false;
          active = 0;
        }
        return;
      }
      if (frame % REPICK_INTERVAL === 0 || chosen.length === 0) {
        chosen = nearestAnchors(anchors, cameraPosition, poolSize);
      }
      frame++;
      pool.forEach((light, index) => {
        const anchor = chosen[index];
        if (!anchor) {
          light.visible = false;
          return;
        }
        light.visible = true;
        light.position.set(anchor.x, anchor.y, anchor.z);
        light.color.setHex(anchor.color);
        light.distance = anchor.distance;
        light.intensity = anchor.intensity * factor;
      });
      active = Math.min(chosen.length, poolSize);
    },
    dispose() {
      for (const light of pool) {
        light.removeFromParent();
        light.dispose();
      }
      pool.length = 0;
    },
  };
}
