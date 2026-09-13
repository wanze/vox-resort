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

import { materialKeyFor, voxelIdFor } from '../features/catalog/domain/materials';
import {
  allMaterials,
  emissiveByModelId,
  waterByModelId,
  windowsByModelId,
  materialColorsById,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeTop,
  PAINTED_MODELS,
  PEOPLE_MODELS,
  SEA_MODELS,
  SKY_MODELS,
  TILE_VOXELS,
} from '../features/catalog/domain/objectTypes';
import type { LayoutItem, Placement, ResortLayout } from '../features/layout/domain/resortLayout';
import { layoutResort, railModelsIn, tileKey } from '../features/layout/domain/resortLayout';
import { rotateLights } from '../features/layout/domain/rotation';
import type { ResortPlan } from '../features/layout/domain/resortPlan';
import {
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
  HEDGE_ID,
  JETTY_ID,
  LAMP_ID,
  PAVING_IDS,
  PEDALO_RENTAL_ID,
  PIER_RAILING_ID,
  RAILING_ID,
  RESORT_PLAN,
  STAIR_RAILING_ID,
  STAIRS_ID,
} from '../features/layout/domain/resortPlan';
import type { Shore } from '../features/layout/domain/shoreline';
import { beachTilesOf, shoreFor } from '../features/layout/domain/shoreline';
import type { Terrain } from '../features/layout/domain/terrain';
import { overlooksDrop, terrainFor } from '../features/layout/domain/terrain';
import type { GeneratorType, ResortParams } from '../features/layout/domain/resortGenerator';
import {
  clampParams,
  emptyResortPlan,
  generateResort,
} from '../features/layout/domain/resortGenerator';
import { layoutItemFor } from '../features/build/domain/buildPlan';
import {
  isPaving,
  pavedGroundOf,
  raisedProvider,
  type PavingRules,
} from '../features/build/domain/paving';
import { type HandrailRules } from '../features/build/domain/handrails';
import type { TerrainRules } from '../features/build/domain/terrainBrush';
import { armedBrush, armedObject, type BuildTool } from '../features/build/domain/buildTool';
import { createTerrainPointer } from '../features/build/adapters/terrainPointer';
import type { TileOccupancy } from '../features/build/domain/tileOccupancy';
import { createTileOccupancy, footprintTiles } from '../features/build/domain/tileOccupancy';
import type { RailIndex } from '../features/build/domain/railIndex';
import { createRailIndex } from '../features/build/domain/railIndex';
import { createBuildPointer } from '../features/build/adapters/buildPointer';
import type { PickGround } from '../features/build/domain/groundPick';
import { createPlacementGhost } from '../features/build/adapters/placementGhost';
import type { WorldBounds } from '../features/layout/domain/worldBounds';
import { cameraFramingFor, worldBoundsFor } from '../features/layout/domain/worldBounds';
import { skyStateFor } from '../features/lighting/domain/dayNight';
import type { ModelLight } from '../../voxel-gen/voxelgen.ts';
import type { Ground, LightAnchor } from '../features/lighting/domain/lightAnchors';
import { anchorsFor, lampReservationFor } from '../features/lighting/domain/lightAnchors';
import type { LightGridSpec } from '../features/lighting/domain/lightGrid';
import {
  bakeLightGrid,
  cellCount,
  DEFAULT_GRID_BUDGET_BYTES,
  gridByteSize,
  lightGridSpecFor,
} from '../features/lighting/domain/lightGrid';
import type { LiveLightGrid } from '../features/lighting/domain/liveLightGrid';
import { createLiveLightGrid } from '../features/lighting/domain/liveLightGrid';
import type { LiveSkyVisibility, Occluder } from '../features/lighting/domain/skyVisibility';
import { createLiveSkyVisibility } from '../features/lighting/domain/skyVisibility';
import type { BakedLightVolume } from '../features/lighting/adapters/bakedLightVolume';
import { createBakedLightVolume } from '../features/lighting/adapters/bakedLightVolume';
import type { ScratchLayout } from '../features/voxel-world/domain/modelScratch';
import { scratchLayoutFor } from '../features/voxel-world/domain/modelScratch';
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from '../features/voxel-world/adapters/dveEngine';
import { meshCatalogue } from '../features/voxel-world/adapters/meshCatalogue';
import type { InstancedWorld } from '../features/rendering/adapters/instancedWorld';
import { buildInstancedWorld } from '../features/rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../features/rendering/adapters/voxelMeshBuilder';
import { buildModelGeometries } from '../features/rendering/adapters/voxelMeshBuilder';
import type { BlobShadow, ShadowCaster } from '../features/rendering/domain/blobShadows';
import { blobShadowFor, blobShadowsFor } from '../features/rendering/domain/blobShadows';
import { SAND_LEVEL, SEA_LEVEL } from '../features/rendering/domain/terrainSurface';
import type { BlobShadowField } from '../features/rendering/adapters/blobShadowField';
import { buildBlobShadowField } from '../features/rendering/adapters/blobShadowField';
import { createCrowd, MAX_STEP } from '../features/crowd/domain/crowd';
import { walkNetworkFor } from '../features/crowd/domain/walkNetwork';
import { seatSpotsFor, type SeatSite } from '../features/crowd/domain/seating';
import type { CrowdField } from '../features/crowd/adapters/crowdField';
import { buildCrowdField } from '../features/crowd/adapters/crowdField';
import type { BalloonField } from '../features/balloons/adapters/balloonField';
import { buildBalloonField } from '../features/balloons/adapters/balloonField';
import {
  createBalloons,
  releaseStrength,
  type ReleaseSite,
} from '../features/balloons/domain/balloons';
import type { SeaField } from '../features/sea/adapters/seaField';
import { buildSeaField } from '../features/sea/adapters/seaField';
import { createFlotilla } from '../features/sea/domain/flotilla';
import { pierBoxesFor } from '../features/sea/domain/piers';
import { berthsOf, createPassengers } from '../features/sea/domain/passengers';
import { buoyLampSites } from '../features/sea/domain/buoyLamps';
import type { Mooring, Rental, SailingGround } from '../features/sea/domain/swimArea';
import { sailingGroundFor, swimAreaMoorings } from '../features/sea/domain/swimArea';
import { BUOY_INDEX, PEDALO_INDEX } from '../../voxel-gen/sea/index.ts';
import type {
  CameraFraming,
  CameraMode,
  CompassDirection,
} from '../features/layout/domain/worldBounds';
import { turnDirection } from '../features/layout/domain/worldBounds';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { CAMERA_FOV_DEGREES, createScene } from '../features/rendering/adapters/threeScene';
import { createCameraKeys } from '../features/rendering/adapters/cameraKeys';
import { createFpsState, sampleFrame } from '../features/hud/domain/fps';
import type { FrameUpdate } from '../features/hud/adapters/hudOverlay';
import {
  benchFraming,
  parseBenchConfig,
  type BenchConfig,
} from '../features/bench/domain/benchConfig';
import { repeatPlot } from '../features/bench/domain/plotRepeat';
import { roundStats, summarizeFrames, type FrameStats } from '../features/bench/domain/frameStats';

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

