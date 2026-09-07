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
import { layoutResort, place, placementCenter } from "../features/layout/domain/resortLayout";
import { RESORT_PLAN } from "../features/layout/domain/resortPlan";
import { cameraFramingFor, worldBoundsFor } from "../features/layout/domain/worldBounds";
import { skyStateFor } from "../features/lighting/domain/dayNight";
import type { LightAnchor } from "../features/lighting/domain/lightAnchors";
import type { LightGridSpec } from "../features/lighting/domain/lightGrid";
import {
  bakeLightGrid,
  cellCount,
  gridByteSize,
  lightGridSpecFor,
} from "../features/lighting/domain/lightGrid";
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
import type { CameraFraming } from "../features/layout/domain/worldBounds";
import type { SceneHandle } from "../features/rendering/adapters/threeScene";
import { CAMERA_FOV_DEGREES, createScene } from "../features/rendering/adapters/threeScene";
import { Matrix4 } from "three/webgpu";
import { createFpsState, sampleFrame } from "../features/hud/domain/fps";
import { projectToScreen, type ScreenPosition } from "../features/hud/domain/labelProjection";
import { spreadLabelAnchors } from "../features/hud/domain/labelPlacement";
import {
  benchFraming,
  parseBenchConfig,
  type BenchConfig,
} from "../features/bench/domain/benchConfig";
import { repeatPlot } from "../features/bench/domain/plotRepeat";
import { roundStats, summarizeFrames, type FrameStats } from "../features/bench/domain/frameStats";

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
  /** Triangles uploaded once, shared by every instance of a model. */
  readonly uniqueTriangleCount: number;
  /** What the mesher emitted before the greedy pass merged coplanar faces. */
  readonly unmergedTriangleCount: number;
  /** Triangles submitted per frame across all instances. */
  readonly drawnTriangleCount: number;
  /** Voxels the whole resort is made of, if it were painted out in full. */
  readonly sceneVoxelCount: number;
  /** Voxels actually meshed: one copy of each model. */
  readonly meshedVoxelCount: number;
  /** Lamps on the plot. Every one of them is baked, so every one of them burns. */
  readonly lightCount: number;
  /** Cells in the baked irradiance volume, and what it costs on the GPU. */
  readonly lightGridCells: number;
  readonly lightGridBytes: number;
  /** How long the bake took, in milliseconds. */
  readonly lightBakeMs: number;
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

export interface FrameUpdate {
  readonly fps: number;
  /** Normalised time of day, 0..1. */
  readonly time: number;
  /** Lamps contributing to this frame; all of them after dark, none by day. */
  readonly activeLights: number;
  /** Screen position per anchor id; missing ids are off-screen this frame. */
  readonly labels: ReadonlyMap<string, ScreenPosition>;
}

export interface ShowcaseOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onFrame: (update: FrameUpdate) => void;
  /**
   * Called when something is placed or taken off the plot, with what the HUD
   * should now show. Not called per frame: `onFrame` is the hot path.
   */
  readonly onSceneChange?: (stats: ShowcaseStats) => void;
}

