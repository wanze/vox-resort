/**
 * Wires the showcase together: catalogue -> resort plot -> DVE mesher (once per
 * model) -> instanced Three.js scene, then drives the render loop.
 *
 * All decisions live in the feature domains; this module only performs I/O.
 *
 * The pipeline meshes each *model* once rather than meshing the world: a resort
 * of a thousand objects costs the same to mesh as a showcase of thirty, and the
 * repeats become instances. See `instancedWorld.ts` for why that is safe here.
 */

import { materialKeyFor, voxelIdFor } from "../features/catalog/domain/materials";
import {
  allMaterials,
  emissiveByModelId,
  materialColorsById,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeTop,
  TILE_VOXELS,
} from "../features/catalog/domain/objectTypes";
import type { Placement, ResortLayout } from "../features/layout/domain/resortLayout";
import { layoutResort, placementCenter } from "../features/layout/domain/resortLayout";
import { rotateLights } from "../features/layout/domain/rotation";
import type { ResortPlan } from "../features/layout/domain/resortPlan";
import { HEDGE_ID, LAMP_ID, PATH_ID, RESORT_PLAN } from "../features/layout/domain/resortPlan";
import type { GeneratorType, ResortParams } from "../features/layout/domain/resortGenerator";
import {
  clampParams,
  emptyResortPlan,
  generateResort,
} from "../features/layout/domain/resortGenerator";
import { layoutItemFor } from "../features/build/domain/buildPlan";
import type { TileOccupancy } from "../features/build/domain/tileOccupancy";
import { createTileOccupancy } from "../features/build/domain/tileOccupancy";
import { createBuildPointer } from "../features/build/adapters/buildPointer";
import { createPlacementGhost } from "../features/build/adapters/placementGhost";
import type { WorldBounds } from "../features/layout/domain/worldBounds";
import { cameraFramingFor, worldBoundsFor } from "../features/layout/domain/worldBounds";
import { skyStateFor } from "../features/lighting/domain/dayNight";
import type { ModelLight } from "../../voxel-gen/voxelgen.ts";
import type { Ground } from "../features/lighting/domain/lightAnchors";
import { anchorsFor, lampReservationFor } from "../features/lighting/domain/lightAnchors";
import type { LightGridSpec } from "../features/lighting/domain/lightGrid";
import {
  bakeLightGrid,
  cellCount,
  DEFAULT_GRID_BUDGET_BYTES,
  gridByteSize,
  lightGridSpecFor,
} from "../features/lighting/domain/lightGrid";
import type { LiveLightGrid } from "../features/lighting/domain/liveLightGrid";
import { createLiveLightGrid } from "../features/lighting/domain/liveLightGrid";
import type { LiveSkyVisibility, Occluder } from "../features/lighting/domain/skyVisibility";
import { createLiveSkyVisibility } from "../features/lighting/domain/skyVisibility";
import type { BakedLightVolume } from "../features/lighting/adapters/bakedLightVolume";
import { createBakedLightVolume } from "../features/lighting/adapters/bakedLightVolume";
import type { ScratchLayout } from "../features/voxel-world/domain/modelScratch";
import { scratchLayoutFor } from "../features/voxel-world/domain/modelScratch";
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from "../features/voxel-world/adapters/dveEngine";
import { meshCatalogue } from "../features/voxel-world/adapters/meshCatalogue";
import type { InstancedWorld } from "../features/rendering/adapters/instancedWorld";
import { buildInstancedWorld } from "../features/rendering/adapters/instancedWorld";
import type { ModelGeometry } from "../features/rendering/adapters/voxelMeshBuilder";
import { buildModelGeometries } from "../features/rendering/adapters/voxelMeshBuilder";
import type { BlobShadow, ShadowCaster } from "../features/rendering/domain/blobShadows";
import { blobShadowFor, blobShadowsFor } from "../features/rendering/domain/blobShadows";
import type { BlobShadowField } from "../features/rendering/adapters/blobShadowField";
import { buildBlobShadowField } from "../features/rendering/adapters/blobShadowField";
import type { CameraFraming } from "../features/layout/domain/worldBounds";
import type { SceneHandle } from "../features/rendering/adapters/threeScene";
import { CAMERA_FOV_DEGREES, createScene } from "../features/rendering/adapters/threeScene";
import { Matrix4 } from "three/webgpu";
import { createFpsState, sampleFrame } from "../features/hud/domain/fps";
import { projectToScreen, type ScreenPosition } from "../features/hud/domain/labelProjection";
import type { FrameUpdate } from "../features/hud/adapters/hudOverlay";
import { spreadLabelAnchors } from "../features/hud/domain/labelPlacement";
import {
  benchFraming,
  parseBenchConfig,
  type BenchConfig,
} from "../features/bench/domain/benchConfig";
import { repeatPlot } from "../features/bench/domain/plotRepeat";
import { roundStats, summarizeFrames, type FrameStats } from "../features/bench/domain/frameStats";

/**
 * Voxels one instance of each type is made of.
 *
 * Read once per stats refresh, which is once per object placed — a drag places
 * one per pointer move, so this is not the place for a linear search through the
 * catalogue.
 */
const VOXELS_PER_TYPE = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.voxels.length]));

/**
 * How solidly each model fills its own bounding box, 0..1.
 *
 * The sky-visibility bake shades from boxes, and a box is a poor stand-in for a
 * street lamp: scaling its contribution by what the model actually fills is what
 * keeps a pole from shading like a pillar. Derived from the catalogue, so an
 * object added to the art needs no rule written for it here.
 */
