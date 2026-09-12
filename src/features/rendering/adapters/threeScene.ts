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
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
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
import type { Shore } from '../../layout/domain/shoreline';
import type { Terrain } from '../../layout/domain/terrain';
import type { SurfaceGeometry } from '../domain/terrainSurface';
import { terrainSurfacesFor } from '../domain/terrainSurface';
import { createSeaMaterial } from './seaMaterial';
import { createRiverMaterial } from './riverMaterial';
import type { WaterMaterial } from './waterSurface';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';

export const CAMERA_FOV_DEGREES = 55;

/** Ground colour under and around the resort. */
const GROUND_COLOR = 0x5d7a45;

/** Beach colour. One flat tone, exactly as the grass is. */
const SAND_COLOR = 0xd8c69c;

/**
 * The terraces, and the cut faces between them.
 *
 * A bench is the same ground the plot is, because it *is* the plot — a grass
 * terrace is lawn that happens to be two metres up, and a sand one is the beach
 * carrying on up the dune behind it. Giving either a tone of its own would read
 * as a different material rather than as higher ground.
 *
 * The risers are what carry the step, and they are the one place the two part
 * company. A cut through turf is bare earth, darker than the grass above and
 * below it, so the edge reads even where the sun is square on it. A cut through
 * a dune is sand, and shading it earth turned the beach into a quarry — so it
 * takes the sand's own tone, a shade down so the step is still a step.
 */
const RISER_COLOR = 0x6b5a3e;
const SAND_RISER_COLOR = 0xc0ab7f;

/** How far past the framed plot the ground, the sea and the beach run. */
const GROUND_SPREAD = 3;

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
  reframe(
    bounds: WorldBounds,
    framing: CameraFraming,
    lightVolume: BakedLightVolume | null,
    shore: Shore | null,
    terrain: Terrain,
  ): void;
  /**
   * Rebuilds the terrain meshes from the ground as it now is.
   *
   * The one thing in the scene that is rebuilt without a new resort under it:
   * moving a tile of ground changes the shape of the sand, the benches, the
   * risers and the rivers, and none of that is instanced geometry a placement
   * could be added to. It is a few hundred quads and no material to compile — the
   * meshes are swapped and the materials are not — which is what a frame can
   * afford, and why the caller may leave this until the frame it is drawing
   * rather than calling it once per spadeful of a drag.
   */
  retile(): void;
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
   * Where the plot meets the sea. Null lays plain grass to the horizon, and is
   * required rather than defaulted: a scene with no coast is a decision the
   * caller makes, not one this falls back on.
   */
  readonly shore: Shore | null;
  /**
   * What every tile of the plot is made of and how high it stands: the coast and
   * the terraces resolved together, with any ground that has been dug or piled
   * since. Everything but the sea is drawn from it. See `terrain.ts`.
   */
  readonly terrain: Terrain;
  /**
   * Whether nothing at all stands on a tile, which decides whether its ground is
   * drawn as a slope or left square. Read afresh on every rebuild rather than
   * captured, so it follows whichever resort is standing exactly as the terrain
   * does. See `terrainSurface.ts`.
   */
  readonly isClear?: (tileX: number, tileZ: number) => boolean;
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
  const geometry = new PlaneGeometry(
    worldExtent * GROUND_SPREAD * 2,
    worldExtent * GROUND_SPREAD * 2,
  );
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

/**
 * The sea, the sand, the benches, their cut faces and the water inland: every
 * surface the flat ground plane cannot draw.
 *
 * Static meshes over that plane, sharing its lighting so the shore shades and
 * catches the lamps like everything else. `domain/terrainSurface.ts` decides
 * what shape they are; this only uploads them and picks their materials.
 *
 * The materials could hardly be less alike. The ground is the same flat lit
 * colour the grass is, because sand seen from the resort's distance *is* flat —
 * every earlier attempt to give it wet bands and a per-column wobble read as
 * dirt rather than as a beach. The two bodies of water are the opposite: flat
 * geometry doing everything in the shader, in `seaMaterial.ts` and
 * `riverMaterial.ts`.
 */
