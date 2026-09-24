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
import {
  CAMERA_FOV_DEGREES,
  isometricFramingFor,
  worldExtentOf,
} from '../../layout/domain/worldBounds';
import type { Shore } from '../../layout/domain/shoreline';
import type { Terrain } from '../../layout/domain/terrain';
import { orthographicLens, perspectiveLens, type DetailView } from '../domain/levelOfDetail';
import type { SurfaceGeometry, TerrainSurfaces } from '../domain/terrainSurface';
import { TERRAIN_SPREAD, terrainSurfacesFor } from '../domain/terrainSurface';
import { createSeaMaterial } from './seaMaterial';
import { createRiverMaterial } from './riverMaterial';
import type { WaterMaterial } from './waterSurface';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';

const GROUND_COLOR = 0x5d7a45;

const SAND_COLOR = 0xd8c69c;

// Grass risers are bare earth so the step reads even in full sun; sand risers
// stay sand, a shade down, because earth turned the dune into a quarry.
const RISER_COLOR = 0x6b5a3e;
const SAND_RISER_COLOR = 0xc0ab7f;

// A path slab stands two voxels above the ground: the tightest depth gap in the scene.
const DEPTH_STEPS = 2 ** 24;
const RESOLVED_VOXELS = 0.5;

const FRAMED_REACH = 1.6;

const MAX_NEAR = 4;

const ISO_MIN_ZOOM = 0.2;
const ISO_MAX_ZOOM = 60;

// Grows with the plot: at near 0.1 an integer depth buffer let the ground win over
// the paving at the far side. Still needed with reversedDepthBuffer, because WebGL2
// without EXT_clip_control quietly falls back to an integer buffer.
function nearPlaneFor(extent: number): number {
  const reach = extent * FRAMED_REACH;
  return Math.min(MAX_NEAR, Math.max(0.1, (reach * reach) / (RESOLVED_VOXELS * DEPTH_STEPS)));
}

function backendOf(renderer: WebGPURenderer): 'webgpu' | 'webgl2' {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
    ? 'webgpu'
    : 'webgl2';
}

interface ControlProfile {
  readonly mouseButtons: OrbitControls['mouseButtons'];
  readonly touches: OrbitControls['touches'];
}

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
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly controls: OrbitControls<PerspectiveCamera | OrthographicCamera>;
  readonly backend: 'webgpu' | 'webgl2';
  readonly cameraMode: CameraMode;
  readonly isoDirection: CompassDirection;
  setCameraMode(mode: CameraMode): void;
  setIsoDirection(direction: CompassDirection): void;
  lookAt(spot: { readonly x: number; readonly y: number; readonly z: number }): void;
  takeLeftButton(taken: boolean): void;
  applySky(state: SkyState): void;
  reframe(
    bounds: WorldBounds,
    framing: CameraFraming,
    lightVolume: BakedLightVolume | null,
    shore: Shore | null,
    terrain: Terrain,
    surfaces?: TerrainSurfaces | null,
  ): void;
  retile(): void;
  drawingBufferSize(): { width: number; height: number };
  detailView(): DetailView;
  shaderBuilds(): number;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface SceneOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly bounds: WorldBounds;
  // Passed in rather than derived because the benchmark harness overrides it.
  readonly framing: CameraFraming;
  readonly lightVolume?: BakedLightVolume | null;
  readonly shore: Shore | null;
  readonly terrain: Terrain;
  readonly isClear?: (tileX: number, tileZ: number) => boolean;
  readonly surfaces?: TerrainSurfaces | null;
  // Has to be requested when the renderer is built, not later.
  readonly trackTimestamp?: boolean;
  readonly forceWebGL?: boolean;
}

interface Ground {
  readonly mesh: Mesh;
  dispose(): void;
}