const DENSITY_PER_TYPE = new Map(
  OBJECT_TYPES.map((type) => [
    type.id,
    type.model.voxels.length / Math.max(1, type.model.width * type.model.height * type.model.depth),
  ]),
);

/** How far above an object its label floats, in voxels. */
const LABEL_LIFT = 2;

/** Where the clock starts: late afternoon, so the scene reads in daylight. */
const INITIAL_TIME = 0.62;

/** Real seconds one full day takes when the cycle is running. */
const DAY_SECONDS = 90;

export interface LabelAnchor {
  readonly id: string;
  readonly label: string;
  readonly color: number;
  readonly world: { readonly x: number; readonly y: number; readonly z: number };
}

export interface ShowcaseStats {
  readonly backend: "webgpu" | "webgl2";
  /** Distinct object types on the plot. */
  readonly typeCount: number;
  /** Authored objects, excluding derived props and paths. */
  readonly objectCount: number;
  /** Lamps and hedges the layout scattered along the paths. */
  readonly propCount: number;
  readonly pathCount: number;
  /** Total instances drawn, objects, props and paths together. */
  readonly instanceCount: number;
  readonly drawCalls: number;
  /** Chunks of the plot, which are what the renderer culls. */
  readonly chunkCount: number;
  /**
   * Triangles uploaded once, shared by every instance of a model.
   *
   * The catalogue's own geometry. The cast shadows add one quad to that and are
   * left out, so this stays comparable with what the mesher produced.
   */
  readonly uniqueTriangleCount: number;
  /** What the mesher emitted before the greedy pass merged coplanar faces. */
  readonly unmergedTriangleCount: number;
  /** Triangles submitted per frame across all instances. */
  readonly drawnTriangleCount: number;
  /** Voxels the whole resort is made of, if it were painted out in full. */
  readonly sceneVoxelCount: number;
  /** Voxels actually meshed: one copy of each model. */
  readonly meshedVoxelCount: number;
  /** Shadows drawn on the ground, one per object tall enough to throw one. */
  readonly shadowCount: number;
  /** Objects tall enough to take sky away from what stands beside them. */
  readonly occluderCount: number;
  /** Lamps the objects on the plot declare between them. */
  readonly lightCount: number;
  /**
   * Lamps the baked volume actually holds.
   *
   * The same number, until something is built beyond the ground the grid was
   * sized to cover; a lamp out there has nowhere in the volume to burn.
   */
  readonly litLightCount: number;
  /** Cells in the baked irradiance volume, and what it costs on the GPU. */
  readonly lightGridCells: number;
  readonly lightGridBytes: number;
  /** How long the bake took, in milliseconds. */
  readonly lightBakeMs: number;
  /** How much of that was the sky-visibility pass. */
  readonly skyBakeMs: number;
  /** Milliseconds the voxel mesher spent producing per-face quads. */
  readonly dveMs: number;
  /** Milliseconds spent meshing the catalogue and merging its faces. */
  readonly meshMs: number;
  /** Milliseconds from mount to the scene being ready to draw. */
  readonly startupMs: number;
  /** Whether the catalogue was meshed off the main thread. */
  readonly meshedInWorker: boolean;
  /**
   * Frames the browser managed to paint while the catalogue was being meshed.
   * A blocked main thread paints none of them, however long the wait lasts, so
   * this — not `startupMs` — is what says whether the page stayed alive.
   */
  readonly startupFrames: number;
}

/**
 * What one `?bench=1` run measured. Also published as `window.__voxBench`, which
 * is how `scripts/bench.ts` reads it back out of the page.
 */
export interface BenchResult {
  readonly config: BenchConfig;
  readonly backend: "webgpu" | "webgl2";
  readonly pixelRatio: number;
  /** Pixels actually rasterised per frame, device ratio included. */
  readonly drawingBufferSize: { readonly width: number; readonly height: number };
  readonly activeLights: number;
  /** The scene the run measured, so a report does not have to read the HUD. */
  readonly scene: ShowcaseStats;
  /** What the renderer actually submitted on the last measured frame, after culling. */
  readonly drawn: { readonly drawCalls: number; readonly triangles: number };
  /** Wall-clock frame pacing, which the display's refresh rate puts a ceiling on. */
  readonly stats: FrameStats;
  /**
   * What the GPU spent rendering, from its own timestamp queries. This is the
   * number that keeps meaning something once a frame comes in under the refresh
   * interval and the wall clock flattens out at the display's rate.
   */
  readonly gpu: FrameStats | null;
}

export type { FrameUpdate };

export interface ShowcaseOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onFrame: (update: FrameUpdate) => void;
  /**
   * Called when something is placed or taken off the plot, with what the HUD
   * should now show. Not called per frame: `onFrame` is the hot path.
   */
  readonly onSceneChange?: (stats: ShowcaseStats) => void;
  /**
   * Called when the scene itself leaves build mode — pressing Escape — so the
   * palette can drop its highlight. Selecting from the HUD does not come back
   * through here; the HUD already knows.
   */
  readonly onBuildSelectionChange?: (typeId: string | null) => void;
  /** Called when a new resort replaces the old one, with the labels it needs. */
  readonly onAnchorsChange?: (anchors: readonly LabelAnchor[]) => void;
}