interface TerrainMeshes {
  readonly group: Group;
  /** Gives back the geometry alone; the materials outlive it. See {@link TerrainPalette}. */
  dispose(): void;
}

/**
 * Wraps one surface's buffers in a geometry.
 *
 * Normals are all straight up unless the surface brought its own: the sea bends
 * its own in the fragment shader, the sand and the terrace tops have nothing to
 * bend, and the risers are the one upright face in the terrain and say so.
 */
function normalsFor(surface: SurfaceGeometry): Float32Array {
  if (surface.normals) return surface.normals;
  const up = new Float32Array(surface.positions.length);
  for (let index = 1; index < up.length; index += 3) up[index] = 1;
  return up;
}

function toSurfaceGeometry(surface: SurfaceGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(surface.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normalsFor(surface), 3));
  if (surface.shoreDistances) {
    const { edge, coast } = surface.shoreDistances;
    geometry.setAttribute('shoreEdgeDistance', new BufferAttribute(edge, 1));
    geometry.setAttribute('shoreCoastDistance', new BufferAttribute(coast, 1));
  }
  geometry.setIndex(new BufferAttribute(surface.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A flat-coloured lit surface, lamps and sky shading included.
 *
 * The sand, the benches and the risers all want exactly this and differ only in
 * colour, so they share the recipe rather than four copies of it. The two bodies
 * of water do not: both are shaded end to end in a material of their own.
 */
function surfaceMaterial(
  color: number,
  lightVolume: BakedLightVolume | null,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color, roughness: 1, metalness: 0 });
  if (lightVolume) {
    material.emissiveNode = lightVolume.lampLight(vec3(...linearRgbOf(color)));
    material.aoNode = lightVolume.skyVisibility();
  }
  return material;
}

/** Anything the terrain group has to give back when it is replaced. */
type Disposable = { dispose(): void };

/**
 * The materials the terrain is drawn with, which outlive the meshes.
 *
 * Six flat tones and two bodies of water, made once and kept. That is the whole
 * point of them being here rather than inside the rebuild: a material is a
 * shader, and a shader the backend has not seen before is a pipeline to compile
 * — so making them afresh on every spadeful put a compile in the middle of every
 * drag. Only the geometry actually changes when the ground moves.
 *
 * They are bound to the light volume, so a *new resort* does need new ones; see
 * `reframe`.
 */
interface TerrainPalette {
  readonly sea: WaterMaterial;
  readonly river: WaterMaterial;
  readonly flat: ReadonlyMap<number, MeshStandardNodeMaterial>;
  /** Repaints the sky both bodies of water reflect, in packed sRGB. */
  setSky(color: number): void;
  dispose(): void;
}

/** The flat tones the terrain is drawn in; see the colour constants above. */
const FLAT_TONES = [GROUND_COLOR, SAND_COLOR, RISER_COLOR, SAND_RISER_COLOR] as const;

function createTerrainPalette(lightVolume: BakedLightVolume | null): TerrainPalette {
  const sea = createSeaMaterial(lightVolume);
  const river = createRiverMaterial(lightVolume);
  const flat = new Map(FLAT_TONES.map((tone) => [tone, surfaceMaterial(tone, lightVolume)]));
  return {
    sea,
    river,
    flat,
    setSky(color) {
      sea.setSky(color);
      river.setSky(color);
    },
    dispose() {
      sea.dispose();
      river.dispose();
      for (const material of flat.values()) material.dispose();
    },
  };
}

/** Uploads the bodies of water that have any geometry, on the materials they keep. */
function layWater(
  group: Group,
  disposables: Disposable[],
  bodies: readonly (readonly [SurfaceGeometry | null, WaterMaterial])[],
): void {
  for (const [surface, water] of bodies) {
    if (!surface) continue;
    const geometry = toSurfaceGeometry(surface);
    group.add(new Mesh(geometry, water.material));
    disposables.push(geometry);
  }
}

/** Uploads the flat-coloured surfaces that have any geometry, one mesh per tone. */
function layFlat(
  group: Group,
  disposables: Disposable[],
  palette: TerrainPalette,
  surfaces: readonly (readonly [SurfaceGeometry | null, number])[],
): void {
  for (const [surface, color] of surfaces) {
    if (!surface) continue;
    const geometry = toSurfaceGeometry(surface);
    group.add(new Mesh(geometry, palette.flat.get(color)!));
    disposables.push(geometry);
  }
}

