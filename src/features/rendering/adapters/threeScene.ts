/**
 * Three.js scene setup for the showcase.
 *
 * Uses `WebGPURenderer`, which falls back to a WebGL2 backend on its own when
 * WebGPU is unavailable — the classic `WebGLRenderer` is never involved.
 *
 * The scene owns the sky: one directional sun, one ambient fill, the ground and
 * the fog all take their colour from a `SkyState`, so moving the time of day is
 * a single call. The lamps placed around the resort are a separate concern; see
 * `features/lighting/nightLights.ts`.
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  WebGPURenderer,
} from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { vec3 } from "three/tsl";
import type { BakedLightVolume } from "../../lighting/adapters/bakedLightVolume";
import { linearRgbOf } from "../../lighting/domain/lightGrid";
import type { SkyState } from "../../lighting/domain/dayNight";
import type { CameraFraming } from "../../layout/domain/worldBounds";

export const CAMERA_FOV_DEGREES = 55;

/** Ground colour under and around the resort. */
const GROUND_COLOR = 0x5d7a45;

export interface SceneHandle {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Which backend the renderer actually chose. */
  readonly backend: "webgpu" | "webgl2";
  /** Moves the whole scene to a moment of the day. */
  applySky(state: SkyState): void;
  /** Pixels actually rasterised per frame, device pixel ratio included. */
  drawingBufferSize(): { width: number; height: number };
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface SceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly framing: CameraFraming;
  /** Longest world dimension, used to size the ground and the far plane. */
  readonly worldExtent: number;
  /** Baked lamp light, so the ground catches the pools of light the lamps cast. */
  readonly lightVolume?: BakedLightVolume | null;
  /**
   * Asks the backend for GPU timestamp queries. Only the benchmark harness wants
   * them; they have to be requested when the renderer is built, not later.
   */
  readonly trackTimestamp?: boolean;
  /** Skips WebGPU and renders on the WebGL2 backend, which must also work. */
  readonly forceWebGL?: boolean;
}

export async function createScene(options: SceneOptions): Promise<SceneHandle> {
  const { canvas, width, height, framing, worldExtent, lightVolume } = options;
  const trackTimestamp = options.trackTimestamp ?? false;

  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    trackTimestamp,
    forceWebGL: options.forceWebGL ?? false,
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  renderer.setSize(width, height, false);
  await renderer.init();

  const scene = new Scene();
  const sky = new Color(0x11161d);
  scene.background = sky;
  scene.fog = new Fog(sky.getHex(), worldExtent * 1.4, worldExtent * 3.2);

  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    width / height,
    0.1,
    Math.max(worldExtent * 8, 1000),
  );
  camera.position.set(framing.position.x, framing.position.y, framing.position.z);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(framing.target.x, framing.target.y, framing.target.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.update();

  // Ambient fill keeps shaded sides readable; the sun gives every voxel face a
  // distinct brightness so silhouettes stay legible.
  const ambient = new AmbientLight(0xffffff, 1.1);
  scene.add(ambient);
  const sun = new DirectionalLight(0xffffff, 2.4);
  scene.add(sun);

  // The ground sits a hair below y = 0 so it never z-fights a path slab.
  const groundGeometry = new PlaneGeometry(worldExtent * 6, worldExtent * 6);
  const groundMaterial = new MeshStandardNodeMaterial({
    color: GROUND_COLOR,
    roughness: 1,
    metalness: 0,
  });
  // Without this the lamps would light every building and leave the ground they
  // stand on black, which is the one place a street lamp is meant to be seen.
  if (lightVolume)
    groundMaterial.emissiveNode = lightVolume.lampLight(vec3(...linearRgbOf(GROUND_COLOR)));
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(framing.target.x, -0.05, framing.target.z);
  scene.add(ground);

  return {
    renderer,
    scene,
    camera,
    controls,
    backend:
      (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
        ? "webgpu"
        : "webgl2",
    drawingBufferSize() {
      const size = renderer.getDrawingBufferSize(new Vector2());
      return { width: size.x, height: size.y };
    },
    applySky(state) {
      sun.color.setHex(state.sunColor);
      sun.intensity = state.sunIntensity;
      sun.position
        .set(state.sunDirection.x, state.sunDirection.y, state.sunDirection.z)
        .multiplyScalar(worldExtent)
        .add(controls.target);
      ambient.color.setHex(state.ambientColor);
      ambient.intensity = state.ambientIntensity;
      sky.setHex(state.skyColor);
      if (scene.fog) scene.fog.color.setHex(state.skyColor);
    },
    resize(nextWidth, nextHeight) {
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    },
    dispose() {
      controls.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
    },
  };
}