export interface Showcase {
  readonly stats: ShowcaseStats;
  readonly anchors: readonly LabelAnchor[];
  /** Populated once a `?bench=1` run has collected its frames. */
  readonly benchResult: BenchResult | null;
  /** The parameters the resort on screen was grown from. */
  readonly params: ResortParams;
  /** Grows a new resort from these parameters and puts it on screen. */
  generate(params: ResortParams): void;
  /** Clears the plot to bare ground of this size, to build on by hand. */
  clear(params: ResortParams): void;
  /** Arms the pointer to place this object type, or null to leave build mode. */
  selectBuildType(typeId: string | null): void;
  /** Jumps the clock to a moment of the day and stops the cycle. */
  setTime(time: number): void;
  /** Starts or stops the automatic day/night cycle. */
  setCycling(cycling: boolean): void;
  dispose(): void;
}

/**
 * Counts the frames the browser paints between mount and the scene being ready.
 * A main thread that is meshing paints none of them however long the wait lasts,
 * so this — not a wall-clock startup number — is what says the page stayed alive.
 */
interface StartupTracker {
  readonly frames: () => number;
  readonly stop: () => void;
}

function trackStartupFrames(): StartupTracker {
  let frames = 0;
  let counting = true;
  const tick = (): void => {
    if (!counting) return;
    frames++;
    globalThis.requestAnimationFrame(tick);
  };
  globalThis.requestAnimationFrame(tick);
  return {
    frames: () => frames,
    stop: () => {
      counting = false;
    },
  };
}

interface Plot {
  readonly layout: ResortLayout;
  /** Authored objects, the only placements that can carry a label. */
  readonly placements: Placement[];
  /** Lamps and hedges the layout scattered along the paths. */
  readonly props: Placement[];
  /** One placement per paved tile. */
  readonly paths: Placement[];
}

/** Objects, scattered props and path tiles together: everything the scene draws. */
function everythingOn(plot: Plot): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths];
}

/**
 * Lays a plan out, and tiles it when the benchmark asks for a bigger one.
 */
function layOut(plan: ResortPlan, bench: BenchConfig | null): Plot {
  const layout = layoutResort(OBJECT_TYPES.map(layoutItemFor), plan);
  const tile = <T extends { key: string; x: number; z: number }>(items: readonly T[]): T[] =>
    repeatPlot(items, bench?.repeat ?? 1, layout.tilesX * TILE_VOXELS, layout.tilesZ * TILE_VOXELS);
  // Paths and scattered props are placements too; they just never get a label.
  return {
    layout,
    placements: tile(layout.placements),
    props: tile(layout.props),
    paths: tile(layout.paths),
  };
}

/** One scratch region per model, so the mesher runs over each model exactly once. */
function scratchForCatalogue(): ScratchLayout {
  const scratch = scratchLayoutFor(
    OBJECT_TYPES.map((type) => ({
      id: type.id,
      width: type.model.width,
      voxels: type.model.voxels,
    })),
    (color) => voxelIdFor(materialKeyFor(color)),
    sectionSizeOf(DEFAULT_WORLD_SCALE),
  );
  if (scratch.extentX > DEFAULT_WORLD_SCALE.horizontalExtent) {
    throw new Error(
      `The catalogue needs ${scratch.extentX} voxels of scratch space, the world allows ${DEFAULT_WORLD_SCALE.horizontalExtent}`,
    );
  }
  return scratch;
}

interface MeshedCatalogue {
  readonly geometries: readonly ModelGeometry[];
  readonly dveMs: number;
  readonly meshMs: number;
  readonly threaded: boolean;
}

/** Meshes every model once and wraps the result in buffer geometries. */
async function meshModels(
  scratch: ScratchLayout,
  bench: BenchConfig | null,
): Promise<MeshedCatalogue> {
  const started = performance.now();
  const meshed = await meshCatalogue(
    {
      materials: allMaterials(),
      writes: scratch.writes,
      regions: scratch.regions,
      colorsByMaterialId: materialColorsById(),
      emissiveByModelId: emissiveByModelId(),
    },
    { forceMainThread: bench?.forceMainThreadMeshing ?? false },
  );
  return {
    geometries: buildModelGeometries(meshed.models),
    dveMs: meshed.dveMs,
    meshMs: Math.round(performance.now() - started),
    threaded: meshed.threaded,
  };
}

/** The catalogue as the generator needs to see it: footprints and shelves. */
const GENERATOR_TYPES: readonly GeneratorType[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  category: type.category,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
}));

/** Plot the generator starts from: the size of the resort that was authored. */
const STARTING_PARAMS: ResortParams = { tilesX: 112, tilesZ: 100, density: 0.7, seed: 1 };

/**
 * The parameters the page opens on: a fresh resort every load, unless a
 * benchmark is running.
 */
function startingParams(bench: BenchConfig | null): ResortParams {
  if (bench) return STARTING_PARAMS;
  return { ...STARTING_PARAMS, seed: Math.floor(Math.random() * 0xffffffff) };
}

/**
 * The plan the page opens on.
 *
 * A benchmark gets the hand-authored resort rather than a generated one: a run
 * is only comparable with the run before it if the scene is the same scene, and
 * `RESORT_PLAN` is the one plot that does not move between builds.
 */
function startingPlan(bench: BenchConfig | null, params: ResortParams): ResortPlan {
  return bench ? RESORT_PLAN : generateResort(GENERATOR_TYPES, params);
}

/** Every light the catalogue declares, whether or not one is standing yet. */
const CATALOGUE_LIGHTS = OBJECT_TYPES.flatMap((type) => type.model.lights);

