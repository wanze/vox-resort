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
 *
 * It also owns both ways of looking at the plot — the perspective camera you
 * fly around and the orthographic one you read the plan on. They are two cameras
 * and one set of controls, because everything that makes a camera usable
 * (damping, the mouse buttons, where it is pointed, whether the build pointer
 * has taken the left button off it) is state that would otherwise have to be
 * kept in sync between two of them. See `setCameraMode`.
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardNodeMaterial,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vec3 } from 'three/tsl';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import type { SkyState } from '../../lighting/domain/dayNight';
import type {
  CameraFraming,
  CameraMode,
  CompassDirection,
  OrthographicFraming,
  WorldBounds,
} from '../../layout/domain/worldBounds';
import { isometricFramingFor } from '../../layout/domain/worldBounds';

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
 * How far the isometric view may be zoomed, as a multiple of the framing that
 * fits the whole plot. Continuous between the two — there are no steps.
 */
const ISO_MIN_ZOOM = 0.2;
const ISO_MAX_ZOOM = 60;

/**
 * The near plane a *perspective* resort of this size needs.
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
 *
 * None of this applies to the orthographic camera: its depth is linear, so the
 * precision is the same everywhere and there is nothing to buy by cropping the
 * range. Its planes come from `isometricFramingFor` instead, which puts both of
 * them a plot's diameter clear of anything.
 */
function nearPlaneFor(extent: number): number {
  const reach = extent * FRAMED_REACH;
  return Math.min(MAX_NEAR, Math.max(0.1, (reach * reach) / (RESOLVED_VOXELS * DEPTH_STEPS)));
}

/** Longest world dimension: what sizes the ground, the fog and the far plane. */
function extentOf(bounds: WorldBounds): number {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);
}

/** Which backend the renderer settled on, which the HUD and a bench report. */
function backendOf(renderer: WebGPURenderer): 'webgpu' | 'webgl2' {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
    ? 'webgpu'
    : 'webgl2';
}

/** What the mouse and the touchscreen do, which follows the mode. */
interface ControlProfile {
  readonly mouseButtons: OrbitControls['mouseButtons'];
  readonly touches: OrbitControls['touches'];
}

/**
 * The buttons for a mode, with the left one lent to the build pointer or not.
 *
 * The four compass points *are* the isometric rotation, so orbiting is off there
 * and the left button pans instead of turning the camera. Whatever the left
 * button does, the build pointer can borrow — and then it moves to the right,
 * which is the one rule this has.
 */
function controlProfileFor(mode: CameraMode, leftLent: boolean): ControlProfile {
  const left = mode === 'isometric' ? MOUSE.PAN : MOUSE.ROTATE;
  if (leftLent) {
    return {
      mouseButtons: { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: left },
      touches: { ONE: null, TWO: TOUCH.DOLLY_PAN },
    };
  }
  return {
    mouseButtons: { LEFT: left, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN },
    touches: { ONE: mode === 'isometric' ? TOUCH.PAN : TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN },
  };
}

export interface SceneHandle {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  /** Whichever camera the current mode renders through. */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly controls: OrbitControls<PerspectiveCamera | OrthographicCamera>;
  /** Which backend the renderer actually chose. */
  readonly backend: 'webgpu' | 'webgl2';
  readonly cameraMode: CameraMode;
  /** Which compass point the isometric camera stands over. */
  readonly isoDirection: CompassDirection;
  /**
   * Switches between the perspective and isometric views.
   *
   * Each mode keeps where it was pointed, so coming back to one finds it as it
   * was left rather than snapped back to the framing it started at.
   */
  setCameraMode(mode: CameraMode): void;
  /** Turns the isometric camera to another compass point, around what it is on. */
  setIsoDirection(direction: CompassDirection): void;
  /**
   * Takes the left mouse button off the camera, or hands it back exactly as it
   * was.
   *
   * The build pointer needs the left button while a type is armed, and what the
   * camera does with that button depends on the mode: the perspective view
   * orbits with it, the isometric view pans. Whichever it is moves to the right
   * button for as long as the pointer has the left one. It is the scene's job
   * rather than the pointer's precisely because the answer changes with the
   * mode, and the mode can change while a type is armed.
   */
  takeLeftButton(taken: boolean): void;
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
   *
   * Both cameras are re-framed and the current mode is kept: generating a resort
   * changes what you are looking at, not how.
   */
  reframe(bounds: WorldBounds, framing: CameraFraming, lightVolume: BakedLightVolume | null): void;
  /** Pixels actually rasterised per frame, device pixel ratio included. */
  drawingBufferSize(): { width: number; height: number };
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface SceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** How much ground the resort covers: what both cameras are framed on. */
  readonly bounds: WorldBounds;
  /**
   * Where the perspective camera stands. Passed in rather than derived because
   * the benchmark harness overrides it with a fixed view; the isometric framing
   * is derived here, since turning the camera has to re-derive it anyway.
   */
  readonly framing: CameraFraming;
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
  const { canvas, width, height, framing, bounds, lightVolume } = options;
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