/**
 * People walking the resort.
 *
 * The number `docs/crowd.md` costs the design out at, and the one the step loop
 * was measured against. It is a constant here rather than a parameter because
 * nothing offers it yet; `?people=n` is the next step of that document.
 */
const CROWD_SIZE = 600;

/**
 * The seed every crowd is spawned from.
 *
 * Fixed, and it has to be: a benchmark run "only compares with the one before it
 * if the scene has not moved", and a crowd drawn from `Math.random` would put
 * six hundred people somewhere else on every load. Regenerating the plot changes
 * the network under them, which is what makes two resorts differ.
 */
const CROWD_SEED = 1;

/**
 * Lucky balloons the beach can have going at once, in the air and waiting.
 *
 * Three dozen, which at the height of the release is a sky with twenty or so
 * lanterns climbing out of it — enough to read as an event from across the plot
 * and few enough that a single one can still be followed up. A constant for the
 * reason {@link CROWD_SIZE} is one: nothing offers it yet.
 */
const BALLOON_COUNT = 36;

/** The seed every sky is drawn from; fixed, for {@link CROWD_SEED}'s reason. */
const BALLOON_SEED = 2;

/**
 * Craft drifting about the bay, on top of the buoys the swimming area is marked
 * with — those are one per mooring, and the coast decides how many that is.
 *
 * A dozen, which on the bay a generated plot comes out with is a boat every
 * hundred metres or so of water: enough that there is always one in frame from
 * the beach, and few enough that the water still reads as water rather than as a
 * marina. A constant for the reason {@link CROWD_SIZE} is one: nothing offers it
 * yet. See `features/sea/`.
 */
const CRAFT_COUNT = 12;

/**
 * Pedalos the hire hut has, which is also how many berths are laid in front of
 * it.
 *
 * Six, and the number is capped by the hut rather than chosen freely: the berths
 * are a row in the corridor cut through the bathing area, and a rack wider than
 * that corridor would moor its outside boats in among the swimmers. See
 * `BERTH_SPACING` in `sea/domain/flotilla.ts`.
 */
const HIRE_COUNT = 6;

/** The seed every bay is drawn from; fixed, for {@link CROWD_SEED}'s reason. */
const SEA_SEED = 3;

/**
 * The seed the bay's passengers are seated from; fixed, for the same reason.
 *
 * Its own rather than the bay's, so that adding or taking away a berth does not
 * reshuffle the fleet itself: the flotilla draws its speeds and headings from
 * {@link SEA_SEED} before anybody is put in a boat, and a shared generator would
 * have made where the boats are depend on how many people are in them.
 */
const CREW_SEED = 4;

/** Where the clock starts: late afternoon, so the scene reads in daylight. */
const INITIAL_TIME = 0.62;

/** Real seconds one full day takes when the cycle is running. */
const DAY_SECONDS = 90;

export interface ShowcaseStats {
  readonly backend: 'webgpu' | 'webgl2';
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
  readonly backend: 'webgpu' | 'webgl2';
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
   * Called when the scene itself puts the pointer down — pressing Escape — so
   * the palette can drop its highlight. Arming from the HUD does not come back
   * through here; the HUD already knows.
   */
  readonly onToolChange?: (tool: BuildTool | null) => void;
  /**
   * Called when the camera changes mode or turns, so the HUD follows the
   * keyboard. Changing it *from* the HUD does not come back through here; the
   * HUD already knows.
   */
  readonly onCameraChange?: (view: CameraView) => void;
}

/** Which camera the resort is being drawn through, and which way it faces. */
export interface CameraView {
  readonly mode: CameraMode;
  /** The compass point the isometric camera stands over; unused in perspective. */
  readonly direction: CompassDirection;
}

export interface Showcase {
  readonly stats: ShowcaseStats;
  /** Populated once a `?bench=1` run has collected its frames. */
  readonly benchResult: BenchResult | null;
  /** The parameters the resort on screen was grown from. */
  readonly params: ResortParams;
  /** Which camera is on screen, and which way the isometric one faces. */
  readonly cameraView: CameraView;
  setCameraMode(mode: CameraMode): void;
  setIsoDirection(direction: CompassDirection): void;
  /** Turns the isometric view a quarter; negative turns anticlockwise. */
  turnCamera(quarters: number): void;
  /** Grows a new resort from these parameters and puts it on screen. */
  generate(params: ResortParams): void;
  /** Clears the plot to bare ground of this size, to build on by hand. */
  clear(params: ResortParams): void;
  /**
   * Arms the pointer with an object to stand or a brush to work the ground with,
   * or null to put it down. One tool at a time; see `buildTool.ts`.
   */
  selectTool(tool: BuildTool | null): void;
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
  /** Authored objects: what the generator laid out, and what the pointer adds. */
  readonly placements: Placement[];
  /** Lamps and hedges the layout scattered along the paths. */
  readonly props: Placement[];
  /** One placement per paved tile. */
  readonly paths: Placement[];
  /** Handrails, standing on the paving they guard rather than on ground of their own. */
  readonly rails: Placement[];
}

/** Objects, scattered props, path tiles and rails: everything the scene draws. */
function everythingOn(plot: Plot): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths, ...plot.rails];
}

/**
 * Everything that claims a tile of the plot.
 *
 * Everything the scene draws, less the handrails: a rail stands on the paving it
 * guards, so the tile under it is the slab's, and the three things that ask what
 * is standing on a tile — the occupancy index, the shadows and the sky-visibility
 * bake — would all get the wrong answer from it. A blob shadow the size of the
 * tile is the visible half of that; a pointer that refused to pave next to a
 * step would be the other.
 */
function claimingOn(plot: Plot): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths];
}

/**
 * Lays a plan out, and tiles it when the benchmark asks for a bigger one.
 */
function layOut(plan: ResortPlan, bench: BenchConfig | null): Plot {
  const layout = layoutResort(OBJECT_TYPES.map(layoutItemFor), plan);
  const tile = <T extends { key: string; x: number; z: number }>(items: readonly T[]): T[] =>
    repeatPlot(items, bench?.repeat ?? 1, layout.tilesX * TILE_VOXELS, layout.tilesZ * TILE_VOXELS);
  return {
    layout,
    placements: tile(layout.placements),
    props: tile(layout.props),
    paths: tile(layout.paths),
    rails: tile(layout.rails),
  };
}

/**
 * One scratch region per model, so the mesher runs over each model exactly once.
 *
 * Over {@link PAINTED_MODELS}, which is the catalogue *and* the crowd: a person
 * is meshed exactly the way a cottage is, and four figures of 3 x 7 x 2 are
 * nothing against the extent the check below guards.
 */
function scratchForModels(): ScratchLayout {
  const scratch = scratchLayoutFor(
    PAINTED_MODELS,
    (color) => voxelIdFor(materialKeyFor(color)),
    sectionSizeOf(DEFAULT_WORLD_SCALE),
  );
  if (scratch.extentX > DEFAULT_WORLD_SCALE.horizontalExtent) {
    throw new Error(
      `The models need ${scratch.extentX} voxels of scratch space, the world allows ${DEFAULT_WORLD_SCALE.horizontalExtent}`,
    );
  }
  return scratch;
}