/**
 * The lights an object carries, moved to where the way it stands puts them.
 *
 * The model's own size is what the turn is measured against, so this reads the
 * catalogue rather than the placement: a placement's extent is already turned,
 * and turning a light against it would send it out of the lantern it was
 * declared in.
 */
function lightsOf(placement: Placement): readonly ModelLight[] {
  const { model } = objectTypeById(placement.id);
  return rotateLights(model.lights, model.width, model.depth, placement.rotation);
}

/**
 * The box an object stands in, as far as the sky behind it is concerned.
 *
 * The placement's own extents, which are already turned, and the model's height.
 * A path slab comes out two voxels tall and is dropped by the bake itself; see
 * `MIN_OCCLUDER_HEIGHT`.
 */
function occluderOf(placement: Placement): Occluder {
  return {
    minX: placement.x,
    maxX: placement.x + placement.width,
    minY: 0,
    maxY: objectTypeTop(placement.id),
    minZ: placement.z,
    maxZ: placement.z + placement.depth,
    density: DENSITY_PER_TYPE.get(placement.id) ?? 1,
  };
}

/**
 * An object as its shadow sees it: where it stands, how much ground it claims
 * and how tall it is. The first three are already on the placement, turn
 * included; the height is the model's.
 */
function casterOf(placement: Placement): ShadowCaster {
  return { ...placement, height: objectTypeTop(placement.id) };
}

/** The shadow an object throws, or null if it is too flat to throw one. */
function blobOf(placement: Placement): BlobShadow | null {
  return blobShadowFor(casterOf(placement));
}

/**
 * The two halves of a finished bake: the grid holds the bytes, the volume holds
 * the textures over them. They are made and lost together, so they travel
 * together.
 */
interface BakedLighting {
  readonly live: LiveLightGrid;
  readonly sky: LiveSkyVisibility;
  readonly volume: BakedLightVolume;
}

/**
 * Lights whatever lamps an object just placed declares, re-baking only the cells
 * they reach and re-uploading only the slices those cells lie in.
 *
 * A lamp that lands outside the grid re-bakes nothing and is left out of
 * `litCount` rather than quietly counted; the HUD reads that number.
 */
function splatLights(baked: BakedLighting, placement: Placement): void {
  for (const anchor of anchorsFor(placement, lightsOf(placement))) {
    const edit = baked.live.add(anchor);
    if (edit.region) baked.volume.update(edit.region, edit.scale);
  }
}

/**
 * Shades the ground and the walls an object just placed now stands against,
 * re-baking only the cells it reaches.
 *
 * The other half of `splatLights`, and the reason it is a separate call: a lamp
 * adds light where an object takes sky away, most objects do the second without
 * doing the first, and the two write different channels of the same volume.
 */
function splatSkyVisibility(baked: BakedLighting, placement: Placement): void {
  const region = baked.sky.add(occluderOf(placement));
  if (region) baked.volume.updateSkyVisibility(region);
}

interface Lighting {
  /** Lamps the objects on the plot declare between them. */
  readonly anchorCount: number;
  /** Lamps burning in the volume, which is fewer if something was built off it. */
  readonly litCount: number;
  readonly spec: LightGridSpec | null;
  readonly volume: BakedLightVolume | null;
  readonly bakeMs: number;
  /** Milliseconds the sky-visibility pass took, of `bakeMs`. */
  readonly skyBakeMs: number;
  /** Objects tall enough to shade anything. */
  readonly occluderCount: number;
  /**
   * Lights whatever lamps an object just placed declares and shades what it now
   * stands in front of, without a re-bake of either.
   */
  add(placement: Placement): void;
}

/**
 * A plot with nowhere to bake: nothing in the catalogue casts light, so there is
 * no grid, no volume and no channel for sky visibility to ride in either.
 */
function unlitLighting(anchorCount: number): Lighting {
  return {
    anchorCount,
    litCount: 0,
    occluderCount: 0,
    spec: null,
    volume: null,
    bakeMs: 0,
    skyBakeMs: 0,
    add() {},
  };
}

/**
 * Collects every lamp the plot stands and every box that takes sky away, bakes
 * both into one volume, and keeps it current as more are built.
 *
 * The bake happens before anything is built, because the volume is what the
 * scene's materials are wired to. The grid is sized once and never resized, so
 * it is sized here to cover the whole plot rather than only the lamps standing
 * on it — see `lampReservationFor`.
 *
 * The two bakes share the volume and share nothing else: the lamps own three
 * channels of it and the sky visibility owns the fourth, and neither writes the
 * other's. That is what lets a lamp go up without re-shading the resort, and an
 * object be built without re-lighting it.
 */
function createLighting(everything: readonly Placement[], ground: Ground): Lighting {
  const anchors = everything.flatMap((placement) => anchorsFor(placement, lightsOf(placement)));
  const spec = lightGridSpecFor(
    anchors,
    DEFAULT_GRID_BUDGET_BYTES,
    lampReservationFor(ground, CATALOGUE_LIGHTS),
  );
  if (!spec) return unlitLighting(anchors.length);

  const started = performance.now();
  const grid = bakeLightGrid(anchors, spec);
  const skyStarted = performance.now();
  const sky = createLiveSkyVisibility(spec, grid.direction, everything.map(occluderOf));
  const skyBakeMs = Math.round(performance.now() - skyStarted);
  // Built last, so both bakes are in the bytes before a texture is uploaded.
  const baked: BakedLighting = {
    live: createLiveLightGrid(grid, anchors),
    sky,
    volume: createBakedLightVolume(grid),
  };
  const bakeMs = Math.round(performance.now() - started);

  let anchorCount = anchors.length;
  return {
    spec,
    bakeMs,
    skyBakeMs,
    volume: baked.volume,
    get anchorCount() {
      return anchorCount;
    },
    get litCount() {
      return baked.live.lampCount;
    },
    get occluderCount() {
      return baked.sky.occluderCount;
    },
    add(placement) {
      anchorCount += lightsOf(placement).length;
      splatLights(baked, placement);
      splatSkyVisibility(baked, placement);
    },
  };
}