  let plot = bounds;
  let extent = extentOf(plot);
  let aspect = width / height;
  let mode: CameraMode = 'perspective';
  // The perspective camera already stands over the plot's south-east corner, so
  // the isometric view opens on the same one rather than behind the viewer.
  let direction: CompassDirection = 'southeast';
  let isoFraming: OrthographicFraming = isometricFramingFor(plot, direction);
  let leftButtonTaken = false;

  /**
   * Distance haze, and why only the perspective camera gets it.
   *
   * Fog is measured in view-space distance, and under an orthographic camera
   * that distance is a number we picked: the camera stands wherever the framing
   * parked it, and moving it changes nothing about the image except how foggy
   * the resort comes out. There is no horizon in an orthographic view for the
   * haze to run out to either — the ground fills the frame edge to edge whatever
   * the elevation. So the isometric view is drawn clear.
   *
   * Drawn clear by pushing the fog out past the far plane rather than by taking
   * it out of the scene: `scene.fog` is compiled into every material's shader,
   * so clearing it would rebuild the whole resort's materials in the middle of a
   * mode switch. Pushed out it contributes nothing and costs nothing.
   */
  const fog = new Fog(sky.getHex(), extent * 1.4, extent * 3.2);
  scene.fog = fog;

  const perspectiveCamera = new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    aspect,
    nearPlaneFor(extent),
    Math.max(extent * 8, 1000),
  );
  perspectiveCamera.position.set(framing.position.x, framing.position.y, framing.position.z);

  const isoCamera = new OrthographicCamera(-1, 1, 1, -1, isoFraming.near, isoFraming.far);

  /**
   * Cuts the orthographic view box to the canvas.
   *
   * The framing says how much world has to fit across the screen and up it; the
   * shape of the window decides which of the two is the binding constraint.
   * `camera.zoom` scales the box rather than replacing it, so a resize leaves a
   * zoom exactly where the user put it.
   */
  const cutIsoBox = (): void => {
    const halfHeight = Math.max(isoFraming.viewHeight / 2, isoFraming.viewWidth / (2 * aspect));
    isoCamera.left = -halfHeight * aspect;
    isoCamera.right = halfHeight * aspect;
    isoCamera.top = halfHeight;
    isoCamera.bottom = -halfHeight;
    isoCamera.near = isoFraming.near;
    isoCamera.far = isoFraming.far;
    isoCamera.updateProjectionMatrix();
  };
  cutIsoBox();
  isoCamera.position.set(isoFraming.position.x, isoFraming.position.y, isoFraming.position.z);

  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(
    perspectiveCamera,
    canvas,
  );
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  // Only the orthographic camera reads these; a perspective dolly is a distance.
  controls.minZoom = ISO_MIN_ZOOM;
  controls.maxZoom = ISO_MAX_ZOOM;

  /** Where each mode is pointed, so switching away and back finds it as it was. */
  const targets: Record<CameraMode, Vector3> = {
    perspective: new Vector3(framing.target.x, framing.target.y, framing.target.z),
    isometric: new Vector3(isoFraming.target.x, isoFraming.target.y, isoFraming.target.z),
  };
  controls.target.copy(targets.perspective);

  const cameraFor = (of: CameraMode): PerspectiveCamera | OrthographicCamera =>
    of === 'perspective' ? perspectiveCamera : isoCamera;

  /** Where the haze starts and ends, or nowhere at all in the isometric view. */
  const applyFog = (): void => {
    if (mode === 'isometric') {
      fog.near = isoFraming.far * 2;
      fog.far = isoFraming.far * 4;
      return;
    }
    fog.near = extent * 1.4;
    fog.far = extent * 3.2;
  };

  /** The buttons, the fog and the free rotation, all of which follow the mode. */
  const applyMode = (): void => {
    controls.enableRotate = mode !== 'isometric';
    applyFog();
    const profile = controlProfileFor(mode, leftButtonTaken);
    controls.mouseButtons = profile.mouseButtons;
    controls.touches = profile.touches;
  };
  applyMode();
  controls.update();

  // Ambient fill keeps shaded sides readable; the sun gives every voxel face a
  // distinct brightness so silhouettes stay legible.
  const ambient = new AmbientLight(0xffffff, 1.1);
  scene.add(ambient);
  const sun = new DirectionalLight(0xffffff, 2.4);
  scene.add(sun);

  let ground = layGround(scene, framing, extent, lightVolume ?? null);

  /**
   * Stands the isometric camera on its compass point, around whatever it is
   * looking at — which is `controls.target` while it is the camera on screen,
   * and the target it was left pointed at while it is not.
   */
  const standIsoCamera = (): void => {
    const anchor = mode === 'isometric' ? controls.target : targets.isometric;
    isoCamera.position.set(
      anchor.x + (isoFraming.position.x - isoFraming.target.x),
      anchor.y + (isoFraming.position.y - isoFraming.target.y),
      anchor.z + (isoFraming.position.z - isoFraming.target.z),
    );
  };

  return {
    renderer,
    scene,
    controls,
    get camera() {
      return cameraFor(mode);
    },
    get cameraMode() {
      return mode;
    },
    get isoDirection() {
      return direction;
    },
    backend: backendOf(renderer),
    drawingBufferSize() {
      const size = renderer.getDrawingBufferSize(new Vector2());
      return { width: size.x, height: size.y };
    },
    setCameraMode(next) {
      if (next === mode) return;
      targets[mode].copy(controls.target);
      mode = next;
      controls.object = cameraFor(mode);
      controls.target.copy(targets[mode]);
      if (mode === 'isometric') standIsoCamera();
      applyMode();
      controls.update();
    },
    setIsoDirection(next) {
      if (next === direction) return;
      direction = next;
      isoFraming = isometricFramingFor(plot, direction);
      cutIsoBox();
      // Around what the camera is looking at rather than around the plot, so a
      // turn does not undo a pan.
      standIsoCamera();
      if (mode === 'isometric') controls.update();
    },
    takeLeftButton(taken) {
      leftButtonTaken = taken;
      applyMode();
    },
    reframe(nextBounds, nextFraming, nextVolume) {
      plot = nextBounds;
      extent = extentOf(plot);
      ground.dispose();
      scene.remove(ground.mesh);
      ground = layGround(scene, nextFraming, extent, nextVolume);

      perspectiveCamera.position.set(
        nextFraming.position.x,
        nextFraming.position.y,
        nextFraming.position.z,
      );
      perspectiveCamera.near = nearPlaneFor(extent);
      perspectiveCamera.far = Math.max(extent * 8, 1000);
      perspectiveCamera.updateProjectionMatrix();
      targets.perspective.set(nextFraming.target.x, nextFraming.target.y, nextFraming.target.z);

      isoFraming = isometricFramingFor(plot, direction);
      targets.isometric.set(isoFraming.target.x, isoFraming.target.y, isoFraming.target.z);
      isoCamera.zoom = 1;
      cutIsoBox();
      isoCamera.position.set(isoFraming.position.x, isoFraming.position.y, isoFraming.position.z);

      // The mode survives the new resort; only what it is pointed at changes.
      controls.target.copy(targets[mode]);
      controls.update();
      applyFog();
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
      // Written whether or not the fog is in the scene, so switching back to the
      // perspective view does not bring yesterday's sky with it.
      fog.color.setHex(state.skyColor);
    },
    resize(nextWidth, nextHeight) {
      aspect = nextWidth / nextHeight;
      perspectiveCamera.aspect = aspect;
      perspectiveCamera.updateProjectionMatrix();
      cutIsoBox();
      renderer.setSize(nextWidth, nextHeight, false);
    },
    dispose() {
      controls.dispose();
      ground.dispose();
      renderer.dispose();
    },
  };
}