interface MeshedCatalogue {
  /** The catalogue's own geometries: everything that stands on a tile. */
  readonly geometries: readonly ModelGeometry[];
  /**
   * The crowd's, kept apart from the moment they come back from the mesher.
   *
   * The instanced world never sees them: a person is not a placement, so a
   * geometry the world held would be one it could be asked to stand on the plot.
   * They belong to the crowd field instead — see `crowd/adapters/crowdField.ts`.
   */
  readonly people: readonly ModelGeometry[];
  /**
   * The sky's, kept apart for the reason the crowd's are: a balloon is not a
   * placement either, and the instanced world must never be able to stand one
   * on a tile. They belong to the balloon field — see `features/balloons/`.
   */
  readonly sky: readonly ModelGeometry[];
  /**
   * The bay's, kept apart for the reason the sky's are — and for one more: a
   * boat stands on water, and `layoutResort` refuses to stand anything there.
   * They belong to the sea field — see `features/sea/`.
   */
  readonly sea: readonly ModelGeometry[];
  readonly dveMs: number;
  readonly meshMs: number;
  readonly threaded: boolean;
}

/** Ids the crowd is drawn from, which is what tells the three apart. */
const PEOPLE_IDS: ReadonlySet<string> = new Set(PEOPLE_MODELS.map((model) => model.id));

/** Ids the sky is drawn from, likewise. */
const SKY_IDS: ReadonlySet<string> = new Set(SKY_MODELS.map((model) => model.id));