/**
 * Builds every terrain mesh for the ground as it now stands.
 *
 * Called once per resort and again on every rebuild the terrain tool asks for,
 * which is what makes the list of disposables worth keeping: the group is thrown
 * away whole and replaced, so nothing here has to work out which of five meshes
 * a spadeful of ground changed.
 */
function layTerrain(
  scene: Scene,
  shore: Shore | null,
  terrain: Terrain,
  framing: CameraFraming,
  worldExtent: number,
  palette: TerrainPalette,
  isClear: (tileX: number, tileZ: number) => boolean,
): TerrainMeshes {
  const group = new Group();
  scene.add(group);
  const disposables: Disposable[] = [];

  const surfaces = terrainSurfacesFor({
    terrain,
    isClear,
    shore,
    center: { x: framing.target.x, z: framing.target.z },
    reach: worldExtent * GROUND_SPREAD,
    tileVoxels: TILE_VOXELS,
  });

  // The two bodies of water, each with its own shader: see `seaMaterial.ts` for
  // the bay's depth gradient and foam, and `riverMaterial.ts` for why a channel
  // wants neither.
  layWater(group, disposables, [
    [surfaces.sea, palette.sea],
    [surfaces.water, palette.river],
  ]);

  layFlat(group, disposables, palette, [
    [surfaces.ground.grass, GROUND_COLOR],
    [surfaces.ground.sand, SAND_COLOR],
    [surfaces.risers.grass, RISER_COLOR],
    [surfaces.risers.sand, SAND_RISER_COLOR],
  ]);

  return {
    group,
    dispose() {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}

export async function createScene(options: SceneOptions): Promise<SceneHandle> {
  const { canvas, width, height, framing, bounds, shore } = options;
  const lightVolume = options.lightVolume ?? null;
  const trackTimestamp = options.trackTimestamp ?? false;
  const isClear = options.isClear ?? ((): boolean => true);

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

  let ground = layGround(scene, framing, extent, lightVolume);
  // Kept, because `retile` rebuilds the surfaces from whatever the ground has
  // become since: the terrain object is the live one, and the framing and the
  // volume are what the meshes were last built against.
  let terrain = options.terrain;
  let terrainFraming = framing;
  let terrainVolume = lightVolume;
  // Made once and kept across every rebuild: a material is a shader, and the
  // ground moving is not a reason to compile one. See `TerrainPalette`.
  let palette = createTerrainPalette(lightVolume);
  let surfaces = layTerrain(scene, shore, terrain, framing, extent, palette, isClear);
  let coast = shore;

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
    retile() {
      surfaces.dispose();
      scene.remove(surfaces.group);
      // Geometry alone: the materials are the ones the meshes were already
      // drawn with, so the sea keeps the sky it was last painted and there is
      // nothing for the backend to compile.
      surfaces = layTerrain(scene, coast, terrain, terrainFraming, extent, palette, isClear);
    },
    reframe(nextBounds, nextFraming, nextVolume, nextShore, nextTerrain) {
      plot = nextBounds;
      extent = extentOf(plot);
      ground.dispose();
      scene.remove(ground.mesh);
      ground = layGround(scene, nextFraming, extent, nextVolume);
      // The coast is rebuilt for the same reason the ground is: both are bound
      // to the light volume, and a new resort is a new bake in new textures.
      surfaces.dispose();
      scene.remove(surfaces.group);
      palette.dispose();
      terrain = nextTerrain;
      terrainFraming = nextFraming;
      terrainVolume = nextVolume;
      coast = nextShore;
      palette = createTerrainPalette(terrainVolume);
      palette.setSky(sky.getHex());
      surfaces = layTerrain(scene, coast, terrain, terrainFraming, extent, palette, isClear);

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
      // The sea reflects the sky, so a sunset has to reach the water too.
      palette.setSky(state.skyColor);
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
      surfaces.dispose();
      palette.dispose();
      renderer.dispose();
    },
  };
}