/**
 * The ground a lamp could be stood on: the plan's own extent, in voxels.
 *
 * The plan rather than the objects, because a bare plot has no objects and is
 * still somewhere to build — and because the light grid is sized from this and
 * has to cover the tiles nothing stands on yet.
 */
function groundOf(plan: ResortPlan): Ground {
  return { minX: 0, maxX: plan.tilesX * TILE_VOXELS, minZ: 0, maxZ: plan.tilesZ * TILE_VOXELS };
}

/**
 * How much ground the resort covers, and how tall it stands.
 *
 * Measured from what is actually standing, so the camera frames the resort
 * rather than the empty acres around it — except on a bare plot, where there is
 * nothing to measure and the plan's own extent is the only answer.
 */
function plotBounds(plan: ResortPlan, everything: readonly Placement[]): WorldBounds {
  if (everything.length === 0) return { ...groundOf(plan), height: 0 };
  const topById = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.height]));
  return worldBoundsFor(everything, (id) => topById.get(id) ?? 0);
}

/** Frames the camera on what is actually on the plot, or on the bench's fixed view. */
function frameCamera(
  bounds: WorldBounds,
  bench: BenchConfig | null,
): { readonly framing: CameraFraming; readonly worldExtent: number } {
  return {
    framing: bench
      ? benchFraming(bench.view, bounds, CAMERA_FOV_DEGREES)
      : cameraFramingFor(bounds, CAMERA_FOV_DEGREES),
    worldExtent: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1),
  };
}

/**
 * Everything that belongs to one resort, and nothing that outlives it.
 *
 * Generating a new plot replaces all of it at once — the plot, its lamps, the
 * meshes drawn for it and the index of what stands where are answers to the same
 * question, and half a resort is not a state worth being able to represent. What
 * stays is everything above: the renderer, the camera, the meshed catalogue and
 * the HUD.
 */
interface Resort {
  readonly plot: Plot;
  readonly lighting: Lighting;
  readonly world: InstancedWorld;
  /** The shadows thrown by whatever is tall enough; see `blobShadows.ts`. */
  readonly shadows: BlobShadowField;
  readonly occupancy: TileOccupancy;
  readonly anchors: readonly LabelAnchor[];
  readonly framing: CameraFraming;
  readonly worldExtent: number;
  dispose(): void;
}

/**
 * Lays a plan out and builds everything that hangs off it.
 *
 * The bake happens before the world, because the volume is what the world's
 * materials are wired to.
 */
function buildResort(parts: {
  readonly plan: ResortPlan;
  readonly geometries: readonly ModelGeometry[];
  readonly bench: BenchConfig | null;
}): Resort {
  const plot = layOut(parts.plan, parts.bench);
  const everything = everythingOn(plot);
  const lighting = createLighting(everything, groundOf(parts.plan));
  const world = buildInstancedWorld(parts.geometries, everything, {
    lightVolume: lighting.volume,
  });
  const shadows = buildBlobShadowField(blobShadowsFor(everything.map(casterOf)));
  const camera = frameCamera(plotBounds(parts.plan, everything), parts.bench);

  return {
    plot,
    lighting,
    world,
    shadows,
    // Seeded from the resort as planned, then kept up to date one placement at a
    // time; it is what tells the pointer whether a tile is free.
    occupancy: createTileOccupancy(everything),
    anchors: labelAnchorsFor(plot.placements),
    framing: camera.framing,
    worldExtent: camera.worldExtent,
    dispose() {
      world.dispose();
      shadows.dispose();
      lighting.volume?.dispose();
    },
  };
}

/**
 * Which resort is standing, and how to put a different one there.
 *
 * Swapping one for another throws away everything below the renderer and builds
 * it again: the plot, its lamps, the meshes drawn for it and the index of what
 * stands where. That is most of a second on the largest plot the controls offer,
 * which is what a button press can spend and a frame cannot.
 */
interface ResortSlot {
  readonly current: () => Resort;
  /** Attaches the scene the resort is drawn into, once the renderer exists. */
  attach(handle: SceneHandle): void;
  /** Builds a new resort, puts it on screen, and hands it back. */
  replace(plan: ResortPlan): Resort;
}

function createResortSlot(parts: {
  readonly plan: ResortPlan;
  readonly geometries: readonly ModelGeometry[];
  readonly bench: BenchConfig | null;
}): ResortSlot {
  let resort = buildResort(parts);
  // The first resort is built before the renderer is, because the scene is
  // created around the light volume it bakes.
  let scene: SceneHandle | null = null;

  return {
    current: () => resort,
    attach(handle) {
      scene = handle;
    },
    replace(plan) {
      // The old resort is let go last, and only once nothing in the scene points
      // at it any more: the ground is bound to the light volume, so disposing
      // the volume first would leave a material holding freed textures.
      const previous = resort;
      resort = buildResort({ ...parts, plan });
      scene?.scene.remove(previous.world.group);
      scene?.scene.remove(previous.shadows.group);
      scene?.scene.add(resort.world.group);
      scene?.scene.add(resort.shadows.group);
      scene?.reframe(resort.framing, resort.worldExtent, resort.lighting.volume);
      previous.dispose();
      return resort;
    },
  };
}

