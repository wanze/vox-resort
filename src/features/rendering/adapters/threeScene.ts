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

/**
 * Steps an integer depth buffer has to spread the whole scene over, and the
 * depth difference it has to keep apart: a path slab stands two voxels above the
 * ground plane, and that gap is the tightest thing in the scene.
 */
const DEPTH_STEPS = 2 ** 24;
const RESOLVED_VOXELS = 0.5;

/** How far past the camera's target the far side of the plot sits, in extents. */
const FRAMED_REACH = 1.6;

/** Near plane the camera will not go past, so close-up views stay usable. */
const MAX_NEAR = 4;

/**
 * The near plane a resort of this size needs.
 *
 * An integer depth buffer resolves no better than `z^2 / (near * 2^24)` at
 * distance `z`, so a near plane of 0.1 gives five voxels of slop at the far side
 * of a 160-tile plot — more than the two voxels between the paving and the
 * ground under it. The ground then won fragments at random and the paths
 * flickered away as the camera moved, which is why this grows with the plot
 * instead of being a constant: it is the smallest near plane that still tells
 * half a voxel apart out where the resort ends.
 *
 * `reversedDepthBuffer` below makes this moot on any backend that has it. It is
 * still derived, because the WebGL2 fallback quietly goes back to an integer
 * buffer when `EXT_clip_control` is missing, and the cap is there because a near
 * plane the camera can bump into is worse than the artefact it prevents.
 */
function nearPlaneFor(extent: number): number {
  const reach = extent * FRAMED_REACH;
  return Math.min(MAX_NEAR, Math.max(0.1, (reach * reach) / (RESOLVED_VOXELS * DEPTH_STEPS)));
}

export interface SceneHandle {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Which backend the renderer actually chose. */
  readonly backend: "webgpu" | "webgl2";
  /** Moves the whole scene to a moment of the day. */
  applySky(state: SkyState): void;
  /**
   * Re-grounds and re-frames the scene on a resort of a different size.
   *
   * The ground is rebuilt rather than resized because it is bound to the light
   * volume, and a new resort is a new bake in new textures. That is one material
   * to compile, which is what a button press can afford and a frame cannot —
   * every other material in the scene belongs to the instanced world, which is
   * rebuilt alongside it.
   */
  reframe(framing: CameraFraming, worldExtent: number, lightVolume: BakedLightVolume | null): void;
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

/** The ground plane, which is rebuilt whenever the resort under it is. */
interface Ground {
  readonly mesh: Mesh;
  dispose(): void;
}

/**
 * Lays a ground plane large enough to run past the horizon, lit by the lamps.
 *
 * Without the emissive term the lamps would light every building and leave the
 * ground they stand on black, which is the one place a street lamp is meant to
 * be seen. The same volume says how much sky each patch of ground can see, which
 * is what puts the resort's own shading on the grass between its buildings.
 */
function layGround(
  scene: Scene,
  framing: CameraFraming,
  worldExtent: number,
  lightVolume: BakedLightVolume | null,
): Ground {
  const geometry = new PlaneGeometry(worldExtent * 6, worldExtent * 6);
  const material = new MeshStandardNodeMaterial({
    color: GROUND_COLOR,
    roughness: 1,
    metalness: 0,
  });
  if (lightVolume) {
    material.emissiveNode = lightVolume.lampLight(vec3(...linearRgbOf(GROUND_COLOR)));
    material.aoNode = lightVolume.skyVisibility();
  }
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  // A hair below y = 0: a path slab's underside sits exactly on it.
  mesh.position.set(framing.target.x, -0.05, framing.target.z);
  scene.add(mesh);
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export async function createScene(options: SceneOptions): Promise<SceneHandle> {
  const { canvas, width, height, framing, worldExtent, lightVolume } = options;
  const trackTimestamp = options.trackTimestamp ?? false;

  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    trackTimestamp,
    forceWebGL: options.forceWebGL ?? false,
    // A reversed float depth buffer spends its precision evenly over the whole
    // range instead of piling it up against the near plane, which is what a
    // resort seen from far enough back to frame it needs; see `nearPlaneFor`.
    reversedDepthBuffer: true,
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
    nearPlaneFor(worldExtent),
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

  let extent = worldExtent;
  let ground = layGround(scene, framing, extent, lightVolume ?? null);

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
    reframe(nextFraming, nextExtent, nextVolume) {
      extent = nextExtent;
      ground.dispose();
      scene.remove(ground.mesh);
      ground = layGround(scene, nextFraming, extent, nextVolume);

      camera.position.set(nextFraming.position.x, nextFraming.position.y, nextFraming.position.z);
      camera.near = nearPlaneFor(extent);
      camera.far = Math.max(extent * 8, 1000);
      camera.updateProjectionMatrix();
      controls.target.set(nextFraming.target.x, nextFraming.target.y, nextFraming.target.z);
      controls.update();
      if (scene.fog instanceof Fog) {
        scene.fog.near = extent * 1.4;
        scene.fog.far = extent * 3.2;
      }
    },
    applySky(state) {
      sun.color.setHex(state.sunColor);
      sun.intensity = state.sunIntensity;
      sun.position
        .set(state.sunDirection.x, state.sunDirection.y, state.sunDirection.z)
        .multiplyScalar(extent)
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
      ground.dispose();
      renderer.dispose();
    },
  };
}