export interface Showcase {
  readonly stats: ShowcaseStats;
  readonly anchors: readonly LabelAnchor[];
  /** Populated once a `?bench=1` run has collected its frames. */
  readonly benchResult: BenchResult | null;
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
 * Lays the resort out, and tiles it when the benchmark asks for a bigger one.
 */
function planResort(bench: BenchConfig | null): Plot {
  const layout = layoutResort(
    OBJECT_TYPES.map((type) => ({
      id: type.id,
      tilesX: type.model.tiles.x,
      tilesZ: type.model.tiles.z,
      width: type.model.width,
      depth: type.model.depth,
    })),
    RESORT_PLAN,
  );
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

interface Lighting {
  readonly anchors: readonly LightAnchor[];
  readonly spec: LightGridSpec | null;
  readonly volume: BakedLightVolume | null;
  readonly bakeMs: number;
}

/**
 * Collects every lamp the plot stands and bakes them into one irradiance volume.
 *
 * This happens before anything is built, because the volume is what the scene's
 * materials are wired to.
 */
function bakeLighting(everything: readonly Placement[]): Lighting {
  const anchors: LightAnchor[] = [];
  for (const placement of everything) {
    // Numbered within the placement that owns them, not across the whole plot:
    // a running count would rename every lamp behind the one that was added.
    objectTypeById(placement.id).model.lights.forEach((light, index) => {
      anchors.push({
        key: `${placement.key}:${index}`,
        x: placement.x + light.x,
        y: light.y,
        z: placement.z + light.z,
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
      });
    });
  }

  const spec = lightGridSpecFor(anchors);
  const started = performance.now();
  const grid = spec ? bakeLightGrid(anchors, spec) : null;
  return {
    anchors,
    spec,
    bakeMs: Math.round(performance.now() - started),
    volume: grid ? createBakedLightVolume(grid) : null,
  };
}

/** Frames the camera on what is actually on the plot, or on the bench's fixed view. */
function frameCamera(
  everything: readonly Placement[],
  bench: BenchConfig | null,
): { readonly framing: CameraFraming; readonly worldExtent: number } {
  const topById = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.height]));
  const bounds = worldBoundsFor(everything, (id) => topById.get(id) ?? 0);
  return {
    framing: bench
      ? benchFraming(bench.view, bounds, CAMERA_FOV_DEGREES)
      : cameraFramingFor(bounds, CAMERA_FOV_DEGREES),
    worldExtent: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1),
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
  readonly plot: Plot;
  readonly world: InstancedWorld;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly lighting: Lighting;
  readonly startup: StartupCost;
}): ShowcaseStats {
  const { handle, plot, world, scratch, catalogue, lighting } = parts;
  const everything = everythingOn(plot);
  return {
    backend: handle.backend,
    typeCount: new Set(everything.map((placement) => placement.id)).size,
    objectCount: plot.placements.length,
    propCount: plot.props.length,
    pathCount: plot.paths.length,
    instanceCount: world.instanceCount,
    drawCalls: world.drawCalls,
    chunkCount: world.chunkCount,
    uniqueTriangleCount: world.uniqueTriangleCount,
    unmergedTriangleCount: world.unmergedTriangleCount,
    drawnTriangleCount: world.drawnTriangleCount,
    sceneVoxelCount: everything.reduce(
      (total, placement) => total + objectTypeById(placement.id).model.voxels.length,
      0,
    ),
    meshedVoxelCount: scratch.writes.length,
    lightCount: lighting.anchors.length,
    lightGridCells: lighting.spec ? cellCount(lighting.spec) : 0,
    lightGridBytes: lighting.spec ? gridByteSize(lighting.spec) : 0,
    lightBakeMs: lighting.bakeMs,
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
  /** Jumps to a moment of the day and stops the cycle. */
  setTime(time: number): void;
  setCycling(cycling: boolean): void;
}

function createClock(handle: SceneHandle, lighting: Lighting, startTime: number): Clock {
  let time = startTime;
  let cycling = false;
  let sky = skyStateFor(time);
  let applied: number | null = null;

  const apply = (): void => {
    if (time === applied) return;
    sky = skyStateFor(time);
    handle.applySky(sky);
    lighting.volume?.setLampFactor(sky.lampFactor);
    applied = time;
  };
  apply();

  return {
    get time() {
      return time;
    },
    get litLamps() {
      return sky.lampFactor > 0 ? lighting.anchors.length : 0;
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
  readonly plot: Plot;
  readonly world: InstancedWorld;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly lighting: Lighting;
  readonly startup: StartupTracker;
  readonly mountStarted: number;
}): () => ShowcaseStats {
  // Everything is built by this point; the next thing that happens is a frame.
  const startup: StartupCost = {
    startupMs: Math.round(performance.now() - parts.mountStarted),
    startupFrames: parts.startup.frames(),
  };
  parts.startup.stop();
  return () => sceneStats({ ...parts, startup });
}

/**
 * Projects the label anchors to screen space, reusing its scratch matrices
 * across frames: the render loop must not hand the garbage collector work to do
 * sixty times a second.
 */
function createLabelProjector(
  handle: SceneHandle,
  canvas: HTMLCanvasElement,
  anchors: readonly LabelAnchor[],
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
    for (const anchor of anchors) {
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
 * TEMPORARY scaffold for the mutable scene: pressing this stands one more
 * cottage just south of the plot, so the instance, draw-call and triangle counts
 * in the HUD can be watched moving. Goes away once the HUD grows a real build
 * mode; nothing else reads it.
 *
 * The cottage is drawn but not lit — the light volume is still baked once, up
 * front. Baking a lamp incrementally is the next step.
 */
const DEBUG_PLACE_KEY = "p";

/** Object type the debug key places, and how far apart it spaces them, in tiles. */
const DEBUG_PLACE_ID = "cottage";
const DEBUG_PLACE_STEP = 3;

function listenForDebugPlacements(
  plot: Plot,
  world: InstancedWorld,
  onPlaced: () => void,
): () => void {
  const type = objectTypeById(DEBUG_PLACE_ID);
  const item = {
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
  };
  const isPlaceKey = (event: KeyboardEvent): boolean =>
    event.key === DEBUG_PLACE_KEY && !(event.metaKey || event.ctrlKey || event.altKey);

  let placed = 0;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isPlaceKey(event)) return;
    placed++;
    const key = `debug-${DEBUG_PLACE_ID}#${placed}`;
    // South of the plot, marching east: far enough along, this crosses into a
    // chunk of its own and the draw calls step up with it.
    plot.placements.push(place(item, key, 4 + placed * DEBUG_PLACE_STEP, plot.layout.tilesZ + 1));
    world.setPlacements(everythingOn(plot));
    onPlaced();
  };
  globalThis.addEventListener("keydown", onKeyDown);
  return () => globalThis.removeEventListener("keydown", onKeyDown);
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame, onSceneChange } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  // `?bench=1` pins the camera and the clock so two builds are compared on the
  // same pixels. Absent the flag this is null and nothing that reads it runs.
  const bench = parseBenchConfig(globalThis.location?.search ?? "");

  const plot = planResort(bench);
  const scratch = scratchForCatalogue();
  const catalogue = await meshModels(scratch, bench);
  const everything = everythingOn(plot);
  const lighting = bakeLighting(everything);
  const world = buildInstancedWorld(catalogue.geometries, everything, {
    lightVolume: lighting.volume,
  });

  const { framing, worldExtent } = frameCamera(everything, bench);
  const handle = await createScene({
    canvas,
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
    framing,
    worldExtent,
    lightVolume: lighting.volume,
    // Wall-clock frame times stop discriminating as soon as a frame fits inside
    // the refresh interval: everything faster reads as exactly 120 fps. The
    // GPU's own timers keep measuring past that point.
    trackTimestamp: bench !== null,
    forceWebGL: bench?.forceWebGL ?? false,
  });
  handle.scene.add(world.group);

  const anchors = labelAnchorsFor(plot.placements);

  let fpsState = createFpsState();
  let running = true;
  let lastTimeMs: number | null = null;
  const clock = createClock(handle, lighting, bench ? bench.time : INITIAL_TIME);

  if (bench) {
    // Damping would keep nudging the camera for the first second of the run.
    handle.controls.enabled = false;
    handle.controls.enableDamping = false;
  }

  const resize = (): void => {
    handle.resize(
      canvas.clientWidth || globalThis.innerWidth,
      canvas.clientHeight || globalThis.innerHeight,
    );
  };
  globalThis.addEventListener("resize", resize);

  const statsNow = createStatsReader({
    handle,
    plot,
    world,
    scratch,
    catalogue,
    lighting,
    startup,
    mountStarted,
  });

  const stopDebugPlacements = listenForDebugPlacements(plot, world, () =>
    onSceneChange?.(statsNow()),
  );

  const recorder = bench
    ? createBenchRecorder({ bench, handle, stats: statsNow, litLamps: () => clock.litLamps })
    : null;
  const projectLabels = createLabelProjector(handle, canvas, anchors);
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
    anchors,
    setTime: clock.setTime,
    setCycling: clock.setCycling,
    dispose() {
      running = false;
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener("resize", resize);
      stopDebugPlacements();
      lighting.volume?.dispose();
      world.dispose();
      handle.dispose();
    },
  };
}