/**
 * One label per object *type*, not per placement: fifteen cottages do not need
 * fifteen captions, and the HUD stays the size it was. Which cottage carries it
 * is chosen to spread the captions over the plot — see `labelPlacement.ts`.
 */
function labelAnchorsFor(placements: readonly Placement[]): LabelAnchor[] {
  return spreadLabelAnchors(placements).map((placement) => {
    const type = objectTypeById(placement.id);
    const center = placementCenter(placement);
    return {
      id: placement.id,
      label: type.label,
      color: type.color,
      world: { x: center.x, y: objectTypeTop(placement.id) + LABEL_LIFT, z: center.z },
    };
  });
}

/**
 * How many distinct types stand on the plot, and how many voxels it would be
 * made of if it were painted out in full.
 *
 * One pass over the three lists rather than a concatenated copy of them: this is
 * read again on every object placed, and a drag places one per pointer move.
 */
function plotTotals(plot: Plot): { readonly types: number; readonly voxels: number } {
  const types = new Set<string>();
  let voxels = 0;
  for (const list of [plot.placements, plot.props, plot.paths]) {
    for (const placement of list) {
      types.add(placement.id);
      voxels += VOXELS_PER_TYPE.get(placement.id) ?? 0;
    }
  }
  return { types: types.size, voxels };
}

/** What startup cost, which is a fact about the run rather than about the scene. */
interface StartupCost {
  readonly startupMs: number;
  readonly startupFrames: number;
}

/**
 * Everything the HUD and a bench report say about the scene as it stands.
 *
 * Read on demand rather than captured once, because the scene is mutable: a
 * building placed at runtime moves the instance, draw-call and triangle counts,
 * and the HUD is where that shows.
 */
function sceneStats(parts: {
  readonly handle: SceneHandle;
  readonly resort: Resort;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupCost;
}): ShowcaseStats {
  const { handle, scratch, catalogue } = parts;
  const { plot, world, shadows, lighting } = parts.resort;
  const totals = plotTotals(plot);
  return {
    backend: handle.backend,
    typeCount: totals.types,
    objectCount: plot.placements.length,
    propCount: plot.props.length,
    pathCount: plot.paths.length,
    instanceCount: world.instanceCount,
    // What the renderer is actually handed, cast shadows included: they are
    // one more draw and two more triangles per blob, and a count that hid them
    // would stop matching what a bench reads back off the renderer.
    drawCalls: world.drawCalls + shadows.drawCalls,
    chunkCount: world.chunkCount,
    uniqueTriangleCount: world.uniqueTriangleCount,
    unmergedTriangleCount: world.unmergedTriangleCount,
    drawnTriangleCount: world.drawnTriangleCount + shadows.triangleCount,
    shadowCount: shadows.count,
    occluderCount: lighting.occluderCount,
    sceneVoxelCount: totals.voxels,
    meshedVoxelCount: scratch.writes.length,
    lightCount: lighting.anchorCount,
    litLightCount: lighting.litCount,
    lightGridCells: lighting.spec ? cellCount(lighting.spec) : 0,
    lightGridBytes: lighting.spec ? gridByteSize(lighting.spec) : 0,
    lightBakeMs: lighting.bakeMs,
    skyBakeMs: lighting.skyBakeMs,
    dveMs: catalogue.dveMs,
    meshMs: catalogue.meshMs,
    meshedInWorker: catalogue.threaded,
    ...parts.startup,
  };
}

/**
 * The scene's clock: the time of day, whether it is running, and the sky and
 * lamp strength that follow from it.
 *
 * The sky is recomputed only when the clock actually moves — which is most of
 * the time it does not, since the cycle starts stopped — and that is a whole
 * scene's worth of colour and light updates nothing would have looked at.
 */
interface Clock {
  /** Normalised time of day, 0..1. */
  readonly time: number;
  /** Lamps contributing right now: the bake lights all of them, or none. */
  readonly litLamps: number;
  /** Moves the clock on by a frame's worth of seconds, if it is running. */
  advance(elapsedSeconds: number): void;
  /** Re-applies the time of day to a scene that has just been rebuilt. */
  relight(): void;
  /** Jumps to a moment of the day and stops the cycle. */
  setTime(time: number): void;
  setCycling(cycling: boolean): void;
}

function createClock(handle: SceneHandle, resort: () => Resort, startTime: number): Clock {
  let time = startTime;
  let cycling = false;
  let sky = skyStateFor(time);
  let applied: number | null = null;

  const apply = (): void => {
    if (time === applied) return;
    sky = skyStateFor(time);
    handle.applySky(sky);
    resort().lighting.volume?.setLampFactor(sky.lampFactor);
    // A quad per shadow, rewritten only when the sun has actually moved.
    resort().shadows.applySky(sky);
    applied = time;
  };
  apply();

  return {
    get time() {
      return time;
    },
    get litLamps() {
      return sky.lampFactor > 0 ? resort().lighting.litCount : 0;
    },
    relight() {
      // A new resort is a new volume and a new set of blobs, and both start at
      // zero however far through the day the clock happens to be.
      applied = null;
      apply();
    },
    advance(elapsedSeconds) {
      if (cycling) time = (time + elapsedSeconds / DAY_SECONDS) % 1;
      apply();
    },
    setTime(next) {
      cycling = false;
      time = next;
    },
    setCycling(next) {
      cycling = next;
    },
  };
}

