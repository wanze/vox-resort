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
import { layoutResort, placementCenter } from "../features/layout/domain/resortLayout";
import { RESORT_PLAN } from "../features/layout/domain/resortPlan";
import { cameraFramingFor, worldBoundsFor } from "../features/layout/domain/worldBounds";
import { skyStateFor } from "../features/lighting/domain/dayNight";
import type { LightAnchor } from "../features/lighting/domain/lightAnchors";
import {
  bakeLightGrid,
  cellCount,
  gridByteSize,
  lightGridSpecFor,
} from "../features/lighting/domain/lightGrid";
import { createBakedLightVolume } from "../features/lighting/bakedLightVolume";
import { scratchLayoutFor } from "../features/voxel-world/domain/modelScratch";
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from "../features/voxel-world/dveEngine";
import { meshCatalogue } from "../features/voxel-world/meshCatalogue";
import { buildInstancedWorld } from "../features/rendering/instancedWorld";
import { buildModelGeometries } from "../features/rendering/voxelMeshBuilder";
import { CAMERA_FOV_DEGREES, createScene } from "../features/rendering/threeScene";
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

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame } = options;
  const mountStarted = performance.now();

  // A main thread that is meshing paints nothing; one that is waiting on a
  // worker keeps servicing this. The difference is the whole point of the
  // worker, and it is not visible in a wall-clock startup number.
  let startupFrames = 0;
  let countingStartup = true;
  const countStartupFrame = (): void => {
    if (!countingStartup) return;
    startupFrames++;
    globalThis.requestAnimationFrame(countStartupFrame);
  };
  globalThis.requestAnimationFrame(countStartupFrame);

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

  // `?bench=1` pins the camera and the clock so two builds are compared on the
  // same pixels. Absent the flag this is null and nothing that reads it runs.
  const bench = parseBenchConfig(globalThis.location?.search ?? "");

  // The benchmark can tile the plot, to measure a resort several times this size.
  const tile = <T extends { key: string; x: number; z: number }>(items: readonly T[]): T[] =>
    repeatPlot(items, bench?.repeat ?? 1, layout.tilesX * TILE_VOXELS, layout.tilesZ * TILE_VOXELS);
  const placements = tile(layout.placements);
  // Paths and scattered props are placements too; they just never get a label.
  const everything = [...placements, ...tile(layout.props), ...tile(layout.paths)];

  // One scratch region per model, so the mesher runs over each model exactly once.
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

  const meshStarted = performance.now();
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
  const geometries = buildModelGeometries(meshed.models);
  const dveMs = meshed.dveMs;
  const meshMs = Math.round(performance.now() - meshStarted);

  // Every model that declares a light contributes one anchor per placement.
  // These are derived before anything is built, because the bake they feed is
  // what the materials below are wired to.
  const lightAnchors: LightAnchor[] = [];
  for (const placement of everything) {
    for (const light of objectTypeById(placement.id).model.lights) {
      lightAnchors.push({
        key: `${placement.key}:${lightAnchors.length}`,
        x: placement.x + light.x,
        y: light.y,
        z: placement.z + light.z,
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
      });
    }
  }

  const gridSpec = lightGridSpecFor(lightAnchors);
  const bakeStarted = performance.now();
  const bakedGrid = gridSpec ? bakeLightGrid(lightAnchors, gridSpec) : null;
  const lightBakeMs = Math.round(performance.now() - bakeStarted);
  const lightVolume = bakedGrid ? createBakedLightVolume(bakedGrid) : null;

  const world = buildInstancedWorld(geometries, everything, { lightVolume });

  const topById = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.height]));
  const bounds = worldBoundsFor(everything, (id) => topById.get(id) ?? 0);
  const framing = bench
    ? benchFraming(bench.view, bounds, CAMERA_FOV_DEGREES)
    : cameraFramingFor(bounds, CAMERA_FOV_DEGREES);
  const worldExtent = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);

  const width = canvas.clientWidth || globalThis.innerWidth;
  const height = canvas.clientHeight || globalThis.innerHeight;
  const handle = await createScene({
    canvas,
    width,
    height,
    framing,
    worldExtent,
    lightVolume,
    // Wall-clock frame times stop discriminating as soon as a frame fits inside
    // the refresh interval: everything faster reads as exactly 120 fps. The
    // GPU's own timers keep measuring past that point.
    trackTimestamp: bench !== null,
    forceWebGL: bench?.forceWebGL ?? false,
  });
  handle.scene.add(world.group);

  // One label per object *type*, not per placement: fifteen cottages do not
  // need fifteen captions, and the HUD stays the size it was. Which cottage
  // carries it is chosen to spread the captions over the plot — see
  // `hud/domain/labelPlacement.ts`.
  const anchors: LabelAnchor[] = spreadLabelAnchors(placements).map((placement) => {
    const type = objectTypeById(placement.id);
    const center = placementCenter(placement);
    return {
      id: placement.id,
      label: type.label,
      color: type.color,
      world: { x: center.x, y: objectTypeTop(placement.id) + LABEL_LIFT, z: center.z },
    };
  });

  let fpsState = createFpsState();
  let running = true;
  let time = bench ? bench.time : INITIAL_TIME;
  let cycling = false;
  let lastTimeMs: number | null = null;

  if (bench) {
    // Damping would keep nudging the camera for the first second of the run.
    handle.controls.enabled = false;
    handle.controls.enableDamping = false;
  }
  /** Lamps contributing right now: the bake lights all of them, or none. */
  const litLampCount = (lampFactor: number): number => (lampFactor > 0 ? lightAnchors.length : 0);

  const benchFrames: number[] = [];
  const benchGpuFrames: number[] = [];
  let benchFrame = 0;
  let benchResult: BenchResult | null = null;

  handle.applySky(skyStateFor(time));

  const resize = (): void => {
    handle.resize(
      canvas.clientWidth || globalThis.innerWidth,
      canvas.clientHeight || globalThis.innerHeight,
    );
  };
  globalThis.addEventListener("resize", resize);

  const repeats = (bench?.repeat ?? 1) ** 2;
  const sceneVoxelCount = everything.reduce(
    (total, placement) => total + objectTypeById(placement.id).model.voxels.length,
    0,
  );
  const stats: ShowcaseStats = {
    backend: handle.backend,
    typeCount: new Set(everything.map((placement) => placement.id)).size,
    objectCount: placements.length,
    propCount: layout.props.length * repeats,
    pathCount: layout.paths.length * repeats,
    instanceCount: world.instanceCount,
    drawCalls: world.drawCalls,
    chunkCount: world.chunkCount,
    uniqueTriangleCount: world.uniqueTriangleCount,
    unmergedTriangleCount: world.unmergedTriangleCount,
    drawnTriangleCount: world.drawnTriangleCount,
    sceneVoxelCount,
    meshedVoxelCount: scratch.writes.length,
    lightCount: lightAnchors.length,
    lightGridCells: gridSpec ? cellCount(gridSpec) : 0,
    lightGridBytes: gridSpec ? gridByteSize(gridSpec) : 0,
    lightBakeMs,
    dveMs,
    meshMs,
    // Everything is built by this point; the next thing that happens is a frame.
    startupMs: Math.round(performance.now() - mountStarted),
    meshedInWorker: meshed.threaded,
    startupFrames,
  };
  countingStartup = false;

  const viewProjection: number[] = Array.from({ length: 16 }, () => 0);
  // Reused across frames: the render loop must not hand the garbage collector
  // work to do sixty times a second.
  const viewProjectionMatrix = new Matrix4();
  const labels = new Map<string, ScreenPosition>();
  let sky = skyStateFor(time);
  let appliedTime: number | null = null;

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
      lightVolume?.setLampFactor(sky.lampFactor);
      appliedTime = time;
    }
    if (!bench) handle.controls.update();
    handle.renderer.render(handle.scene, handle.camera);

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    handle.camera.updateMatrixWorld();
    viewProjectionMatrix
      .copy(handle.camera.projectionMatrix)
      .multiply(handle.camera.matrixWorldInverse);
    for (let i = 0; i < 16; i++) viewProjection[i] = viewProjectionMatrix.elements[i]!;

    const viewport = {
      width: canvas.clientWidth || globalThis.innerWidth,
      height: canvas.clientHeight || globalThis.innerHeight,
    };
    labels.clear();
    for (const anchor of anchors) {
      const screen = projectToScreen(anchor.world, viewProjection, viewport);
      if (screen) labels.set(anchor.id, screen);
    }
    onFrame({ fps: fpsState.fps, time, activeLights: litLampCount(sky.lampFactor), labels });

    if (bench) {
      recordBenchFrame(elapsed * 1000);
      void sampleGpuTime();
    }
  });

  /**
   * Reads back one frame's GPU duration. Resolving drains the query pool, so
   * calling this once per frame gives one reading per frame.
   */
  async function sampleGpuTime(): Promise<void> {
    if (benchResult) return;
    const duration = await handle.renderer.resolveTimestampsAsync();
    if (typeof duration === "number" && duration > 0) benchGpuFrames.push(duration);
  }

  function recordBenchFrame(frameMs: number): void {
    if (!bench) return;
    benchFrame++;
    if (benchFrame <= bench.warmupFrames) return;
    if (benchFrames.length < bench.measureFrames) benchFrames.push(frameMs);
    if (benchFrames.length < bench.measureFrames) return;
    if (benchResult) return;
    benchResult = {
      config: bench,
      backend: handle.backend,
      pixelRatio: handle.renderer.getPixelRatio(),
      drawingBufferSize: handle.drawingBufferSize(),
      activeLights: litLampCount(sky.lampFactor),
      scene: stats,
      drawn: {
        drawCalls: handle.renderer.info.render.drawCalls,
        triangles: handle.renderer.info.render.triangles,
      },
      stats: roundStats(summarizeFrames(benchFrames)),
      gpu: benchGpuFrames.length > 0 ? roundStats(summarizeFrames(benchGpuFrames)) : null,
    };
    (globalThis as Record<string, unknown>).__voxBench = benchResult;
  }

  return {
    get benchResult() {
      return benchResult;
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
      lightVolume?.dispose();
      world.dispose();
      handle.dispose();
    },
  };
}