// Without the lamp emissive term the ground under a street lamp would stay black.
function layGround(
  scene: Scene,
  framing: CameraFraming,
  worldExtent: number,
  lightVolume: BakedLightVolume | null,
): Ground {
  const geometry = new PlaneGeometry(
    worldExtent * TERRAIN_SPREAD * 2,
    worldExtent * TERRAIN_SPREAD * 2,
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

// Sand is one flat tone on purpose: wet bands and per-column wobble read as dirt
// from the distance the resort is seen at.
interface TerrainMeshes {
  readonly group: Group;
  dispose(): void;
}

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

type Disposable = { dispose(): void };

// Kept across rebuilds: a new material is a shader compile, which stalled every
// terrain drag. Bound to the light volume, so only a new resort makes new ones.
interface TerrainPalette {
  readonly sea: WaterMaterial;
  readonly river: WaterMaterial;
  readonly flat: ReadonlyMap<number, MeshStandardNodeMaterial>;
  setSky(color: number): void;
  dispose(): void;
}

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

function layTerrain(
  scene: Scene,
  shore: Shore | null,
  terrain: Terrain,
  framing: CameraFraming,
  worldExtent: number,
  palette: TerrainPalette,
  isClear: (tileX: number, tileZ: number) => boolean,
  precomputed: TerrainSurfaces | null = null,
): TerrainMeshes {
  const group = new Group();
  scene.add(group);
  const disposables: Disposable[] = [];

  const surfaces =
    precomputed ??
    terrainSurfacesFor({
      terrain,
      isClear,
      shore,
      center: { x: framing.target.x, z: framing.target.z },
      reach: worldExtent * TERRAIN_SPREAD,
      tileVoxels: TILE_VOXELS,
    });

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
    // Reversed float depth spreads precision over the whole range; see nearPlaneFor.
    reversedDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  renderer.setSize(width, height, false);
  await renderer.init();

  const scene = new Scene();
  const bufferSize = new Vector2();
  const sky = new Color(0x11161d);
  scene.background = sky;

  let plot = bounds;
  let extent = worldExtentOf(plot);
  let aspect = width / height;
  let mode: CameraMode = 'perspective';
  // The perspective camera starts over the south-east corner, so iso opens there too.
  let direction: CompassDirection = 'southeast';
  let isoFraming: OrthographicFraming = isometricFramingFor(plot, direction);
  let leftButtonTaken = false;

  // Orthographic fog distance is arbitrary, so the isometric view pushes the fog past
  // the far plane; removing scene.fog instead would recompile every material.
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

  // camera.zoom scales this box rather than replacing it, so a resize keeps the zoom.
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

  const targets: Record<CameraMode, Vector3> = {
    perspective: new Vector3(framing.target.x, framing.target.y, framing.target.z),
    isometric: new Vector3(isoFraming.target.x, isoFraming.target.y, isoFraming.target.z),
  };
  controls.target.copy(targets.perspective);

  const cameraFor = (of: CameraMode): PerspectiveCamera | OrthographicCamera =>
    of === 'perspective' ? perspectiveCamera : isoCamera;

  const applyFog = (): void => {
    if (mode === 'isometric') {
      fog.near = isoFraming.far * 2;
      fog.far = isoFraming.far * 4;
      return;
    }
    fog.near = extent * 1.4;
    fog.far = extent * 3.2;
  };

  const applyMode = (): void => {
    controls.enableRotate = mode !== 'isometric';
    applyFog();
    const profile = controlProfileFor(mode, leftButtonTaken);
    controls.mouseButtons = profile.mouseButtons;
    controls.touches = profile.touches;
  };
  applyMode();
  controls.update();

  const ambient = new AmbientLight(0xffffff, 1.1);
  scene.add(ambient);
  const sun = new DirectionalLight(0xffffff, 2.4);
  scene.add(sun);

  let ground = layGround(scene, framing, extent, lightVolume);
  let terrain = options.terrain;
  let terrainFraming = framing;
  let terrainVolume = lightVolume;
  let palette = createTerrainPalette(lightVolume);
  let surfaces = layTerrain(
    scene,
    shore,
    terrain,
    framing,
    extent,
    palette,
    isClear,
    options.surfaces ?? null,
  );
  let coast = shore;

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
    shaderBuilds() {
      // Internal to Three.js, and read only for the HUD: a renderer without it
      // reports nought rather than breaking the frame.
      const nodes = Reflect.get(renderer, '_nodes') as
        | { nodeBuilderCache?: Map<unknown, unknown> }
        | undefined;
      return nodes?.nodeBuilderCache?.size ?? 0;
    },
    detailView() {
      const bufferHeight = renderer.getDrawingBufferSize(bufferSize).y;
      const camera = cameraFor(mode);
      const lens =
        mode === 'perspective'
          ? perspectiveLens(bufferHeight, perspectiveCamera.fov)
          : orthographicLens(bufferHeight, (isoCamera.top - isoCamera.bottom) / isoCamera.zoom);
      return { x: camera.position.x, y: camera.position.y, z: camera.position.z, lens };
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
    lookAt(spot) {
      const camera = cameraFor(mode);
      const offset = new Vector3().subVectors(camera.position, controls.target);
      controls.target.set(spot.x, spot.y, spot.z);
      targets.perspective.copy(controls.target);
      targets.isometric.copy(controls.target);
      if (mode === 'isometric') standIsoCamera();
      else camera.position.copy(controls.target).add(offset);
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
      surfaces = layTerrain(scene, coast, terrain, terrainFraming, extent, palette, isClear);
    },
    reframe(nextBounds, nextFraming, nextVolume, nextShore, nextTerrain, nextSurfaces) {
      plot = nextBounds;
      extent = worldExtentOf(plot);
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
      surfaces = layTerrain(
        scene,
        coast,
        terrain,
        terrainFraming,
        extent,
        palette,
        isClear,
        nextSurfaces ?? null,
      );

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