/**
 * Freezes what startup cost and hands back a reader for everything else.
 *
 * Startup is a fact about the run, so it is measured once, here. The rest
 * describes a scene that changes under the HUD, so it is read afresh every time.
 */
function createStatsReader(parts: {
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupTracker;
  readonly mountStarted: number;
}): () => ShowcaseStats {
  // Everything is built by this point; the next thing that happens is a frame.
  const startup: StartupCost = {
    startupMs: Math.round(performance.now() - parts.mountStarted),
    startupFrames: parts.startup.frames(),
  };
  parts.startup.stop();
  return () => sceneStats({ ...parts, resort: parts.resort(), startup });
}

/**
 * Projects the label anchors to screen space, reusing its scratch matrices
 * across frames: the render loop must not hand the garbage collector work to do
 * sixty times a second.
 */
function createLabelProjector(
  handle: SceneHandle,
  canvas: HTMLCanvasElement,
  anchors: () => readonly LabelAnchor[],
): (into: Map<string, ScreenPosition>) => void {
  const viewProjection: number[] = Array.from({ length: 16 }, () => 0);
  const viewProjectionMatrix = new Matrix4();
  return (into) => {
    handle.camera.updateMatrixWorld();
    viewProjectionMatrix
      .copy(handle.camera.projectionMatrix)
      .multiply(handle.camera.matrixWorldInverse);
    for (let i = 0; i < 16; i++) viewProjection[i] = viewProjectionMatrix.elements[i]!;

    const viewport = {
      width: canvas.clientWidth || globalThis.innerWidth,
      height: canvas.clientHeight || globalThis.innerHeight,
    };
    into.clear();
    for (const anchor of anchors()) {
      const screen = projectToScreen(anchor.world, viewProjection, viewport);
      if (screen) into.set(anchor.id, screen);
    }
  };
}

interface BenchRecorder {
  /** Records one frame's wall-clock duration; a no-op once the run has finished. */
  readonly record: (frameMs: number) => void;
  /**
   * Reads back one frame's GPU duration. Resolving drains the query pool, so
   * calling this once per frame gives one reading per frame.
   */
  readonly sampleGpu: () => Promise<void>;
  /** Populated once enough frames have been measured. */
  readonly result: () => BenchResult | null;
}

/**
 * Collects the frames a `?bench=1` run measures, and publishes the summary as
 * `window.__voxBench` — which is how `scripts/bench.ts` reads it out of the page.
 */
function createBenchRecorder(parts: {
  readonly bench: BenchConfig;
  readonly handle: SceneHandle;
  readonly stats: () => ShowcaseStats;
  readonly litLamps: () => number;
}): BenchRecorder {
  const { bench, handle, stats, litLamps } = parts;
  const frames: number[] = [];
  const gpuFrames: number[] = [];
  let seen = 0;
  let result: BenchResult | null = null;

  return {
    record(frameMs) {
      if (result) return;
      seen++;
      if (seen <= bench.warmupFrames) return;
      frames.push(frameMs);
      if (frames.length < bench.measureFrames) return;
      result = {
        config: bench,
        backend: handle.backend,
        pixelRatio: handle.renderer.getPixelRatio(),
        drawingBufferSize: handle.drawingBufferSize(),
        activeLights: litLamps(),
        scene: stats(),
        drawn: {
          drawCalls: handle.renderer.info.render.drawCalls,
          triangles: handle.renderer.info.render.triangles,
        },
        stats: roundStats(summarizeFrames(frames)),
        gpu: gpuFrames.length > 0 ? roundStats(summarizeFrames(gpuFrames)) : null,
      };
      (globalThis as Record<string, unknown>).__voxBench = result;
    },
    async sampleGpu() {
      if (result) return;
      const duration = await handle.renderer.resolveTimestampsAsync();
      if (typeof duration === "number" && duration > 0) gpuFrames.push(duration);
    },
    result: () => result,
  };
}

/**
 * Where a newly placed object is counted.
 *
 * The HUD reports objects, dressing and paving separately, and an object placed
 * by hand belongs in the same column the layout would have put it in — so the
 * three ids the layout derives for itself go to their own lists and everything
 * else counts as an object.
 */
function listFor(plot: Plot, id: string): Placement[] {
  if (id === PATH_ID) return plot.paths;
  if (id === LAMP_ID || id === HEDGE_ID) return plot.props;
  return plot.placements;
}

/**
 * Holds the camera still for a benchmark run. Damping would otherwise keep
 * nudging it for the first second, and two builds would not be compared on the
 * same pixels.
 */
function pinCamera(handle: SceneHandle): void {
  handle.controls.enabled = false;
  handle.controls.enableDamping = false;
}

/** Build mode: what the pointer is placing, and how it reaches the scene. */
interface BuildMode {
  /** Picks the type to place, or null to leave build mode. */
  select(typeId: string | null): void;
  dispose(): void;
}

/**
 * Wires the pointer to the mutable scene.
 *
 * The occupancy index is the piece worth naming: the layout checks its own plan
 * for overlaps once, up front, and throws when it finds one, which is right for
 * a plan and useless for a pointer that spends most of its time over an occupied
 * tile. This keeps the same answer live, one placement at a time, so a hover
 * costs a map lookup per tile of the footprint.
 */
