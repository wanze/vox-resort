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
function trackStartupFrames(): { readonly frames: () => number; readonly stop: () => void } {
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
  readonly placements: readonly Placement[];
  /** Objects, scattered props and path tiles together: everything drawn. */
  readonly everything: readonly Placement[];
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
  const placements = tile(layout.placements);
  // Paths and scattered props are placements too; they just never get a label.
  const everything = [...placements, ...tile(layout.props), ...tile(layout.paths)];
  return { layout, placements, everything };
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
    for (const light of objectTypeById(placement.id).model.lights) {
      anchors.push({
        key: `${placement.key}:${anchors.length}`,
        x: placement.x + light.x,
        y: light.y,
        z: placement.z + light.z,
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
      });
    }
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

/** Everything the HUD and a bench report say about the scene that was built. */
function sceneStats(parts: {
  readonly handle: SceneHandle;
  readonly plot: Plot;
  readonly world: InstancedWorld;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly lighting: Lighting;
  readonly bench: BenchConfig | null;
  readonly startupFrames: number;
  readonly mountStarted: number;
}): ShowcaseStats {
  const { handle, plot, world, scratch, catalogue, lighting, bench } = parts;
  const repeats = (bench?.repeat ?? 1) ** 2;
  return {
    backend: handle.backend,
    typeCount: new Set(plot.everything.map((placement) => placement.id)).size,
    objectCount: plot.placements.length,
    propCount: plot.layout.props.length * repeats,
    pathCount: plot.layout.paths.length * repeats,
    instanceCount: world.instanceCount,
    drawCalls: world.drawCalls,
    chunkCount: world.chunkCount,
    uniqueTriangleCount: world.uniqueTriangleCount,
    unmergedTriangleCount: world.unmergedTriangleCount,
    drawnTriangleCount: world.drawnTriangleCount,
    sceneVoxelCount: plot.everything.reduce(
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
    // Everything is built by this point; the next thing that happens is a frame.
    startupMs: Math.round(performance.now() - parts.mountStarted),
    meshedInWorker: catalogue.threaded,
    startupFrames: parts.startupFrames,
  };
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
  readonly stats: ShowcaseStats;
  readonly litLampCount: () => number;
}): BenchRecorder {
  const { bench, handle, stats, litLampCount } = parts;
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
        activeLights: litLampCount(),
        scene: stats,
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

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  // `?bench=1` pins the camera and the clock so two builds are compared on the
  // same pixels. Absent the flag this is null and nothing that reads it runs.
  const bench = parseBenchConfig(globalThis.location?.search ?? "");

  const plot = planResort(bench);
  const scratch = scratchForCatalogue();
  const catalogue = await meshModels(scratch, bench);
  const lighting = bakeLighting(plot.everything);
  const world = buildInstancedWorld(catalogue.geometries, plot.everything, {
    lightVolume: lighting.volume,
  });

  const { framing, worldExtent } = frameCamera(plot.everything, bench);
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
  let time = bench ? bench.time : INITIAL_TIME;
  let cycling = false;
  let lastTimeMs: number | null = null;
  let sky = skyStateFor(time);
  let appliedTime: number | null = null;

  if (bench) {
    // Damping would keep nudging the camera for the first second of the run.
    handle.controls.enabled = false;
    handle.controls.enableDamping = false;
  }
  /** Lamps contributing right now: the bake lights all of them, or none. */
  const litLampCount = (): number => (sky.lampFactor > 0 ? lighting.anchors.length : 0);

  handle.applySky(sky);

  const resize = (): void => {
    handle.resize(
      canvas.clientWidth || globalThis.innerWidth,
      canvas.clientHeight || globalThis.innerHeight,
    );
  };
  globalThis.addEventListener("resize", resize);

  const stats = sceneStats({
    handle,
    plot,
    world,
    scratch,
    catalogue,
    lighting,
    bench,
    startupFrames: startup.frames(),
    mountStarted,
  });
  startup.stop();

  const recorder = bench ? createBenchRecorder({ bench, handle, stats, litLampCount }) : null;
  const projectLabels = createLabelProjector(handle, canvas, anchors);
  const labels = new Map<string, ScreenPosition>();

  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    if (cycling) time = (time + elapsed / DAY_SECONDS) % 1;

    // The sky only moves when the clock does; with it frozen — which is most of
    // the time, since the cycle starts stopped — this is a whole scene's worth
    // of colour and light updates that nothing would have looked at.
    if (time !== appliedTime) {
      sky = skyStateFor(time);
      handle.applySky(sky);
      lighting.volume?.setLampFactor(sky.lampFactor);
      appliedTime = time;
    }
    if (!bench) handle.controls.update();
    handle.renderer.render(handle.scene, handle.camera);

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    projectLabels(labels);
    onFrame({ fps: fpsState.fps, time, activeLights: litLampCount(), labels });

    if (recorder) {
      recorder.record(elapsed * 1000);
      void recorder.sampleGpu();
    }
  });

  return {
    get benchResult() {
      return recorder?.result() ?? null;
    },
    stats,
    anchors,
    setTime(next) {
      cycling = false;
      time = next;
    },
    setCycling(next) {
      cycling = next;
    },
    dispose() {
      running = false;
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener("resize", resize);
      lighting.volume?.dispose();
      world.dispose();
      handle.dispose();
    },
  };
}
