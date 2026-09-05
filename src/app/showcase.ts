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
} from "../features/catalog/domain/objectTypes";
import { layoutResort, placementCenter } from "../features/layout/domain/resortLayout";
import { RESORT_PLAN } from "../features/layout/domain/resortPlan";
import { cameraFramingFor, worldBoundsFor } from "../features/layout/domain/worldBounds";
import { skyStateFor } from "../features/lighting/domain/dayNight";
import type { LightAnchor } from "../features/lighting/domain/lightAnchors";
import { createNightLights, MAX_ACTIVE_LIGHTS } from "../features/lighting/nightLights";
import { scratchLayoutFor } from "../features/voxel-world/domain/modelScratch";
import {
  buildSectionMeshes,
  DEFAULT_WORLD_SCALE,
  sectionSizeOf,
} from "../features/voxel-world/dveEngine";
import { buildInstancedWorld } from "../features/rendering/instancedWorld";
import { buildModelGeometries } from "../features/rendering/voxelMeshBuilder";
import { CAMERA_FOV_DEGREES, createScene } from "../features/rendering/threeScene";
import { createFpsState, sampleFrame } from "../features/hud/domain/fps";
import { projectToScreen, type ScreenPosition } from "../features/hud/domain/labelProjection";

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
  /** Triangles uploaded once, shared by every instance of a model. */
  readonly uniqueTriangleCount: number;
  /** Triangles submitted per frame across all instances. */
  readonly drawnTriangleCount: number;
  /** Voxels the whole resort is made of, if it were painted out in full. */
  readonly sceneVoxelCount: number;
  /** Voxels actually meshed: one copy of each model. */
  readonly meshedVoxelCount: number;
  /** Light anchors on the plot, of which at most `maxActiveLights` ever burn. */
  readonly lightCount: number;
  readonly maxActiveLights: number;
}

export interface FrameUpdate {
  readonly fps: number;
  /** Normalised time of day, 0..1. */
  readonly time: number;
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
  /** Jumps the clock to a moment of the day and stops the cycle. */
  setTime(time: number): void;
  /** Starts or stops the automatic day/night cycle. */
  setCycling(cycling: boolean): void;
  dispose(): void;
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame } = options;

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

  // Paths and scattered props are placements too; they just never get a label.
  const everything = [...layout.placements, ...layout.props, ...layout.paths];

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

  const sections = await buildSectionMeshes(allMaterials(), scratch.writes);
  const geometries = buildModelGeometries({
    sections,
    regions: scratch.regions,
    colorsByMaterialId: materialColorsById(),
    emissiveByModelId: emissiveByModelId(),
  });
  const world = buildInstancedWorld(geometries, everything);

  const topById = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.height]));
  const bounds = worldBoundsFor(everything, (id) => topById.get(id) ?? 0);
  const framing = cameraFramingFor(bounds, CAMERA_FOV_DEGREES);
  const worldExtent = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);

  const width = canvas.clientWidth || globalThis.innerWidth;
  const height = canvas.clientHeight || globalThis.innerHeight;
  const handle = await createScene({ canvas, width, height, framing, worldExtent });
  handle.scene.add(world.group);

  // Every model that declares a light contributes one anchor per placement.
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
  const nightLights = createNightLights({ parent: handle.scene, anchors: lightAnchors });

  // One label per object *type*, not per placement: fifteen cottages do not
  // need fifteen captions, and the HUD stays the size it was.
  const labelled = new Map<string, (typeof layout.placements)[number]>();
  for (const placement of layout.placements) {
    if (!labelled.has(placement.id)) labelled.set(placement.id, placement);
  }
  const anchors: LabelAnchor[] = [...labelled.values()].map((placement) => {
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
  let time = INITIAL_TIME;
  let cycling = false;
  let lastTimeMs: number | null = null;

  handle.applySky(skyStateFor(time));

  const resize = (): void => {
    handle.resize(
      canvas.clientWidth || globalThis.innerWidth,
      canvas.clientHeight || globalThis.innerHeight,
    );
  };
  globalThis.addEventListener("resize", resize);

  const viewProjection: number[] = Array.from({ length: 16 }, () => 0);

  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    if (cycling) time = (time + elapsed / DAY_SECONDS) % 1;

    const sky = skyStateFor(time);
    handle.applySky(sky);
    handle.controls.update();
    nightLights.update(handle.camera.position, sky.lampFactor);
    handle.renderer.render(handle.scene, handle.camera);

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    handle.camera.updateMatrixWorld();
    const matrix = handle.camera.projectionMatrix
      .clone()
      .multiply(handle.camera.matrixWorldInverse);
    for (let i = 0; i < 16; i++) viewProjection[i] = matrix.elements[i]!;

    const viewport = {
      width: canvas.clientWidth || globalThis.innerWidth,
      height: canvas.clientHeight || globalThis.innerHeight,
    };
    const labels = new Map<string, ScreenPosition>();
    for (const anchor of anchors) {
      const screen = projectToScreen(anchor.world, viewProjection, viewport);
      if (screen) labels.set(anchor.id, screen);
    }
    onFrame({ fps: fpsState.fps, time, activeLights: nightLights.activeCount, labels });
  });

  const sceneVoxelCount = everything.reduce(
    (total, placement) => total + objectTypeById(placement.id).model.voxels.length,
    0,
  );

  return {
    stats: {
      backend: handle.backend,
      typeCount: new Set(everything.map((placement) => placement.id)).size,
      objectCount: layout.placements.length,
      propCount: layout.props.length,
      pathCount: layout.paths.length,
      instanceCount: world.instanceCount,
      drawCalls: world.drawCalls,
      uniqueTriangleCount: world.uniqueTriangleCount,
      drawnTriangleCount: world.drawnTriangleCount,
      sceneVoxelCount,
      meshedVoxelCount: scratch.writes.length,
      lightCount: lightAnchors.length,
      maxActiveLights: Math.min(MAX_ACTIVE_LIGHTS, lightAnchors.length),
    },
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
      nightLights.dispose();
      world.dispose();
      handle.dispose();
    },
  };
}