function createBuildMode(parts: {
  readonly canvas: HTMLCanvasElement;
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly geometries: readonly ModelGeometry[];
  readonly onChange: () => void;
  readonly onCancel: () => void;
}): BuildMode {
  const { canvas, handle, resort, onChange, onCancel } = parts;
  const ghost = createPlacementGhost(parts.geometries);
  handle.scene.add(ghost.group);

  // The pointer is built once and outlives every resort under it, so it is given
  // an index that forwards to whichever one is standing rather than one it would
  // still be holding after the plot was replaced.
  const occupancy: TileOccupancy = {
    isFree: (footprint) => resort().occupancy.isFree(footprint),
    keyAt: (tile) => resort().occupancy.keyAt(tile),
    claim: (footprint, key) => resort().occupancy.claim(footprint, key),
    release: (footprint, key) => resort().occupancy.release(footprint, key),
    get size() {
      return resort().occupancy.size;
    },
  };

  const pointer = createBuildPointer({
    canvas,
    camera: handle.camera,
    controls: handle.controls,
    ghost,
    occupancy,
    onPlace(placement) {
      const { plot, world, lighting, shadows } = resort();
      // Claimed first: if the tiles are gone the scene must not gain an object
      // the index does not know about.
      occupancy.claim(placement, placement.key);
      world.add(placement);
      // Anything but a paving slab throws one; the model's height says which.
      const blob = blobOf(placement);
      if (blob) shadows.add(blob);
      // Any model may declare lights — a tiki torch and a swimming pool both do
      // — so this is not a check for one object type but a splat of whatever
      // the model brought with it.
      lighting.add(placement);
      listFor(plot, placement.id).push(placement);
      onChange();
    },
    onCancel,
  });

  return {
    select(typeId) {
      pointer.select(typeId === null ? null : layoutItemFor(objectTypeById(typeId)));
    },
    dispose() {
      pointer.dispose();
      handle.scene.remove(ghost.group);
      ghost.dispose();
    },
  };
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame, onSceneChange } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  // `?bench=1` pins the camera and the clock so two builds are compared on the
  // same pixels. Absent the flag this is null and nothing that reads it runs.
  const bench = parseBenchConfig(globalThis.location?.search ?? "");

  const scratch = scratchForCatalogue();
  const catalogue = await meshModels(scratch, bench);

  let params = startingParams(bench);
  const slot = createResortSlot({
    plan: startingPlan(bench, params),
    geometries: catalogue.geometries,
    bench,
  });
  const current = slot.current;

  const handle = await createScene({
    canvas,
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
    framing: current().framing,
    worldExtent: current().worldExtent,
    lightVolume: current().lighting.volume,
    // Wall-clock frame times stop discriminating as soon as a frame fits inside
    // the refresh interval: everything faster reads as exactly 120 fps. The
    // GPU's own timers keep measuring past that point.
    trackTimestamp: bench !== null,
    forceWebGL: bench?.forceWebGL ?? false,
  });
  handle.scene.add(current().world.group);
  handle.scene.add(current().shadows.group);
  slot.attach(handle);

  let fpsState = createFpsState();
  let running = true;
  let lastTimeMs: number | null = null;
  const clock = createClock(handle, current, bench ? bench.time : INITIAL_TIME);

  if (bench) pinCamera(handle);

  const resize = (): void => {
    handle.resize(
      canvas.clientWidth || globalThis.innerWidth,
      canvas.clientHeight || globalThis.innerHeight,
    );
  };
  globalThis.addEventListener("resize", resize);

  const statsNow = createStatsReader({
    handle,
    resort: current,
    scratch,
    catalogue,
    startup,
    mountStarted,
  });

  const build = createBuildMode({
    canvas,
    handle,
    resort: current,
    geometries: catalogue.geometries,
    onChange: () => onSceneChange?.(statsNow()),
    onCancel: () => {
      build.select(null);
      options.onBuildSelectionChange?.(null);
    },
  });

  /** Tells everything above the renderer that the resort underneath it changed. */
  const rebuilt = (resort: Resort): void => {
    clock.relight();
    options.onAnchorsChange?.(resort.anchors);
    onSceneChange?.(statsNow());
  };

  const recorder = bench
    ? createBenchRecorder({ bench, handle, stats: statsNow, litLamps: () => clock.litLamps })
    : null;
  const projectLabels = createLabelProjector(handle, canvas, () => current().anchors);
  const labels = new Map<string, ScreenPosition>();

  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    clock.advance(elapsed);
    if (!bench) handle.controls.update();
    handle.renderer.render(handle.scene, handle.camera);

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    projectLabels(labels);
    onFrame({ fps: fpsState.fps, time: clock.time, activeLights: clock.litLamps, labels });

    if (recorder) {
      recorder.record(elapsed * 1000);
      void recorder.sampleGpu();
    }
  });

  return {
    get benchResult() {
      return recorder?.result() ?? null;
    },
    get stats() {
      return statsNow();
    },
    get anchors() {
      return current().anchors;
    },
    get params() {
      return params;
    },
    generate(next) {
      params = clampParams(next);
      rebuilt(slot.replace(generateResort(GENERATOR_TYPES, params)));
    },
    clear(next) {
      params = clampParams(next);
      rebuilt(slot.replace(emptyResortPlan(params.tilesX, params.tilesZ)));
    },
    selectBuildType: (typeId) => build.select(typeId),
    setTime: clock.setTime,
    setCycling: clock.setCycling,
    dispose() {
      running = false;
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener("resize", resize);
      build.dispose();
      current().dispose();
      handle.dispose();
    },
  };
}