/** Ids the bay is drawn from, likewise. */
const SEA_IDS: ReadonlySet<string> = new Set(SEA_MODELS.map((model) => model.id));

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
      waterByModelId: waterByModelId(),
      windowsByModelId: windowsByModelId(),
    },
    { forceMainThread: bench?.forceMainThreadMeshing ?? false },
  );
  const geometries = buildModelGeometries(meshed.models);
  return {
    geometries: geometries.filter(
      (model) => !PEOPLE_IDS.has(model.id) && !SKY_IDS.has(model.id) && !SEA_IDS.has(model.id),
    ),
    // In registry order, because a person's `variant` indexes into it.
    people: geometries.filter((model) => PEOPLE_IDS.has(model.id)),
    // Likewise a balloon's.
    sky: geometries.filter((model) => SKY_IDS.has(model.id)),
    // Likewise a boat's; see `BUOY_INDEX` in `voxel-gen/sea/index.ts`.
    sea: geometries.filter((model) => SEA_IDS.has(model.id)),
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
 * An object as its seats see it: where the model's corner is, how high it
 * stands, which way round it is, and the seats the art declared on it.
 *
 * The model's own size goes along with it for the reason it does in
 * {@link lightsOf} — a placement's extent is already turned, and a seat turned
 * against it would seat somebody outside the chair it was declared in. The turn
 * itself is `seating.ts`'s to apply.
 */
function seatSiteOf(placement: Placement): SeatSite {
  const { model } = objectTypeById(placement.id);
  return {
    x: placement.x,
    z: placement.z,
    y: placement.y,
    rotation: placement.rotation,
    width: model.width,
    depth: model.depth,
    seats: model.seats,
  };
}

/**
 * The box an object stands in, as far as the sky behind it is concerned.
 *
 * The placement's own extents, which are already turned, and the model's height
 * standing on its own terrace. A path slab comes out two voxels tall and is
 * dropped by the bake itself; see `MIN_OCCLUDER_HEIGHT`.
 */
function occluderOf(placement: Placement): Occluder {
  return {
    minX: placement.x,
    maxX: placement.x + placement.width,
    minY: placement.y,
    maxY: placement.y + objectTypeTop(placement.id),
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

/** Puts out whatever lamps an object declares, re-baking only what they reached. */
function unsplatLights(baked: BakedLighting, placement: Placement): void {
  for (const anchor of anchorsFor(placement, lightsOf(placement))) {
    const edit = baked.live.remove(anchor.key);
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
  /**
   * Lights a rail's lanterns and nothing else: a rail claims no ground, so it
   * takes no sky away either. See {@link claimingOn}.
   */
  light(placement: Placement): void;
  /** Puts out whatever lamps a placement taken off the plot declared. */
  unlight(placement: Placement): void;
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
    light() {},
    unlight() {},
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
 *
 * The lamps come from more than what claims ground. The rails carry lanterns —
 * every bridge and pier is lit by them — and take no sky away, so they are baked
 * for their light alone. The buoys are not placements at all, and are baked at
 * their moorings; see {@link buoyLampsAt}.
 */
function createLighting(parts: {
  /** Everything that claims a tile: lamps, and the boxes that shade the sky. */
  readonly claiming: readonly Placement[];
  /** The rails, whose lanterns light and whose boxes shade nothing. */
  readonly rails: readonly Placement[];
  /** The lamps on the buoys, already where their moorings put them. */
  readonly buoys: readonly LightAnchor[];
  readonly ground: Ground;
}): Lighting {
  const { claiming, ground } = parts;
  const anchors = [...claiming, ...parts.rails]
    .flatMap((placement) => anchorsFor(placement, lightsOf(placement)))
    .concat(parts.buoys);
  const spec = lightGridSpecFor(
    anchors,
    DEFAULT_GRID_BUDGET_BYTES,
    // The buoys are moored on the plot, so the catalogue's reach already covers
    // them; see `swimAreaMoorings`.
    lampReservationFor(ground, CATALOGUE_LIGHTS),
  );
  if (!spec) return unlitLighting(anchors.length);

  const started = performance.now();
  const grid = bakeLightGrid(anchors, spec);
  const skyStarted = performance.now();
  const sky = createLiveSkyVisibility(spec, grid.direction, claiming.map(occluderOf));
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
    light(placement) {
      anchorCount += lightsOf(placement).length;
      splatLights(baked, placement);
    },
    unlight(placement) {
      anchorCount -= lightsOf(placement).length;
      unsplatLights(baked, placement);
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

/**
 * Frames the perspective camera on what is actually on the plot, or on the
 * bench's fixed view.
 *
 * Only the perspective one: the isometric camera is framed inside the scene,
 * because turning it to another compass point has to re-frame it and nothing
 * above the scene should have to know that. The bench presets are perspective
 * framings — see `benchConfig.ts` for why a run stays in that mode.
 */
function frameCamera(bounds: WorldBounds, bench: BenchConfig | null): CameraFraming {
  return bench
    ? benchFraming(bench.view, bounds, CAMERA_FOV_DEGREES)
    : cameraFramingFor(bounds, CAMERA_FOV_DEGREES);
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
  /**
   * The people walking this plot's paving.
   *
   * Part of the resort rather than of the renderer above it, because the graph
   * they walk is derived from this plot's paving and nothing else: regenerate
   * and the network, and so the crowd on it, is a different one. See
   * `crowd/domain/walkNetwork.ts`.
   *
   * Which is also the limit of it: a path laid by hand is not walked until the
   * plot is grown again, because the network is built with the resort and not
   * kept live the way the occupancy index is. Nobody walks into a building that
   * was not there either — a person is on an edge, and an edge is between two
   * tiles that were paved when the plot was laid.
   */
  readonly crowd: CrowdField;
  /**
   * The lucky balloons this plot's beach lets go at dusk.
   *
   * Part of the resort for the reason the crowd is: they go up off *this*
   * plot's sand, so a plot generated without a shore has none, and regenerating
   * gives the beach a different shape to release them from. See
   * `features/balloons/`.
   */
  readonly balloons: BalloonField;
  /**
   * The boats and buoys on this plot's bay.
   *
   * Part of the resort for the reason the balloons are: the swimming area is
   * marked off *this* plot's coastline and the craft sail *this* plot's water,
   * so a plot generated without a shore has neither. See `features/sea/`.
   */
  readonly sea: SeaField;
  readonly occupancy: TileOccupancy;
  /**
   * The plot's rails by tile, and the only writer of `plot.rails`.
   *
   * A rail claims no tile, so it has no place in `occupancy`; this is the index
   * it gets instead, so asking what guards the tiles around an edit costs five
   * lookups rather than five scans of the plot. See `build/domain/railIndex.ts`.
   */
  readonly railIndex: RailIndex;
  /** Where this plot meets the sea, if it does; the scene draws the coast from it. */
  readonly shore: Shore | null;
  /**
   * What every tile of this plot is made of and how high it stands.
   *
   * Part of the resort and mutable with it: the coast and the terraces resolved
   * into a field, with whatever ground has been dug or piled on top. The scene
   * draws every surface but the sea from it, the pointer asks it what a tile
   * will take, and the terrain tool writes into it. See `terrain.ts`.
   */
  readonly terrain: Terrain;
  /** How much ground the resort covers: what both cameras are framed on. */
  readonly bounds: WorldBounds;
  /** Where the perspective camera stands; the isometric one is framed in the scene. */
  readonly framing: CameraFraming;
  dispose(): void;
}

/**
 * The crowd this plot can hold, from the paving it was laid with.
 *
 * Every question about the ground is asked here, once — which tiles are paved,
 * how high each one stands, where the sand is, what can be sat on — and
 * answered into a graph the per-frame step never has to leave. See
 * `crowd/domain/walkNetwork.ts`.
 *
 * The network is built from the *layout's* paving rather than from the plot's,
 * which is the same list on every plot but one: the benchmark tiles the plan out
 * to nine times the size, and the copies stand on ground the elevation and the
 * shore know nothing about. The crowd walks the plot that is actually there.
 */
function crowdFor(parts: {
  readonly plot: Plot;
  readonly plan: ResortPlan;
  readonly shore: Shore | null;
  readonly terrain: Terrain;
  readonly people: readonly ModelGeometry[];
  /** The lamps the crowd walks under, so a person catches the light a wall does. */
  readonly lightVolume: BakedLightVolume | null;
}): CrowdField {
  const network = walkNetworkFor({
    paved: parts.plot.layout.paths,
    levelOf: (tileX, tileZ) => parts.terrain.levelOf(tileX, tileZ),
    shore: parts.shore,
    tilesX: parts.plan.tilesX,
    // Which paving stands a metre above what it is laid on: a bridge over a
    // river or a lake, and nothing else — the pier out over the bay lies flat on
    // the sea. Asked of the ground here exactly as `layoutResort` asks it, so the
    // crowd walks the deck the layout actually stood. See `spans.ts`.
    bridged: (tileX, tileZ) =>
      parts.terrain.surfaceOf(tileX, tileZ) === 'water' && !parts.terrain.isSea(tileX, tileZ),
    // The authored objects *and* the scattered props, because the bench is one
    // of the latter: the layout stands benches along the path edges itself, so
    // a crowd built off `placements` alone would have nothing to sit on at all.
    // Off the layout's own lists for the reason the paving is: a benchmark's
    // tiled copies stand on ground the shore and the elevation never heard of.
    seats: seatSpotsFor(
      [...parts.plot.layout.placements, ...parts.plot.layout.props].map(seatSiteOf),
    ),
    // The same two lists, as boxes on the ground: whichever of them stand on the
    // sand are what a roamer walks round. See `crowd/domain/sandGrid.ts`.
    obstacles: [...parts.plot.layout.placements, ...parts.plot.layout.props],
  });
  return buildCrowdField({
    crowd: createCrowd({
      network,
      count: CROWD_SIZE,
      variants: parts.people.length,
      seed: CROWD_SEED,
    }),
    models: parts.people,
    lightVolume: parts.lightVolume,
  });
}

/**
 * The sky this plot can fill, from the sand it has.
 *
 * One release site per beach tile, in the middle of it: a balloon is let go by
 * somebody standing on the sand, and the sand is the one part of the plot that
 * is described per tile without anything being built on it. The whole beach
 * rather than the water's edge, because the crowd is spread over all of it and
 * the balloons should be going up from where the people are.
 *
 * A plot with no shore hands back no sites at all, and `createBalloons` turns
 * that into a field with nothing in it. See `balloons/domain/balloons.ts`.
 */
function balloonsFor(parts: {
  readonly shore: Shore | null;
  readonly sky: readonly ModelGeometry[];
  /** The lamps a balloon's basket hangs in on its way up off the sand. */
  readonly lightVolume: BakedLightVolume | null;
}): BalloonField {
  const sites: ReleaseSite[] = beachTilesOf(parts.shore).map((tile) => ({
    x: (tile.x + 0.5) * TILE_VOXELS,
    z: (tile.z + 0.5) * TILE_VOXELS,
    y: SAND_LEVEL,
  }));
  return buildBalloonField({
    balloons: createBalloons({
      sites,
      count: BALLOON_COUNT,
      variants: parts.sky.length,
      seed: BALLOON_SEED,
    }),
    sites,
    models: parts.sky,
    lightVolume: parts.lightVolume,
  });
}

/**
 * The middle of the hire hut, in voxels, or null on a plot without one.
 *
 * The middle of its whole footprint rather than the corner it is anchored on,
 * because what the bay wants from it is the column its boats come in on — and a
 * 2x2 hut anchored at its north-west corner is four metres off that.
 *
 * A plot can genuinely have none: the generator stands exactly one and only on
 * sand, so an inland plan has none and a bay too small to hold one has none
 * either. The rest of the bay then reads as a bay with no hire trade — an
 * unbroken line of buoys and nothing but private boats. See `standPedaloRental`
 * in `resortGenerator.ts`.
 */
function rentalOn(placements: readonly Placement[]): Rental | null {
  const hut = placements.find((placement) => placement.id === PEDALO_RENTAL_ID);
  if (!hut) return null;
  return {
    x: (hut.tileX + hut.tilesX / 2) * TILE_VOXELS,
    z: (hut.tileZ + hut.tilesZ / 2) * TILE_VOXELS,
  };
}

/**
 * The water this plot's craft have, or a bay of nothing on a plot with no sea.
 *
 * An empty ground rather than a null one, so everything downstream is spared a
 * case for a resort that is inland: a flotilla built on it has no moorings and
 * no craft, so nothing is ever steered around it.
 */
function seaGroundOf(shore: Shore | null, rental: Rental | null): SailingGround {
  if (!shore) return { westX: 0, eastX: 0, seawardZ: 0, landwardZ: () => 0 };
  return sailingGroundFor(shore, rental);
}

/**
 * The berths each of the bay's models offers, in registry order.
 *
 * Module level, because it is a fact about the art rather than about a plot: the
 * seats are declared in `voxel-gen/sea/` and turned into offsets from a hull's
 * own middle once, not per resort. See `sea/domain/passengers.ts`.
 */
const SEA_BERTHS = SEA_MODELS.map(berthsOf);

/**
 * How far each of the bay's models reaches from its middle, in registry order:
 * half its longer side, since a hull turns. What the craft keep apart by.
 */
const SEA_RADII = SEA_MODELS.map((model) => Math.max(model.width, model.depth) / 2);

/**
 * The models that drift about on their own: every boat nobody hires out.
 *
 * The buoy is not a boat, and the pedalos belong to the hut — they are handed to
 * the flotilla separately, because what they do is different. See
 * `voxel-gen/sea/index.ts` for why these are indices rather than ids.
 */
const driftingVariants = (sea: readonly ModelGeometry[]): number[] =>
  sea
    .map((_, variant) => variant)
    .filter((variant) => variant !== BUOY_INDEX && variant !== PEDALO_INDEX);

/**
 * The bay this plot can float, from the coast it has.
 *
 * The buoys are strung along the tideline and the craft are turned loose on the
 * water outside them — see `sea/domain/swimArea.ts` for the line that separates
 * the two, which is the whole point of the buoys. The moorings are worked out
 * beforehand by {@link mooringsFor}, because the lamp bake needs them before
 * there is a sea to float anything on.
 *
 * A plot with no shore hands back no moorings and no ground, and the field then
 * draws nothing. See `sea/domain/flotilla.ts`.
 */
function seaFor(parts: {
  readonly shore: Shore | null;
  /** The paving as laid, which is where the piers the boats steer round are. */
  readonly paved: readonly Placement[];
  /** Everything standing on the plot, which is where the hire hut is found. */
  readonly placements: readonly Placement[];
  /** Where the buoys are moored; see {@link mooringsFor}. */
  readonly moorings: readonly Mooring[];
  readonly sea: readonly ModelGeometry[];
  /**
   * The crowd's own art, because the figures sitting in the boats are the same
   * people: a passenger is drawn from the people registry and holds no place in
   * the walk network. See `sea/domain/passengers.ts`.
   */
  readonly people: readonly ModelGeometry[];
  /** The lamps the water lies under, so a hull catches what the paving does. */
  readonly lightVolume: BakedLightVolume | null;
}): SeaField {
  const shore = parts.shore;
  const rental = rentalOf(shore, parts.placements);
  const ground = seaGroundOf(shore, rental);
  const flotilla = createFlotilla({
    moorings: parts.moorings,
    buoyVariant: BUOY_INDEX,
    craft: shore ? CRAFT_COUNT : 0,
    craftVariants: driftingVariants(parts.sea),
    // A bay with no hut on it hires nothing out; see `standPedaloRental`.
    hire: rental ? { count: HIRE_COUNT, variant: PEDALO_INDEX, rental } : null,
    ground,
    radii: SEA_RADII,
    // The sea lanes' jetties reach past the buoys into the craft's water; every
    // boat steers round them. See `sea/domain/piers.ts`.
    piers: pierBoxesFor(shore, parts.paved),
    waterline: SEA_LEVEL,
    seed: SEA_SEED,
  });
  const passengers = createPassengers({
    flotilla,
    berths: SEA_BERTHS,
    variants: parts.people.length,
    seed: CREW_SEED,
  });
  return buildSeaField({
    flotilla,
    ground,
    models: parts.sea,
    crew: { passengers, models: parts.people },
    lightVolume: parts.lightVolume,
  });
}

/**
 * The hire hut the bay lets boats out from, if it has both a hut and a bay.
 *
 * A hut standing on a plot with no sea hires nothing out: the authored plan is
 * land to its edges and stands one by the pool, and there is no water for its
 * boats to be on. See `RESORT_PLAN`.
 */
function rentalOf(shore: Shore | null, placements: readonly Placement[]): Rental | null {
  return shore ? rentalOn(placements) : null;
}

/**
 * Where the bay's buoys are moored.
 *
 * The plot's own paving is passed in so no buoy is moored in a pier: the sea
 * lanes run six tiles of jetty out from the sand, straight through the line.
 */
function mooringsFor(parts: {
  readonly shore: Shore | null;
  readonly paved: readonly Placement[];
  readonly placements: readonly Placement[];
}): Mooring[] {
  const paved = new Set(parts.paved.map((placement) => tileKey(placement.tileX, placement.tileZ)));
  return swimAreaMoorings({
    shore: parts.shore,
    rental: rentalOf(parts.shore, parts.placements),
    claimed: (tileX, tileZ) => paved.has(tileKey(tileX, tileZ)),
  });
}

/**
 * The lamps on the buoys' masts, baked at their moorings.
 *
 * A buoy does not leave its mooring, so its lamp is as static as a street
 * lamp's; see `sea/domain/buoyLamps.ts`. The model's own `lights` say whether it
 * has one, so a buoy drawn without a lamp bakes nothing.
 */
function buoyLampsAt(moorings: readonly Mooring[]): LightAnchor[] {
  const buoy = SEA_MODELS[BUOY_INDEX]!;
  return buoyLampSites(moorings, buoy, SEA_LEVEL).flatMap((site) => anchorsFor(site, buoy.lights));
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
  readonly people: readonly ModelGeometry[];
  readonly sky: readonly ModelGeometry[];
  readonly sea: readonly ModelGeometry[];
  readonly bench: BenchConfig | null;
}): Resort {
  const plot = layOut(parts.plan, parts.bench);
  const everything = everythingOn(plot);
  const claiming = claimingOn(plot);
  const shore = shoreFor(parts.plan);
  const moorings = mooringsFor({
    shore,
    paved: plot.layout.paths,
    placements: plot.layout.placements,
  });
  const lighting = createLighting({
    claiming,
    rails: plot.rails,
    buoys: buoyLampsAt(moorings),
    ground: groundOf(parts.plan),
  });
  const world = buildInstancedWorld(parts.geometries, everything, {
    lightVolume: lighting.volume,
  });
  const shadows = buildBlobShadowField(blobShadowsFor(claiming.map(casterOf)));
  const bounds = plotBounds(parts.plan, everything);
  const terrain = terrainFor(parts.plan);
  const crowd = crowdFor({
    plot,
    plan: parts.plan,
    shore,
    terrain,
    people: parts.people,
    lightVolume: lighting.volume,
  });
  const balloons = balloonsFor({ shore, sky: parts.sky, lightVolume: lighting.volume });
  const sea = seaFor({
    shore,
    paved: plot.layout.paths,
    placements: plot.layout.placements,
    moorings,
    sea: parts.sea,
    people: parts.people,
    lightVolume: lighting.volume,
  });

  return {
    plot,
    lighting,
    world,
    shadows,
    crowd,
    balloons,
    sea,
    shore,
    terrain,
    // Seeded from the resort as planned, then kept up to date one placement at a
    // time; it is what tells the pointer whether a tile is free. The sea is not
    // in it: a pier stands on water, so what the sea will take is a rule about
    // the object rather than a tile somebody already holds — see `paving.ts`.
    occupancy: createTileOccupancy(claiming),
    railIndex: createRailIndex(plot.rails),
    bounds,
    framing: frameCamera(bounds, parts.bench),
    dispose() {
      world.dispose();
      shadows.dispose();
      crowd.dispose();
      balloons.dispose();
      sea.dispose();
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
  readonly people: readonly ModelGeometry[];
  readonly sky: readonly ModelGeometry[];
  readonly sea: readonly ModelGeometry[];
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
      scene?.scene.remove(previous.crowd.group);
      scene?.scene.remove(previous.balloons.group);
      scene?.scene.remove(previous.sea.group);
      scene?.scene.add(resort.world.group);
      scene?.scene.add(resort.shadows.group);
      scene?.scene.add(resort.crowd.group);
      scene?.scene.add(resort.balloons.group);
      scene?.scene.add(resort.sea.group);
      scene?.reframe(
        resort.bounds,
        resort.framing,
        resort.lighting.volume,
        resort.shore,
        resort.terrain,
      );
      previous.dispose();
      return resort;
    },
  };
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
  for (const list of [plot.placements, plot.props, plot.paths, plot.rails]) {
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
  const { plot, world, shadows, crowd, balloons, sea, lighting } = parts.resort;
  const totals = plotTotals(plot);
  return {
    backend: handle.backend,
    typeCount: totals.types,
    objectCount: plot.placements.length,
    propCount: plot.props.length + plot.rails.length,
    pathCount: plot.paths.length,
    instanceCount: world.instanceCount,
    // What the renderer is actually handed, cast shadows and the crowd included:
    // a blob is one more draw and two more triangles, a person model is one more
    // draw and fifty per person, and a count that hid either would stop matching
    // what a bench reads back off the renderer.
    drawCalls:
      world.drawCalls + shadows.drawCalls + crowd.drawCalls + balloons.drawCalls + sea.drawCalls,
    chunkCount: world.chunkCount,
    uniqueTriangleCount: world.uniqueTriangleCount,
    unmergedTriangleCount: world.unmergedTriangleCount,
    drawnTriangleCount:
      world.drawnTriangleCount +
      shadows.triangleCount +
      crowd.triangleCount +
      balloons.triangleCount +
      sea.triangleCount,
    shadowCount: shadows.count,
    occluderCount: lighting.occluderCount,
    sceneVoxelCount: totals.voxels,
    meshedVoxelCount: scratch.writes.voxelIds.length,
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
  /** How freely the beach is letting balloons go; see `releaseStrength`. */
  readonly balloonReadiness: number;
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
    // The windows light from the same number, but not out of the same volume:
    // a lit room is a glow on its own glass rather than a lamp in the bake.
    resort().world.setLampFactor(sky.lampFactor);
    // A quad per shadow, rewritten only when the sun has actually moved.
    resort().shadows.applySky(sky);
    // The pools reflect the sky exactly as the sea does, and from the same
    // shader, so they have to be told about the sunset too.
    resort().world.setSky(sky.skyColor);
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
    get balloonReadiness() {
      return releaseStrength(time);
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
      if (typeof duration === 'number' && duration > 0) gpuFrames.push(duration);
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
  if (PAVING_IDS.has(id)) return plot.paths;
  if (RAIL_IDS.has(id)) return plot.rails;
  if (PROP_IDS.has(id)) return plot.props;
  return plot.placements;
}

/** The props the layout scatters itself, kept apart from the plan's own plots. */
const PROP_IDS: ReadonlySet<string> = new Set([LAMP_ID, HEDGE_ID]);

/**
 * The rails, which are a list of their own rather than props.
 *
 * Because a rail claims no ground: everything that asks what stands on a tile
 * leaves them out, and `claimingOn` is where that is done. A rail filed with the
 * lamps would be indexed, shadowed and baked as though it stood on the tile it
 * only leans against.
 */
const RAIL_IDS: ReadonlySet<string> = new Set([
  RAILING_ID,
  PIER_RAILING_ID,
  STAIR_RAILING_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
]);

/**
 * Holds the camera still for a benchmark run. Damping would otherwise keep
 * nudging it for the first second, and two builds would not be compared on the
 * same pixels.
 *
 * A pinned run stays in the perspective view: every `?view=` preset is a
 * perspective framing, and the numbers in `docs/rendering.md` were all measured
 * through that lens. Switching mid-run would change what is drawn and quietly
 * make two runs incomparable, which is exactly what this exists to prevent — so
 * the showcase refuses a mode change while a bench is on.
 */
function pinCamera(handle: SceneHandle): void {
  handle.controls.enabled = false;
  handle.controls.enableDamping = false;
}

/** Edit mode: what the pointer is holding, and how it reaches the scene. */
interface EditMode {
  /** Arms one tool, or null to put the pointer down. */
  select(tool: BuildTool | null): void;
  dispose(): void;
}

/**
 * Wires both pointers to the mutable scene.
 *
 * Two pointers and one cursor, because there is one left mouse button: arming
 * either disarms the other, which is what {@link BuildTool} makes structural
 * rather than a rule to remember. They share the ghost too — a brush shows the
 * footprint patch alone and an object shows the model standing in it, and a
 * second cursor object would be a second thing to keep looking like this one.
 *
 * The occupancy index is the piece worth naming: the layout checks its own plan
 * for overlaps once, up front, and throws when it finds one, which is right for
 * a plan and useless for a pointer that spends most of its time over an occupied
 * tile. This keeps the same answer live, one placement at a time, so a hover
 * costs a map lookup per tile of the footprint.
 */
function createEditMode(parts: {
  readonly canvas: HTMLCanvasElement;
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly geometries: readonly ModelGeometry[];
  readonly onChange: () => void;
  /**
   * Called when the shape of the ground has changed, so the terrain can be
   * redrawn: a spadeful moved, or something stood on a tile that was sloped.
   * The ground under anything that stands is drawn square — see
   * `rendering/domain/terrainSurface.ts` — so placing is as much a change to the
   * terrain as digging is.
   */
  readonly onGroundChange: () => void;
  readonly onCancel: () => void;
}): EditMode {
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

  // Forwarded to whichever resort is standing, for the same reason the occupancy
  // index is: the pointer outlives the plot it is aiming at — and the ground
  // itself moves under it, so even one plot's levels cannot be captured.
  const ground: PickGround = {
    levelOf: (tileX, tileZ) => resort().terrain.levelOf(tileX, tileZ),
    get maxLevel() {
      return resort().terrain.maxLevel;
    },
  };

  // What a tile of paving becomes once the ground has had its say: decking on
  // sand, and the flight up a terrace step where a path climbs one. The items
  // come from the catalogue rather than from a list here, so paving the plot
  // with something new is a model file and nothing else.
  const catalogue = OBJECT_TYPES.map(layoutItemFor);
  const pavingItems = catalogue.filter((item) => isPaving(item));
  const pavingItem = (id: string): LayoutItem | null =>
    pavingItems.find((item) => item.id === id) ?? null;
  const pavedWith = pavedGroundOf(occupancy, pavingItems);
  const paving: PavingRules = {
    pavedWith,
    levelOf: ground.levelOf,
    // Forwarded to whichever resort is standing, exactly as the levels are: the
    // coast moves when the plot is regenerated and the pointer does not. Sand is
    // asked of the ground rather than of the shore, so a path drawn by hand
    // along the dune comes out as decking exactly as a generated one does.
    isSand: (tileX, tileZ) => resort().terrain.surfaceOf(tileX, tileZ) === 'sand',
    isWater: (tileX, tileZ) => resort().terrain.surfaceOf(tileX, tileZ) === 'water',
    // The base rather than the tile as it stands, which is the one question the
    // two bodies of water differ on: a river gets a bridge and the bay gets a
    // pier. See `terrain.ts` and `paving.ts`.
    isSea: (tileX, tileZ) => resort().terrain.isSea(tileX, tileZ),
    decking: pavingItem(BOARDWALK_ID),
    pier: pavingItem(JETTY_ID),
    bridge: pavingItem(BRIDGE_ID),
    bridgeRamp: pavingItem(BRIDGE_RAMP_ID),
    stairs: pavingItem(STAIRS_ID),
  };

  // The same paving and the same levels the flights are decided from, so a rail
  // drawn by hand lands where a generated one would. What is standing is asked of
  // the resort's rail index rather than filtered out of the plot's list: a rail
  // claims no tile, so it is not in the occupancy index, and every edit asks
  // about five tiles — which on a drag is five scans of the plot per pointer move.
  const handrails: HandrailRules = {
    pavedWith,
    levelOf: ground.levelOf,
    isWater: paving.isWater,
    isSpan: raisedProvider(paving),
    models: railModelsIn(catalogue),
    standing: (tileX, tileZ) => resort().railIndex.at(tileX, tileZ),
  };

  /**
   * Which pointer is holding the left mouse button, so handing it back is never
   * the losing tool's last word.
   *
   * Two pointers ask for the same button, and `takeLeftButton` is a state rather
   * than a count: arming the spade while an object is armed would otherwise be an
   * arm and a disarm in whichever order `select` happened to run them, and one of
   * those orders gives the button back to the camera with a tool still in hand.
   * Naming the holder takes the ordering out of it entirely.
   */
  let holder: 'object' | 'terrain' | null = null;
  const lendLeftButton =
    (who: 'object' | 'terrain') =>
    (taken: boolean): void => {
      if (taken) holder = who;
      else if (holder === who) holder = null;
      handle.takeLeftButton(holder !== null);
    };

  /**
   * Stands and takes down handrails, for whichever tool asked.
   *
   * Nothing but the world, the lamps and the rail index, which keeps the plot's
   * own list: a rail stands on the paving it guards, so it is not in the
   * occupancy index, throws no blob shadow of its own and takes no sky away — see
   * `claimingOn`. Shared because both tools change the same answer: paving a tile
   * rails the ground around it, and raising that ground rails the paving.
   */
  const changeRails = (stand: readonly Placement[], lift: readonly Placement[]): void => {
    const { world, lighting, railIndex } = resort();
    for (const rail of lift) {
      world.remove(rail.key);
      lighting.unlight(rail);
      railIndex.remove(rail);
    }
    // Taken down first, so a tile whose edge rails become a balustrade never has
    // both standing at once — and so a lantern re-stood under the same key is
    // put out before it is lit again.
    for (const rail of stand) {
      world.add(rail);
      lighting.light(rail);
      railIndex.add(rail);
    }
    onChange();
  };

  /**
   * Whether standing this changes the ground the terrain draws.
   *
   * The ground under what stands on it is drawn square rather than sloped, so a
   * placement on the edge of a terrace changes the terrain as surely as a
   * spadeful does — but only there. A path dragged across a flat bench changes
   * no ground at all, and rebuilding the terrain once per tile of it is what a
   * drag cannot afford. See `terrain.ts`, `overlooksDrop`.
   */
  /**
   * Takes one placement back off the plot.
   *
   * A flight of stairs replaces the slab a path had already laid on the tile, so
   * that one comes up first — off the index, out of the world and out of the
   * plot's own list — or the tile would be double-booked and the slab would go
   * on being drawn inside the flight. See `paving.ts`.
   */
  const lift = (placement: Placement): void => {
    const { plot, world, lighting, shadows } = resort();
    occupancy.release(placement, placement.key);
    world.remove(placement.key);
    lighting.unlight(placement);
    // The shadow goes with the lamps, and for the same reason: a re-laid tile is
    // lifted and stood again, so a bridge drawn across a river would stack one
    // quad per pass and darken with each. Harmless when it cast none; `remove`
    // says so.
    shadows.remove(placement.key);
    const laid = listFor(plot, placement.id);
    const at = laid.findIndex((standing) => standing.key === placement.key);
    if (at !== -1) laid.splice(at, 1);
  };

  const reshapesGround = (placement: Placement): boolean =>
    footprintTiles(placement).some((tile) => overlooksDrop(resort().terrain, tile.x, tile.z));

  const pointer = createBuildPointer({
    canvas,
    // Read per pick rather than captured: switching to the isometric view puts a
    // different camera on screen, and the pointer must aim through that one.
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('object'),
    ghost,
    occupancy,
    ground,
    paving,
    handrails,
    onPlace(placement, lifted) {
      const { plot, world, lighting, shadows } = resort();
      if (lifted) lift(lifted);
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
      if (reshapesGround(placement)) parts.onGroundChange();
      onChange();
    },
    onRails: changeRails,
    onCancel,
  });

  // The ground itself, forwarded to whichever resort is standing exactly as
  // everything else here is. What is standing on a tile is asked of the occupancy
  // index, which is the only thing that knows: a tile with a rail on it is a tile
  // with paving on it, so one question covers everything. See `terrainBrush.ts`.
  const terrainRules: TerrainRules = {
    get terrain() {
      return resort().terrain;
    },
    isClear: (tileX, tileZ) => occupancy.keyAt({ x: tileX, z: tileZ }) === undefined,
  };

  const spade = createTerrainPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('terrain'),
    ghost,
    ground,
    rules: terrainRules,
    handrails,
    onRails: changeRails,
    onDig(tile, next) {
      resort().terrain.set(tile.x, tile.z, next);
      // Two callbacks rather than one, because they cost different things: the
      // HUD's counts have not changed and the terrain meshes have to be rebuilt.
      parts.onGroundChange();
    },
    onCancel,
  });

  return {
    select(tool) {
      // Both are told, every time, and the order does not matter: see
      // `lendLeftButton` for why it cannot.
      const id = armedObject(tool);
      pointer.select(id === null ? null : layoutItemFor(objectTypeById(id)));
      spade.select(armedBrush(tool));
    },
    dispose() {
      pointer.dispose();
      spade.dispose();
      handle.scene.remove(ghost.group);
      ghost.dispose();
    },
  };
}

/**
 * Frees the meshed catalogue.
 *
 * The models are meshed once and shared by every resort, the crowd, the sky and
 * the bay, so no one of those may free them — see `instancedWorld.ts`. This runs
 * when the showcase itself goes away, which is the only moment nothing is
 * holding them.
 */
function disposeCatalogue(catalogue: MeshedCatalogue): void {
  const all = [catalogue.geometries, catalogue.people, catalogue.sky, catalogue.sea];
  for (const models of all) {
    for (const model of models) {
      model.lit?.dispose();
      model.emissive?.dispose();
      model.water?.dispose();
      model.window?.dispose();
    }
  }
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame, onSceneChange } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  // `?bench=1` pins the camera and the clock so two builds are compared on the
  // same pixels. Absent the flag this is null and nothing that reads it runs.
  const bench = parseBenchConfig(globalThis.location?.search ?? '');

  const scratch = scratchForModels();
  const catalogue = await meshModels(scratch, bench);

  let params = startingParams(bench);
  const slot = createResortSlot({
    plan: startingPlan(bench, params),
    geometries: catalogue.geometries,
    people: catalogue.people,
    sky: catalogue.sky,
    sea: catalogue.sea,
    bench,
  });
  const current = slot.current;

  const handle = await createScene({
    canvas,
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
    bounds: current().bounds,
    framing: current().framing,
    lightVolume: current().lighting.volume,
    shore: current().shore,
    terrain: current().terrain,
    // Forwarded to whichever resort is standing, exactly as the terrain is: the
    // ground under a cottage is drawn square rather than sloped, so the mesher
    // has to ask the live occupancy index and not a snapshot of it.
    isClear: (tileX, tileZ) => current().occupancy.keyAt({ x: tileX, z: tileZ }) === undefined,
    // Wall-clock frame times stop discriminating as soon as a frame fits inside
    // the refresh interval: everything faster reads as exactly 120 fps. The
    // GPU's own timers keep measuring past that point.
    trackTimestamp: bench !== null,
    forceWebGL: bench?.forceWebGL ?? false,
  });
  handle.scene.add(current().world.group);
  handle.scene.add(current().shadows.group);
  handle.scene.add(current().crowd.group);
  handle.scene.add(current().balloons.group);
  handle.scene.add(current().sea.group);
  slot.attach(handle);

  let fpsState = createFpsState();
  let running = true;
  let lastTimeMs: number | null = null;
  const clock = createClock(handle, current, bench ? bench.time : INITIAL_TIME);

  if (bench) pinCamera(handle);

  const cameraView = (): CameraView => ({
    mode: handle.cameraMode,
    direction: handle.isoDirection,
  });

  const setCameraMode = (mode: CameraMode): void => {
    // A bench run is measured through one lens; see `pinCamera`.
    if (bench) return;
    handle.setCameraMode(mode);
  };

  const setIsoDirection = (direction: CompassDirection): void => {
    handle.setIsoDirection(direction);
  };

  const cameraKeys = createCameraKeys({
    mode: () => handle.cameraMode,
    onModeChange: (mode) => {
      setCameraMode(mode);
      options.onCameraChange?.(cameraView());
    },
    onTurn: (quarters) => {
      setIsoDirection(turnDirection(handle.isoDirection, quarters));
      options.onCameraChange?.(cameraView());
    },
  });

  const resize = (): void => {
    handle.resize(
      canvas.clientWidth || globalThis.innerWidth,
      canvas.clientHeight || globalThis.innerHeight,
    );
  };
  globalThis.addEventListener('resize', resize);

  const statsNow = createStatsReader({
    handle,
    resort: current,
    scratch,
    catalogue,
    startup,
    mountStarted,
  });

  /**
   * Whether the ground has moved since the terrain was last drawn.
   *
   * A flag rather than a rebuild per spadeful: a drag digs a tile per pointer
   * move, and the surfaces are one mesh over the whole box — so the rebuild is
   * coalesced to at most one per frame, which is what the render loop below does
   * with this. The alternative was rebuilding a few hundred quads five times
   * between two frames and drawing four of them to nobody.
   */
  let ground = false;

  /**
   * Whether anything the HUD counts has changed since it was last told.
   *
   * The same bargain `ground` strikes, for the same reason: a placement is a
   * scan over every placement on the plot and a React render, and a drag places
   * a tile per pointer move. The HUD cannot show more than one number a frame,
   * so it is told once a frame.
   */
  let counted = false;

  const build = createEditMode({
    canvas,
    handle,
    resort: current,
    geometries: catalogue.geometries,
    onChange: () => {
      counted = true;
    },
    onGroundChange: () => {
      ground = true;
    },
    onCancel: () => {
      build.select(null);
      options.onToolChange?.(null);
    },
  });

  /** Tells everything above the renderer that the resort underneath it changed. */
  const rebuilt = (): void => {
    clock.relight();
    onSceneChange?.(statsNow());
  };

  const recorder = bench
    ? createBenchRecorder({ bench, handle, stats: statsNow, litLamps: () => clock.litLamps })
    : null;
  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;

    // Before anything else this frame: the ground the crowd walks and the
    // surfaces the camera sees have to agree, and a stroke may have moved a
    // dozen tiles since the last frame was drawn.
    if (ground) {
      handle.retile();
      ground = false;
    }
    if (counted) {
      onSceneChange?.(statsNow());
      counted = false;
    }

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    clock.advance(elapsed);
    // A benchmark walks the crowd by a fixed step rather than by the frame's
    // own: two runs are only comparable if the scene is in the same place on
    // the same frame of each, and the frame's `dt` is exactly what differs
    // between a fast machine and a slow one. See `crowd.ts`.
    current().crowd.advance(bench ? MAX_STEP : elapsed);
    // Off the same fixed step as the crowd under a benchmark, and for the same
    // reason: two runs only compare if the scene is in the same place on the
    // same frame of each. See `crowd.ts`.
    current().balloons.advance(bench ? MAX_STEP : elapsed, clock.balloonReadiness);
    // Likewise the bay, and for the third time the same reason: a run only
    // compares with the one before it if the boats are where they were.
    current().sea.advance(bench ? MAX_STEP : elapsed);
    if (!bench) handle.controls.update();
    handle.renderer.render(handle.scene, handle.camera);

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    onFrame({ fps: fpsState.fps, time: clock.time, activeLights: clock.litLamps });

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
    get params() {
      return params;
    },
    get cameraView() {
      return cameraView();
    },
    setCameraMode,
    setIsoDirection,
    turnCamera: (quarters) => setIsoDirection(turnDirection(handle.isoDirection, quarters)),
    generate(next) {
      params = clampParams(next);
      slot.replace(generateResort(GENERATOR_TYPES, params));
      rebuilt();
    },
    clear(next) {
      params = clampParams(next);
      // The seed goes along, so clearing is a random landscape rather than the
      // same one every time: a coast, a hill and a river off it. See
      // `emptyResortPlan`.
      slot.replace(emptyResortPlan(params.tilesX, params.tilesZ, params.seed));
      rebuilt();
    },
    selectTool: (tool) => build.select(tool),
    setTime: clock.setTime,
    setCycling: clock.setCycling,
    dispose() {
      running = false;
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener('resize', resize);
      cameraKeys.dispose();
      build.dispose();
      current().dispose();
      handle.dispose();
      // Last: everything above is built over these, so nothing may still be
      // holding them when they go.
      disposeCatalogue(catalogue);
    },
  };
}
