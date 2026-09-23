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
  bedsOf,
  materialColorsById,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeTop,
  PAINTED_MODELS,
  PEOPLE_MODELS,
  SEA_MODELS,
  SKY_MODELS,
  STAFF_MODELS,
  TILE_VOXELS,
} from '../features/catalog/domain/objectTypes';
import {
  blobOf,
  casterOf,
  lightsOf,
  occluderOf,
  seatSiteOf,
} from '../features/catalog/domain/placementFacts';
import type { LayoutItem, Placement } from '../features/layout/domain/resortLayout';
import { railModelsIn } from '../features/layout/domain/resortLayout';
import { listOf } from '../features/layout/domain/placementLists';
import type { ResortPlan } from '../features/layout/domain/resortPlan';
import {
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
  JETTY_ID,
  PATH_ID,
  STAIRS_ID,
} from '../features/layout/domain/resortPlan';
import type { Shore } from '../features/layout/domain/shoreline';
import { beachTilesOf, shoreFor } from '../features/layout/domain/shoreline';
import type { Terrain } from '../features/layout/domain/terrain';
import { overlooksDrop, terrainFor } from '../features/layout/domain/terrain';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { clampParams } from '../features/layout/domain/resortGenerator';
import { layoutItemFor } from '../features/build/domain/buildPlan';
import {
  claimingOn,
  everythingOn,
  rentalOf,
  type Plot,
  type PrepRequest,
  type PreparedResort,
  type ResortSource,
} from '../features/resort-prep/domain/prepareResort';
import { createResortPreparer } from '../features/resort-prep/adapters/resortPreparer';
import {
  isPaving,
  pavedGroundOf,
  raisedProvider,
  type PavingRules,
} from '../features/build/domain/paving';
import { type HandrailRules } from '../features/build/domain/handrails';
import type { TerrainRules } from '../features/build/domain/terrainBrush';
import {
  armedBrush,
  armedObject,
  armedRemove,
  type BuildTool,
} from '../features/build/domain/buildTool';
import { createTerrainPointer } from '../features/build/adapters/terrainPointer';
import { createDemolishPointer } from '../features/build/adapters/demolishPointer';
import type { TileOccupancy } from '../features/build/domain/tileOccupancy';
import { createTileOccupancy, footprintTiles } from '../features/build/domain/tileOccupancy';
import type { RailIndex } from '../features/build/domain/railIndex';
import { createRailIndex } from '../features/build/domain/railIndex';
import { createBuildPointer } from '../features/build/adapters/buildPointer';
import type { PickGround } from '../features/build/domain/groundPick';
import { createPlacementGhost } from '../features/build/adapters/placementGhost';
import { levelHeight } from '../features/layout/domain/elevation';
import type { WorldBounds } from '../features/layout/domain/worldBounds';
import { overcastSky, skyStateFor } from '../features/lighting/domain/dayNight';
import {
  advanceClock,
  clockLabel,
  createSimClock,
  dayOf,
  TICKS_PER_DAY,
  timeOf,
  withSpeed,
  withTime,
  type SimClock,
  type SimSpeed,
} from '../features/sim/domain/simClock';
import { createNeeds, decayNeeds, strongestNeed, type Needs } from '../features/sim/domain/needs';
import {
  ageHappiness,
  createHappiness,
  meanHappiness,
  type Happiness,
} from '../features/sim/domain/happiness';
import { ratingFor, type Rating } from '../features/sim/domain/rating';
import { carryUpkeep, cleanliness, createUpkeep, type Upkeep } from '../features/sim/domain/upkeep';
import { staffFor, STAFF_ROLES, type Staff } from '../features/sim/domain/staff';
import {
  createStaffRouter,
  meanCleanliness,
  type StaffRouter,
} from '../features/sim/domain/staffRouter';
import { checkInDue, runCheckIn } from '../features/sim/domain/checkIn';
import { gatewaysOn, type Gateway } from '../features/sim/domain/gateways';
import { createRandom } from '../features/layout/domain/random';
import { shelterOf, venuesOn, type Venue } from '../features/sim/domain/venues';
import { lodgingsOn, type Lodging } from '../features/sim/domain/lodgings';
import { occupiedShare } from '../features/sim/domain/night';
import { createRouter, type Router } from '../features/sim/domain/router';
import { isOpenIn, weatherEffect, weatherOn, type Weather } from '../features/sim/domain/weather';
import { flashAt, flashSky } from '../features/weather/domain/lightning';
import {
  createRaindrops,
  isWet,
  MAX_DROPS,
  rainfallFor,
} from '../features/weather/domain/rainfall';
import { buildRainField, type RainField } from '../features/weather/adapters/rainField';
import type { RainView } from '../features/weather/domain/rainfall';
import { pixelsPerVoxel } from '../features/rendering/domain/levelOfDetail';
import {
  adviceFor,
  unreachableOn,
  type Advice,
  type ResortFacts,
} from '../features/sim/domain/advice';
import { doorsFor } from '../features/sim/domain/doors';
import { nodeIndexFor } from '../features/crowd/domain/nearestNode';
import { crowdScaleFor } from '../features/sim/domain/crowdRate';
import { anchorsFor } from '../features/lighting/domain/lightAnchors';
import type { LightGridSpec } from '../features/lighting/domain/lightGrid';
import { cellCount, gridByteSize } from '../features/lighting/domain/lightGrid';
import type { LiveLightGrid } from '../features/lighting/domain/liveLightGrid';
import { createLiveLightGrid } from '../features/lighting/domain/liveLightGrid';
import type { LiveSkyVisibility } from '../features/lighting/domain/skyVisibility';
import { createLiveSkyVisibility } from '../features/lighting/domain/skyVisibility';
import type { BakedLightVolume } from '../features/lighting/adapters/bakedLightVolume';
import { createBakedLightVolume } from '../features/lighting/adapters/bakedLightVolume';
import type { ScratchLayout } from '../features/voxel-world/domain/modelScratch';
import { scratchLayoutFor } from '../features/voxel-world/domain/modelScratch';
import { coarseScratchModelOf } from '../features/voxel-world/domain/coarseVoxels';
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from '../features/voxel-world/adapters/dveEngine';
import { meshCatalogue } from '../features/voxel-world/adapters/meshCatalogue';
import type { InstancedWorld } from '../features/rendering/adapters/instancedWorld';
import { buildInstancedWorld } from '../features/rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../features/rendering/adapters/voxelMeshBuilder';
import { buildModelGeometries } from '../features/rendering/adapters/voxelMeshBuilder';
import { blobShadowsFor } from '../features/rendering/domain/blobShadows';
import { SAND_LEVEL, SEA_LEVEL } from '../features/rendering/domain/terrainSurface';
import type { BlobShadowField } from '../features/rendering/adapters/blobShadowField';
import { buildBlobShadowField } from '../features/rendering/adapters/blobShadowField';
import {
  buildConstructionField,
  type ConstructionField,
} from '../features/construction/adapters/constructionField';
import {
  advanceSites,
  buildSeconds,
  openSite,
  progressOf,
  revealHeightOf,
  type ConstructionSite,
} from '../features/construction/domain/construction';
import { createCrowd, MAX_STEP, takeOffPlot } from '../features/crowd/domain/crowd';
import { crowdOverrideFrom, crowdSizeFor } from '../features/crowd/domain/crowdSize';
import { walkNetworkFor, type WalkNetwork } from '../features/crowd/domain/walkNetwork';
import { seatSpotsFor } from '../features/crowd/domain/seating';
import {
  bedCount,
  checkOutParty,
  createGuests,
  presentCount,
  type Guests,
} from '../features/guests/domain/guests';
import { NO_HOME, type Home } from '../features/guests/domain/homes';
import type { CrowdField } from '../features/crowd/adapters/crowdField';
import { buildCrowdField } from '../features/crowd/adapters/crowdField';
import { createInspectPointer } from '../features/inspect/adapters/inspectPointer';
import {
  activityLine,
  errandOf,
  guestView,
  namesPlacement,
  personOf,
  placeView,
  type Errand,
  type InspectTarget,
  type SelectionView,
} from '../features/inspect/domain/selection';
import type { GuestNeed } from '../../voxel-gen/voxelgen.ts';
import { hipHeight } from '../../voxel-gen/people/figure.ts';
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
import type { Mooring, Rental, SailingGround } from '../features/sea/domain/swimArea';
import { sailingGroundFor } from '../features/sea/domain/swimArea';
import { BUOY_INDEX, PEDALO_INDEX } from '../../voxel-gen/sea/index.ts';
import type {
  CameraFraming,
  CameraMode,
  CompassDirection,
} from '../features/layout/domain/worldBounds';
import { turnDirection } from '../features/layout/domain/worldBounds';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { createScene } from '../features/rendering/adapters/threeScene';
import { createCameraKeys } from '../features/rendering/adapters/cameraKeys';
import { createFpsState, sampleFrame } from '../features/hud/domain/fps';
import { createFrameCostState, sampleFrameCost } from '../features/hud/domain/frameCost';
import type { FrameUpdate } from '../features/hud/adapters/hudOverlay';
import { parseBenchConfig, type BenchConfig } from '../features/bench/domain/benchConfig';
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
 * People walking the resort, when the URL asks for a number: `?people=n`.
 *
 * Read once, at load, because it is a question about the page and not about
 * any one resort; without it the crowd follows the paving. See `crowdSize.ts`.
 */
const CROWD_OVERRIDE = crowdOverrideFrom(globalThis.location?.search ?? '');

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
 * reason {@link CRAFT_COUNT} is one: nothing offers it yet.
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
 * marina. A constant because nothing offers it yet. See `features/sea/`.
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

/**
 * The seed the guests are named and housed from.
 *
 * Its own rather than the crowd's, for {@link CREW_SEED}'s reason: adding a
 * bungalow changes how many beds the plot has, and a shared generator would
 * make that rename everybody.
 */
const GUEST_SEED = 5;

/**
 * The seed every guest's needs start from.
 *
 * Its own, for {@link GUEST_SEED}'s reason: retuning how hungry people arrive
 * must not rename anybody.
 */
const NEEDS_SEED = 6;

/**
 * The seed every visit's length is drawn from.
 *
 * Its own, for {@link GUEST_SEED}'s reason, and seeded at all because
 * `docs/rendering.md` requires a bench run to replay the same scene: a dwell off
 * `Math.random` puts two runs' crowds in different places on the same frame, and
 * the difference reads as noise in the frame times rather than as a bug.
 */
const DWELL_SEED = 7;

/**
 * The seed every morning's arrivals are drawn from: who checks in, how long they
 * are staying and what they are called.
 *
 * Its own, for {@link DWELL_SEED}'s reason, and seeded at all for the same one:
 * `docs/rendering.md` requires a bench run to replay the same scene, and a
 * benchmark's clock is paused so no coach ever comes in - which only stays true
 * of a draw that is deterministic either way.
 */
const ARRIVALS_SEED = 8;

/**
 * The seed every cleaner's spell of work is drawn from.
 *
 * Its own, for {@link DWELL_SEED}'s reason, and seeded at all for the same one:
 * `docs/rendering.md` requires a bench run to replay the same scene, and a
 * second population walking off an unseeded draw puts two runs' staff in
 * different places on the same frame.
 */
const STAFF_SEED = 9;

/**
 * The seed the week's weather is drawn from.
 *
 * Its own, for {@link DWELL_SEED}'s reason: retuning how often it rains must not
 * move anybody's bedtime or the crowd's replay. It is half of the whole of the
 * weather's state - the other half is the day number - and it is fixed, so two
 * runs of the same plot get the same week. See `sim/domain/weather.ts`.
 *
 * **13 rather than the next number along, and chosen for its first week**: the
 * hash is what it is, and at 10 day 0 came out `rain`, so every new resort - and
 * every benchmark run, which opens at {@link INITIAL_TIME} on day 0 - opened on
 * a grey sky with the beach shut. 13 opens clear, clear, clear, then rain and a
 * storm on the fourth and fifth days, which is a settled resort first and
 * weather inside the first week. Over 400 days it draws 70% clear, which is the
 * table's own shape.
 */
const WEATHER_SEED = 13;

/**
 * The seed the rain is scattered with; fixed, for {@link CROWD_SEED}'s reason.
 *
 * How *many* drops there are is not here: it is `MAX_DROPS`, which
 * `weather/domain/rainfall.ts` takes from the wettest row of its own table,
 * because the count and the streak it draws are one tuning decision and belong
 * side by side. `pnpm bench -- --weather storm` prices the lot; the table is in
 * `docs/rendering.md`.
 */
const RAIN_SEED = 4;

/**
 * How far above a person's feet a click is tested against, in voxels: the hips
 * of the tallest figure, which is about half way up a body. The number the art
 * already names, rather than a second guess at it; see `pickPerson.ts`.
 */
const AIM_HEIGHT = hipHeight(Math.max(...PEOPLE_MODELS.map((model) => model.height)));

/** Where day 0 opens: late afternoon, so the scene reads in daylight. */
const INITIAL_TIME = 0.62;

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
  /** Beds on the plot, and guests who have one. */
  readonly beds: { readonly total: number; readonly taken: number };
  /**
   * Guests in bed right now. Against `beds.total` it is how many rooms are lit
   * after dark; against `beds.taken`, how much of the resort got home. See
   * `sim/domain/night.ts`.
   */
  readonly asleep: number;
  /**
   * Guests inside a venue right now, and guests standing in a line at one.
   * A waiting count that climbs and stays there is the resort saying it needs
   * another of something. See `sim/domain/occupancy.ts`.
   */
  readonly venues: { readonly inside: number; readonly waiting: number };
  /**
   * Flow fields the router has actually built: one per venue somebody has
   * walked to, and none for the ones nobody has. The first number anybody
   * debugging routing wants, and what says the lazy build is staying lazy. See
   * `sim/domain/router.ts`.
   */
  readonly routeFields: number;
  /**
   * Guests on the plot now, of the bodies it was built for.
   *
   * The two numbers differ because a person index is a body and the person
   * inside it changes: check-out empties one and check-in deals somebody new
   * into it. A present count that sits well below the capacity is a resort
   * nobody is coming back to. See `sim/domain/checkIn.ts`.
   */
  readonly guests: { readonly present: number; readonly capacity: number };
  /**
   * The staff on the plot, and how many of them are cleaning something right
   * now rather than walking to the next thing.
   *
   * A second population, counted apart from the guests on purpose: they are not
   * checked in, they have no beds and they never leave, so folding them into
   * {@link guests} would make every other number about the resort a lie. See
   * `sim/domain/staff.ts`.
   */
  readonly staff: { readonly total: number; readonly working: number };
  /** The mean cleanliness of the venues standing, 0..1; see `sim/domain/upkeep.ts`. */
  readonly cleanliness: number;
  /** What the resort is worth out of five; see `sim/domain/rating.ts`. */
  readonly rating: number;
  /** What kind of day it is; see `sim/domain/weather.ts`. */
  readonly weather: Weather;
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
  readonly drawingBufferSize: {
    readonly width: number;
    readonly height: number;
  };
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
  /**
   * What was clicked on, or null when the selection was cleared. Not called per
   * frame: the panel's live line goes through `onFrame` instead.
   */
  readonly onSelectionChange?: (selection: SelectionView | null) => void;
  /**
   * Called with what the resort is getting wrong, ranked: once a simulated day
   * at the check-in hour, and again whenever an edit has settled and the walk
   * graph has been rebuilt under it. **Never per frame** - see {@link factsNow},
   * which walks the guest list.
   */
  readonly onAdviceChange?: (advice: readonly Advice[]) => void;
  /**
   * Called when the kind of day changes: at midnight as the week turns over,
   * and at once when somebody pins it from the HUD. **Never per frame** - the
   * loop compares and calls only on a change, which is at most once a simulated
   * day.
   */
  readonly onWeatherChange?: (weather: Weather) => void;
}

/** Which camera the resort is being drawn through, and which way it faces. */
export interface CameraView {
  readonly mode: CameraMode;
  /** The compass point the isometric camera stands over; unused in perspective. */
  readonly direction: CompassDirection;
  /** Whether far and small things are drawn coarse or not at all; see `levelOfDetail.ts`. */
  readonly detail: boolean;
}

export interface Showcase {
  readonly stats: ShowcaseStats;
  /**
   * What the plot is getting wrong, ranked, as it stands right now.
   *
   * Read once when the HUD mounts, so the panel says something before the first
   * check-in hour comes round; after that it arrives through
   * {@link ShowcaseOptions.onAdviceChange}.
   */
  readonly advice: readonly Advice[];
  /** Populated once a `?bench=1` run has collected its frames. */
  readonly benchResult: BenchResult | null;
  /** The parameters the resort on screen was grown from. */
  readonly params: ResortParams;
  /** Which camera is on screen, and which way the isometric one faces. */
  readonly cameraView: CameraView;
  setCameraMode(mode: CameraMode): void;
  setIsoDirection(direction: CompassDirection): void;
  /** Turns the level of detail on or off, to see what it costs and what it saves. */
  setDetail(enabled: boolean): void;
  /** Turns the isometric view a quarter; negative turns anticlockwise. */
  turnCamera(quarters: number): void;
  /**
   * Pans the camera to the middle of a tile, standing it on the ground there.
   *
   * A tile rather than a world point, because what asks is the advice panel and
   * a piece of advice names a building by where it stands. Refused under a
   * benchmark, for {@link setCameraMode}'s reason: a run is measured through one
   * pinned view.
   */
  lookAtTile(tile: { readonly tileX: number; readonly tileZ: number }): void;
  /**
   * Grows a new resort from these parameters and puts it on screen once it is
   * ready; the one on screen keeps drawing until then. A later call wins.
   */
  generate(params: ResortParams): Promise<void>;
  /** Clears the plot to bare ground of this size, to build on by hand; as {@link generate}. */
  clear(params: ResortParams): Promise<void>;
  /**
   * Arms the pointer with an object to stand or a brush to work the ground with,
   * or null to put it down. One tool at a time; see `buildTool.ts`.
   */
  selectTool(tool: BuildTool | null): void;
  /** Jumps the clock to a moment of the current day; the resort keeps running. */
  setTime(time: number): void;
  /** How fast the resort runs, pause included; see `sim/domain/simClock.ts`. */
  setSpeed(speed: SimSpeed): void;
  /**
   * Pins the weather to one kind of day so it can be looked at, or hands it
   * back to the week's own draw with null.
   *
   * A storm is four days out of twenty-four and it lasts a whole simulated day,
   * so waiting for one to come round is not a way to see whether the rain draws
   * right. Nothing about it is saved; see {@link Clock.setWeather}.
   */
  setWeather(weather: Weather | null): void;
  /** Inspects a guest, as a click on them would; the party list uses it. */
  selectPerson(person: number): void;
  /** Closes the inspector, as a click on empty ground would. */
  clearSelection(): void;
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

/** Objects, scattered props, path tiles and rails: everything the scene draws. */
/**
 * One scratch region per model, so the mesher runs over each model exactly once.
 *
 * Over {@link PAINTED_MODELS}, which is the catalogue *and* the crowd: a person
 * is meshed exactly the way a cottage is, and four figures of 3 x 7 x 2 are
 * nothing against the extent the check below guards.
 */
function scratchForModels(): ScratchLayout {
  const scratch = scratchLayoutFor(
    // Every catalogue model's coarse copy is meshed in the same pass, after the
    // rest; the people, the sky and the bay get none. See `coarseVoxels.ts`.
    [...PAINTED_MODELS, ...OBJECT_TYPES.map((type) => coarseScratchModelOf(type.model))],
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
   * The staff's, kept apart from the crowd's as well as from the catalogue: they
   * are a second crowd field of their own, drawn from a registry of their own.
   * See `sim/domain/staff.ts`.
   */
  readonly staff: readonly ModelGeometry[];
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

/**
 * Which person model is the child, by id rather than by index: the people
 * registry's order is the art's to change. See `voxel-gen/people/index.ts`.
 */
const CHILD_VARIANT = PEOPLE_MODELS.findIndex((model) => model.id === 'child');
if (CHILD_VARIANT < 0) {
  // Loudly, because the quiet alternative draws every child as an adult.
  throw new Error('No person model has the id "child"; the guests have no child to draw.');
}

/**
 * Ids the staff are drawn from, likewise, and kept apart from the crowd's for
 * the reason `voxel-gen/people/index.ts` gives: a guest's `variant` indexes into
 * `PEOPLE_MODELS`, so a staff model in that list would be dealt to a guest.
 */
const STAFF_IDS: ReadonlySet<string> = new Set(STAFF_MODELS.map((model) => model.id));

// The staff crowd's `variant` is a role's place in `STAFF_ROLES`, and it indexes
// the meshed staff list - which is `STAFF_SOURCES`'s order. Loudly, because the
// quiet alternative draws a lifeguard as a cleaner the day one lands.
if (STAFF_MODELS.length < STAFF_ROLES.length) {
  throw new Error('Fewer staff models than staff roles; somebody would be drawn as nobody.');
}

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
      (model) =>
        !PEOPLE_IDS.has(model.id) &&
        !STAFF_IDS.has(model.id) &&
        !SKY_IDS.has(model.id) &&
        !SEA_IDS.has(model.id),
    ),
    // In registry order, because a person's `variant` indexes into it.
    people: geometries.filter((model) => PEOPLE_IDS.has(model.id)),
    // Likewise a worker's; see `STAFF_ROLES`.
    staff: geometries.filter((model) => STAFF_IDS.has(model.id)),
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
/** Plot the generator starts from: the size of the resort that was authored. */
const STARTING_PARAMS: ResortParams = {
  tilesX: 112,
  tilesZ: 100,
  density: 0.7,
  seed: 1,
};

/**
 * The parameters the page opens on: a fresh resort every load, unless a
 * benchmark is running.
 */
function startingParams(bench: BenchConfig | null): ResortParams {
  if (bench) return STARTING_PARAMS;
  return { ...STARTING_PARAMS, seed: Math.floor(Math.random() * 0xffffffff) };
}

/**
 * How long a placement takes to go up, or zero if it should simply appear.
 *
 * Zero for a re-laid slab whatever the catalogue says about it: `paving.ts`
 * lifts and re-stands under one key as a path crosses a step or leaves the
 * shore, and a slab that went missing for a moment on every pass would be a
 * hole in the path. See `construction/domain/construction.ts` for what decides
 * the rest.
 */
function buildTimeOf(placement: Placement, lifted?: Placement): number {
  if (lifted) return 0;
  const { model } = objectTypeById(placement.id);
  return buildSeconds({
    category: model.category,
    height: model.height,
    voxelCount: model.voxels.length,
  });
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

/** Gives back the sky an object taken off the plot was keeping from the ground. */
function unsplatSkyVisibility(baked: BakedLighting, placement: Placement): void {
  const region = baked.sky.remove(placement.key);
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
  /**
   * Gives back the sky a placement taken off the plot was shading.
   *
   * Its own verb rather than part of `unlight`, for the reason `light` is apart
   * from `add`: a rail's lanterns go out without it ever having shaded anything.
   */
  unshade(placement: Placement): void;
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
    unshade() {},
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
 * their moorings; see `resort-prep/domain/prepareResort.ts`.
 *
 * Both bakes arrive already done, off the main thread. What is left here is
 * keeping the lamps and the boxes, so an edit re-bakes only what it reaches,
 * and uploading the textures.
 */
function createLighting(prepared: PreparedResort, claiming: readonly Placement[]): Lighting {
  const { anchors, lighting: bake } = prepared;
  if (!bake) return unlitLighting(anchors.length);
  const { grid, bakeMs, skyBakeMs } = bake;
  const { spec } = grid;
  const baked: BakedLighting = {
    live: createLiveLightGrid(grid, anchors),
    sky: createLiveSkyVisibility(spec, grid.direction, claiming.map(occluderOf), true),
    volume: createBakedLightVolume(grid),
  };

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
    unshade(placement) {
      unsplatSkyVisibility(baked, placement);
    },
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
  /**
   * The buildings on this plot that are still going up.
   *
   * Part of the resort rather than of the renderer above it, because its
   * materials are bound to this plot's baked light volume — a field that
   * outlived the resort would hold freed textures — and because a building site
   * belongs to the plot it was pegged out on. See `features/construction/`.
   */
  readonly construction: ConstructionField;
  /**
   * The people walking this plot's paving.
   *
   * Part of the resort rather than of the renderer above it, because the graph
   * they walk is derived from this plot's paving and nothing else: regenerate
   * and the network, and so the crowd on it, is a different one. See
   * `crowd/domain/walkNetwork.ts`.
   *
   * The crowd itself outlives an edit, though its graph does not: a quarter of
   * a second after the last one the network is rebuilt from what now stands and
   * everybody is put back on it, keeping who they are. See `REANCHOR_DELAY_MS`
   * and `reseatCrowd`.
   */
  readonly crowd: CrowdField;
  /**
   * The people who work this plot, walking the same graph as {@link crowd} and
   * drawn from a field of their own.
   *
   * A second crowd rather than more people in the first, because a guest's
   * `variant` indexes the guest models and a cleaner is not one of them - and
   * because every count in the HUD, from the beds to the rating, is about
   * guests. Part of the resort for {@link crowd}'s reason: they walk *this*
   * plot's paving. See `sim/domain/staff.ts`.
   */
  readonly staff: CrowdField;
  /**
   * Where each of {@link staff} is walking and what they are cleaning.
   *
   * Rebuilt rather than rebuilt-into on an edit, for the reason {@link router}
   * is: its flow fields are arrays indexed by node, and an edit renumbers every
   * node there is. See `sim/domain/staffRouter.ts`.
   */
  readonly staffRouter: StaffRouter;
  /**
   * Who the people in {@link crowd} are, keyed by the same person index.
   *
   * Built with the resort and left alone by an edit, which reseats the crowd
   * but renames nobody. See `guests/domain/guests.ts`.
   */
  readonly guests: Guests;
  /**
   * What the people in {@link guests} want, keyed by the same person index.
   *
   * Rewritten every tick, which is why it sits beside the registry rather than
   * in it: `guests.ts` is written once and this is the column the simulation
   * runs over. Built with the resort and left alone by an edit, exactly as the
   * guests are. See `sim/domain/needs.ts`.
   */
  readonly needs: Needs;
  /**
   * What sort of time the people in {@link guests} are having, keyed by the same
   * person index.
   *
   * Beside {@link needs} and for its reason: it is rewritten every tick, and it
   * follows the needs rather than being a sixth one. What the rating is read
   * off. See `sim/domain/happiness.ts`.
   */
  readonly happiness: Happiness;
  /**
   * Somewhere on this plot a guest could decide to go.
   *
   * Derived from what is standing rather than kept in step with it: an edit
   * replaces the whole list, because a bakery may have just been built or
   * bulldozed and a list patched one placement at a time is a second thing to
   * get wrong. **One of the two mutable fields on a resort**, with {@link lodgings},
   * and it is mutable for exactly that — see the reanchor block, which replaces it and rebuilds the
   * router against it in the same breath.
   */
  venues: readonly Venue[];
  /**
   * Somewhere on this plot a guest goes to sleep: a list of its own rather than
   * venues filtered again, and replaced alongside {@link venues} for the same
   * reason. See `sim/domain/lodgings.ts`.
   */
  lodgings: readonly Lodging[];
  /**
   * The ways on and off this plot: a list of its own for {@link lodgings}'s
   * reason, and replaced alongside it, because a gate can be bulldozed like
   * anything else. See `sim/domain/gateways.ts`.
   */
  gateways: readonly Gateway[];
  /**
   * How clean each of {@link venues} is, by the same index.
   *
   * Beside the venue list and replaced with it, because it is indexed by it:
   * the dirt of whatever is still standing is carried across by key, so paving
   * one tile does not scrub the whole plot. Written by the router, which wears a
   * venue down with every visit, and by the staff router, which cleans it. See
   * `sim/domain/upkeep.ts`.
   */
  upkeep: Upkeep;
  /**
   * Which of {@link venues} nothing can walk to at all, by key.
   *
   * Worked out when the graph is and replaced alongside the three lists above,
   * rather than once a day with the rest of the advice: it is a question about
   * the paving and the doors, so the only thing that can change the answer is
   * the edit that has just rebuilt both. See `sim/domain/advice.ts`.
   */
  unreachable: ReadonlySet<string>;
  /**
   * What the resort is worth out of five, and what made it that.
   *
   * Worked out once a day rather than per tick - it is a mean over every guest
   * on the plot, and it moves at the pace happiness does - and read by the
   * morning's check-in and by the HUD. Mutable for that: see the tick block.
   */
  rating: Rating;
  /**
   * What every morning's arrivals are drawn from: who checks in, how long they
   * stay and what they are called.
   *
   * Part of the resort because it advances with it - two plots must not share a
   * sequence - and seeded for the reason every other draw on the plot is. See
   * {@link ARRIVALS_SEED}.
   */
  readonly arrivals: () => number;
  /**
   * Beds on the plot and guests who have one.
   *
   * Recounted once a day rather than once when the resort is built: a party
   * checking out gives its beds back and the coach in the morning takes some of
   * them again, and the windows are lit from the share of them slept in. Read by
   * the stats and by the windows every tick, which is why it is counted a day at
   * a time and not asked for per frame.
   */
  beds: { readonly total: number; readonly taken: number };
  /**
   * What turns {@link needs} into somewhere to walk, over {@link crowd}'s graph.
   *
   * Rebuilt rather than rebuilt-into when the plot is edited, for the reason the
   * venues are replaced: its flow fields are arrays indexed by node, and an edit
   * renumbers every node there is. See `sim/domain/router.ts`.
   */
  readonly router: Router;
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
   * The plan the plot was grown from, held so the walk graph can be rebuilt
   * after an edit off the resort that is standing rather than off whichever one
   * was standing when the page opened.
   */
  readonly plan: ResortPlan;
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
 * The lodging on the plot, biggest first, as `assignHomes` wants it.
 *
 * Off the *layout's* placements rather than the plot's, for the reason
 * `networkFor` reads the layout's paving: a benchmark tiles the plan out
 * ninefold, and a resort that slept nine times its guests would be reporting
 * a plot that is not there.
 */
function homesOn(placements: readonly Placement[]): Home[] {
  return (
    placements
      .map((placement) => ({
        key: placement.key,
        id: placement.id,
        label: objectTypeById(placement.id).label,
        beds: bedsOf(placement.id),
      }))
      .filter((home) => home.beds > 0)
      // The key breaks ties so the order is total: without it two runs could
      // house the same guests differently.
      .toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key))
  );
}

/**
 * The crowd this plot can hold, on the graph it was handed.
 *
 * The graph is built by the caller rather than here, because the router walks
 * the same one and two graphs would be two different numberings: a node index
 * the router named would mean nothing to the crowd. See `buildResort`, which is
 * where the question about the layout's paving is now asked.
 */
function crowdFor(parts: {
  readonly network: WalkNetwork;
  readonly people: readonly ModelGeometry[];
  /** The lamps the crowd walks under, so a person catches the light a wall does. */
  readonly lightVolume: BakedLightVolume | null;
  /** Who the walkers are; a child is drawn with the child model. */
  readonly guests: Guests;
  /** How many people to put on the plot. */
  readonly population: number;
  /** Where somebody with somewhere to be walks next; see `sim/domain/router.ts`. */
  readonly routeOf: (person: number, at: number) => number;
  /** Whether somebody has somewhere to be, so the beach gives them up. */
  readonly offTheSand: (person: number) => boolean;
}): CrowdField {
  return buildCrowdField({
    crowd: createCrowd({
      network: parts.network,
      count: parts.population,
      variants: parts.people.length,
      variantOf: (i) => parts.guests.variant[i] ?? 0,
      routeOf: parts.routeOf,
      offTheSand: parts.offTheSand,
      // The router settles people on the beach; see `CrowdOptions.roamsBeach`.
      roamsBeach: false,
      seed: CROWD_SEED,
    }),
    models: parts.people,
    lightVolume: parts.lightVolume,
  });
}

/**
 * The staff this plot keeps, on the same graph the guests walk.
 *
 * `crowdFor`'s sibling rather than a branch in it: what differs is the registry
 * the variants are dealt from, the count, the seed and the decision function,
 * which is all of its arguments. They never roam the beach - no staff goes on
 * the sand in this plan, which is what defers the lifeguards - and nothing calls
 * them off it, so `offTheSand` is left out.
 */
function staffCrowdFor(parts: {
  readonly network: WalkNetwork;
  readonly models: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
  readonly staff: Staff;
  /** Where a worker with a venue to clean walks next; see `sim/domain/staffRouter.ts`. */
  readonly routeOf: (worker: number, at: number) => number;
}): CrowdField {
  return buildCrowdField({
    crowd: createCrowd({
      network: parts.network,
      count: parts.staff.count,
      // Never zero: `createCrowd` deals a variant per body, and a plot whose art
      // declared no staff model at all would divide by nothing.
      variants: Math.max(1, parts.models.length),
      variantOf: (worker) => parts.staff.variant[worker] ?? 0,
      routeOf: parts.routeOf,
      roamsBeach: false,
      seed: STAFF_SEED,
    }),
    models: parts.models,
    lightVolume: parts.lightVolume,
  });
}

/**
 * How long after the last edit the crowd is put back on a rebuilt graph, in
 * milliseconds.
 *
 * Long enough that a drag across the plot costs one rebuild rather than one per
 * tile, short enough that it reads as immediate. A quarter of a second is about
 * the gap between two deliberate clicks.
 */
const REANCHOR_DELAY_MS = 250;

/**
 * The graph the crowd walks, from what is standing.
 *
 * Split out of {@link crowdFor} so an edit can rebuild it alone: the crowd keeps
 * its people and is put back on the new graph rather than made again. See
 * `reseatCrowd`.
 *
 * `paved` and `standing` are passed in rather than read off the plot here,
 * because the two callers read different lists and the difference matters: the
 * first build reads `layout.*`, which is the plot as planned and is what a
 * benchmark's nine tiled copies must not be counted from, and a rebuild after an
 * edit reads `plot.*`, which is the plot as it now stands, hand edits included.
 * A benchmark never edits, so it never takes the second path.
 */
function networkFor(parts: {
  readonly plan: ResortPlan;
  readonly shore: Shore | null;
  readonly terrain: Terrain;
  readonly paved: readonly Placement[];
  /** Everything standing that is not paving: what is sat on, and what is walked round. */
  readonly standing: readonly Placement[];
}): WalkNetwork {
  return walkNetworkFor({
    paved: parts.paved,
    levelOf: (tileX, tileZ) => parts.terrain.levelOf(tileX, tileZ),
    shore: parts.shore,
    tilesX: parts.plan.tilesX,
    // Which paving stands a metre above what it is laid on: a bridge over a
    // river or a lake, and nothing else — the pier out over the bay lies flat on
    // the sea. Asked of the ground here exactly as `layoutResort` asks it, so the
    // crowd walks the deck the layout actually stood. See `spans.ts`.
    bridged: (tileX, tileZ) =>
      parts.terrain.surfaceOf(tileX, tileZ) === 'water' && !parts.terrain.isSea(tileX, tileZ),
    seats: seatSpotsFor(parts.standing.map(seatSiteOf)),
    // The same list, as boxes on the ground: whichever of them stand on the sand
    // are what a roamer walks round. See `crowd/domain/sandGrid.ts`.
    obstacles: parts.standing,
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

/** The meshed catalogue a resort is built over, which outlives every resort. */
interface ResortArt {
  /**
   * The tick of the day on the scene's clock, late-bound: every resort is built
   * with a router that asks it, and the first is built before the clock is.
   */
  readonly tickOfDay: () => number;
  /**
   * What kind of day it is on the scene's clock, late-bound for
   * {@link ResortArt.tickOfDay}'s reason and asked of it for the same one: the
   * day turns over between ticks and the weather turns over with it.
   */
  readonly weather: () => Weather;
  readonly geometries: readonly ModelGeometry[];
  readonly people: readonly ModelGeometry[];
  readonly staff: readonly ModelGeometry[];
  readonly sky: readonly ModelGeometry[];
  readonly sea: readonly ModelGeometry[];
}

/**
 * Builds everything that hangs off a prepared resort: instance buffers,
 * textures and the fields that move.
 *
 * The plan was grown, laid out and baked before this — off the main thread, see
 * `resort-prep` — so what is left is the work only the renderer's thread can do.
 * The volume is wired up before the world, because the world's materials are.
 */
function buildResort(parts: ResortArt & { readonly prepared: PreparedResort }): Resort {
  const { plan, plot, moorings, bounds, framing } = parts.prepared;
  const everything = everythingOn(plot);
  const claiming = claimingOn(plot);
  const shore = shoreFor(plan);
  const lighting = createLighting(parts.prepared, claiming);
  const world = buildInstancedWorld(parts.geometries, everything, {
    lightVolume: lighting.volume,
  });
  const shadows = buildBlobShadowField(blobShadowsFor(claiming.map(casterOf)));
  const construction = buildConstructionField(parts.geometries, lighting.volume);
  const terrain = terrainFor(plan);
  // As many as the paving calls for, which a benchmark's tiled copies add
  // nothing to: the network is walked over the layout's own paving.
  const population = crowdSizeFor(plot.layout.paths.length, CROWD_OVERRIDE);
  const guests = createGuests({
    count: population,
    homes: homesOn(plot.layout.placements),
    variants: parts.people.length,
    childVariant: CHILD_VARIANT,
    seed: GUEST_SEED,
  });
  const needs = createNeeds(guests, NEEDS_SEED);
  const happiness = createHappiness(population);
  // Its own generator, for the reason every other draw on the plot has one; see
  // {@link ARRIVALS_SEED}.
  const arrivals = createRandom(ARRIVALS_SEED);
  // Every question about the ground is asked once, here — which tiles are paved,
  // how high each one stands, where the sand is, what can be sat on — and
  // answered into the one graph the crowd walks and the router routes over. See
  // `crowd/domain/walkNetwork.ts`.
  //
  // Off the *layout's* paving rather than the plot's, which is the same list on
  // every plot but one: the benchmark tiles the plan out to nine times the size,
  // and the copies stand on ground the elevation and the shore know nothing
  // about. The crowd walks the plot that is actually there.
  const network = networkFor({
    plan,
    shore,
    terrain,
    paved: plot.layout.paths,
    // The authored objects *and* the scattered props, because the bench is one
    // of the latter: the layout stands benches along the path edges itself, so
    // a crowd built off `placements` alone would have nothing to sit on at all.
    standing: [...plot.layout.placements, ...plot.layout.props],
  });
  // Off the layout's own placements for the same reason, and for `homesOn`'s: a
  // resort with nine times the bakeries is not the plot that is there.
  const venues = venuesOn(plot.layout.placements);
  const lodgings = lodgingsOn(plot.layout.placements);
  const gateways = gatewaysOn(plot.layout.placements);
  const unreachable = strandedOn(venues, network);
  // Everything spotless: a plot that has just been built has had nobody in it.
  const upkeep = createUpkeep(venues.length);
  const beds = bedCount(guests);
  // The router reads where somebody is standing and the crowd is built with the
  // router, so one of the two is bound late — as `createClock` binds the resort.
  let crowdField: CrowdField | null = null;
  const router = createRouter({
    guests,
    needs,
    venues,
    lodgings,
    gateways,
    network,
    // Out of the gate and off the plot: the party's beds and bodies go back into
    // the pool the morning's coach is dealt from, and the crowd stops drawing
    // them. The router knows where they walked and nothing about who they were;
    // joining the two up is this file's job. See `guests.ts` and `crowd.ts`.
    onLeave: (person) => {
      const left = checkOutParty(guests, guests.party[person]!);
      const people = crowdField!.crowd;
      for (const member of left) {
        // Every member, not only the one at the gate: somebody who was having
        // lunch when their family left is taken off the plot where they sit, and
        // a visit left standing would walk an empty body out of the door.
        router.forget(member);
        takeOffPlot(people, member, people.x[member]!, people.y[member]!, people.z[member]!);
      }
    },
    tickOfDay: parts.tickOfDay,
    // Late bound, exactly as the tick is: the clock is what knows the day, and
    // a day is what the weather is a function of. See `weather.ts`.
    weather: parts.weather,
    // Asserted, and safe: the crowd is built on the very next statement, and
    // nothing calls into the router until a frame steps somebody somewhere.
    crowd: () => crowdField!.crowd,
    // Late-bound for the crowd's reason: a plot edit replaces the venue list,
    // and the upkeep beside it, and a router holding the one from before the
    // edit would be soiling venues that no longer stand. See the reanchor block.
    upkeep: () => resort.upkeep,
    seed: DWELL_SEED,
  });
  const crowd = crowdFor({
    network,
    people: parts.people,
    lightVolume: lighting.volume,
    guests,
    population,
    routeOf: (person, at) => router.step(person, at),
    offTheSand: (person) => router.offTheSand(person),
  });
  crowdField = crowd;
  // As many as the venues standing when the plot was built, and not recounted on
  // an edit: a crowd's bodies are dealt once, exactly as the guests' are, and
  // the count only moves when the whole resort is replaced. See `staffFor`.
  const employed = staffFor(venues.length);
  // Bound late to each other for the reason the guests' pair is: the router
  // reads where somebody is standing and the crowd is built with the router.
  let staffField: CrowdField | null = null;
  const staffRouter = createStaffRouter({
    staff: employed,
    venues,
    network,
    upkeep: () => resort.upkeep,
    crowd: () => staffField!.crowd,
    // So nobody is sent to mop a pool the rain has shut; see `staffRouter.ts`.
    weather: parts.weather,
    seed: STAFF_SEED,
  });
  const staff = staffCrowdFor({
    network,
    models: parts.staff,
    lightVolume: lighting.volume,
    staff: employed,
    routeOf: (worker, at) => staffRouter.step(worker, at),
  });
  staffField = staff;
  const balloons = balloonsFor({
    shore,
    sky: parts.sky,
    lightVolume: lighting.volume,
  });
  const sea = seaFor({
    shore,
    paved: plot.layout.paths,
    placements: plot.layout.placements,
    moorings,
    sea: parts.sea,
    people: parts.people,
    lightVolume: lighting.volume,
  });

  const resort: Resort = {
    plan,
    plot,
    lighting,
    world,
    shadows,
    construction,
    crowd,
    staff,
    staffRouter,
    guests,
    needs,
    happiness,
    venues,
    lodgings,
    gateways,
    upkeep,
    unreachable,
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    beds: { total: beds.beds, taken: beds.taken },
    router,
    arrivals,
    balloons,
    sea,
    shore,
    terrain,
    // Seeded from the resort as planned, then kept up to date one placement at a
    // time; it is what tells the pointer whether a tile is free. The sea is not
    // in it: a pier stands on water, so what the sea will take is a rule about
    // the object rather than a tile somebody already holds — see `paving.ts`.
    // Off the layouts own lists rather than the plots: a benchmarks tiled
    // copies stand on their originals tiles, and would all claim the same ones.
    occupancy: createTileOccupancy(claimingOn(plot.layout)),
    railIndex: createRailIndex(plot.rails),
    bounds,
    framing,
    dispose() {
      world.dispose();
      shadows.dispose();
      construction.dispose();
      crowd.dispose();
      staff.dispose();
      balloons.dispose();
      sea.dispose();
      lighting.volume?.dispose();
    },
  };
  return resort;
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
  /** Builds a prepared resort, puts it on screen, and hands it back. */
  replace(prepared: PreparedResort): Resort;
}

function createResortSlot(parts: ResortArt & { readonly prepared: PreparedResort }): ResortSlot {
  let resort = buildResort(parts);
  // The first resort is built before the renderer is, because the scene is
  // created around the light volume it bakes.
  let scene: SceneHandle | null = null;

  return {
    current: () => resort,
    attach(handle) {
      scene = handle;
    },
    replace(prepared) {
      // The old resort is let go last, and only once nothing in the scene points
      // at it any more: the ground is bound to the light volume, so disposing
      // the volume first would leave a material holding freed textures.
      const previous = resort;
      resort = buildResort({ ...parts, prepared });
      scene?.scene.remove(previous.world.group);
      scene?.scene.remove(previous.shadows.group);
      scene?.scene.remove(previous.construction.group);
      scene?.scene.remove(previous.crowd.group);
      // The seventh pair, and the half that is easy to forget: without the
      // remove, the previous plot's cleaners go on walking over the new one.
      scene?.scene.remove(previous.staff.group);
      scene?.scene.remove(previous.balloons.group);
      scene?.scene.remove(previous.sea.group);
      scene?.scene.add(resort.world.group);
      scene?.scene.add(resort.shadows.group);
      scene?.scene.add(resort.construction.group);
      scene?.scene.add(resort.crowd.group);
      scene?.scene.add(resort.staff.group);
      scene?.scene.add(resort.balloons.group);
      scene?.scene.add(resort.sea.group);
      scene?.reframe(
        resort.bounds,
        resort.framing,
        resort.lighting.volume,
        resort.shore,
        resort.terrain,
        prepared.surfaces,
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
function plotTotals(plot: Plot): {
  readonly types: number;
  readonly voxels: number;
} {
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
  readonly weather: Weather;
  /**
   * The rain, which belongs to the scene rather than to the resort: it falls
   * over the camera and not over the plot, so it survives a rebuild. Counted
   * here all the same, because it is one more draw the renderer is handed.
   */
  readonly rain: RainField;
}): ShowcaseStats {
  const { handle, scratch, catalogue, rain } = parts;
  const { plot, world, shadows, construction, crowd, staff, balloons, sea, lighting } =
    parts.resort;
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
      world.drawCalls +
      shadows.drawCalls +
      construction.drawCalls +
      crowd.drawCalls +
      staff.drawCalls +
      balloons.drawCalls +
      sea.drawCalls +
      rain.drawCalls,
    chunkCount: world.chunkCount,
    uniqueTriangleCount: world.uniqueTriangleCount,
    unmergedTriangleCount: world.unmergedTriangleCount,
    drawnTriangleCount:
      world.drawnTriangleCount +
      shadows.triangleCount +
      construction.triangleCount +
      crowd.triangleCount +
      staff.triangleCount +
      balloons.triangleCount +
      sea.triangleCount +
      rain.triangleCount,
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
    beds: parts.resort.beds,
    asleep: parts.resort.router.asleepCount,
    venues: parts.resort.router.occupancyTotals,
    routeFields: parts.resort.router.fieldCount,
    guests: { present: presentCount(parts.resort.guests), capacity: parts.resort.guests.count },
    staff: {
      total: parts.resort.staff.crowd.count,
      working: parts.resort.staffRouter.workingCount,
    },
    cleanliness: meanCleanliness(parts.resort.upkeep, parts.resort.venues.length),
    rating: parts.resort.rating.stars,
    weather: parts.weather,
    ...parts.startup,
  };
}

/**
 * Lights as many rooms as the resort has beds slept in, and hands back the
 * share it lit them from, for the next call to compare against.
 *
 * Written only on a change: a uniform is cheap, but this runs in the tick block
 * and the share moves a few times a night rather than once a tick. `last` null
 * writes whatever the share is, which is what a resort just built needs.
 */
function lightRooms(resort: Resort, last: number | null): number {
  const share = occupiedShare(resort.beds.total, resort.router.asleepCount);
  if (share !== last) resort.world.setOccupiedShare(share);
  return share;
}

/**
 * Everything the simulation does with the whole simulated minutes the clock just
 * produced, and the share of the rooms that are lit afterwards.
 *
 * One function rather than five statements in the animation loop, because that
 * loop is already the longest thing in this file and none of this is about
 * frames: a tick is a simulated minute however many frames went into it. See
 * `simClock.ts`.
 */
function runTicks(
  resort: Resort,
  clock: Clock,
  ticks: number,
  lastShare: number | null,
  advise: () => void,
): number {
  // Once for the whole frame's worth of ticks, not once each: the weather is one
  // fact about the day, and `decayNeeds` runs the ticks in one pass anyway.
  decayNeeds(resort.needs, resort.guests, ticks, weatherEffect(clock.weather));
  // One at a time rather than all twelve at once: a venue that frees a place
  // on the first of them must let somebody in on the first, not on the last.
  for (let tick = ticks; tick > 0; tick--) {
    resort.router.tick(clock.ticks - tick + 1);
    // In the same loop and on the same tick as the guests', so a spell of work
    // that ends on the first of twelve ends on the first: the venue is cleaner
    // from that tick on, and whoever decides next sees it.
    resort.staffRouter.tick(clock.ticks - tick + 1);
  }
  // After the ticks, so a guest who spent them in a line is charged for the line
  // they were actually in rather than the one they had just joined.
  ageHappiness(
    resort.happiness,
    resort.needs,
    resort.guests,
    (person) => resort.router.isWaitingAt(person),
    ticks,
  );
  // The coaches, once a day, over the run of ticks the clock just produced
  // rather than on one of them: twelve ticks in a frame must not step over
  // eleven o'clock. See `checkIn.ts`.
  if (checkInDue(clock.ticks - ticks + 1, clock.ticks)) {
    runDay(resort, clock.day);
    // After the coaches, so the day's advice describes the plot as it now
    // stands, and before the counters are wiped, since it is what reads them.
    advise();
    resort.router.forgetTheDay();
  }
  return lightRooms(resort, lastShare);
}

/**
 * The venues on this graph nothing can walk to, by key.
 *
 * One node index for the whole list rather than one per venue, which is the
 * only reason this is a function here instead of a call at each of its two
 * sites. The rule itself - and the beach building it must not strand - is
 * `advice.ts`'s, with its test.
 */
function strandedOn(venues: readonly Venue[], network: WalkNetwork): ReadonlySet<string> {
  const index = nodeIndexFor(network);
  return unreachableOn(venues, (venue) => doorsFor(venue, index, network));
}

/** Guests on the plot right now with nowhere to sleep; see `homes.ts`. */
function homelessOn(guests: Guests): number {
  let homeless = 0;
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1 && guests.home[person] === NO_HOME) homeless++;
  }
  return homeless;
}

/** What the guests on the plot want most, counted per need; see `strongestNeed`. */
function wantingOn(resort: Resort): { readonly [need in GuestNeed]: number } {
  const { guests, needs } = resort;
  const counted = { hunger: 0, thirst: 0, energy: 0, fun: 0, hygiene: 0 };
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    const want = strongestNeed(needs, guests, person);
    if (want) counted[want.need]++;
  }
  return counted;
}

/**
 * Everything the advice reads, gathered off the resort as it stands.
 *
 * **Once a simulated day, and on an edit** - never per frame, and never per
 * tick. It walks the guest list twice and the venue list once, and every number
 * in it is one something else already counted: nothing here decides anything or
 * changes anything. See `sim/domain/advice.ts`, which is emphatic about that.
 */
function factsNow(resort: Resort, weather: Weather): ResortFacts {
  const { guests, router } = resort;
  const effect = weatherEffect(weather);
  return {
    venues: resort.venues,
    lodgings: resort.lodgings,
    present: presentCount(guests),
    homeless: homelessOn(guests),
    // The registry's own tally, kept in step by check-in and check-out, rather
    // than a third pass over the guests.
    bedsFree: guests.freeBeds.reduce((free, home) => free + home, 0),
    wanting: wantingOn(resort),
    balks: router.dayBalks(),
    visits: router.dayVisits(),
    unreachable: resort.unreachable,
    // By key, because a piece of advice names a building and not an index into
    // a list the next edit replaces.
    cleanliness: new Map(
      resort.venues.map((venue, index) => [venue.key, cleanliness(resort.upkeep, index)]),
    ),
    // By key, for the cleanliness map's reason. The same `isOpenIn` the router
    // turns somebody away at, so the panel and the door agree about what is shut.
    closed: new Set(
      resort.venues
        .filter((venue) => !isOpenIn(shelterOf(venue), effect))
        .map((venue) => venue.key),
    ),
  };
}

/**
 * One turn of the game's loop, run once a simulated day at the check-in hour.
 *
 * What the resort is worth is worked out **first**, off the plot as it stands
 * overnight, so the morning's coach is sized by the resort the guests who are
 * here actually experienced rather than by one that has already changed. Then
 * the arrivals, then the departures, and the beds are counted again at the end
 * because both halves moved them.
 *
 * See `sim/domain/rating.ts` and `sim/domain/checkIn.ts`; nothing here decides
 * anything, it only joins the registry, the router and the crowd up.
 */
function runDay(resort: Resort, day: number): void {
  const beds = bedCount(resort.guests);
  resort.rating = ratingFor({
    happiness: meanHappiness(resort.happiness, resort.guests),
    present: presentCount(resort.guests),
    housed: beds.taken,
    // The plot as it stands overnight, like the other two terms: a resort the
    // player has let go rates like one, even on a day when everybody still ate.
    cleanliness: meanCleanliness(resort.upkeep, resort.venues.length),
  });
  admitArrivals(resort, day);
  sendDepartures(resort, day);
  const after = bedCount(resort.guests);
  resort.beds = { total: after.beds, taken: after.taken };
}

/**
 * The morning's coach: as many parties as the rating and the free beds allow,
 * stood on the paving at a gate and left to walk.
 *
 * A plot with no gate standing - or none any paving reaches - takes nobody, and
 * that is a real state rather than an error: the HUD's `Guests` row is what says
 * the resort is closed to arrivals.
 */
function admitArrivals(resort: Resort, day: number): void {
  const at = resort.router.arrivalNode;
  if (at < 0) return;
  const arrived = runCheckIn({
    guests: resort.guests,
    needs: resort.needs,
    happiness: resort.happiness,
    rating: resort.rating,
    day,
    random: resort.arrivals,
  });
  for (const person of arrived) resort.router.admit(person, at);
}

/**
 * Everybody whose nights are up, sent for the gate.
 *
 * Walked once a day rather than once a tick: six hundred comparisons a day is
 * nothing and six hundred a tick is six hundred a tick. Asking twice about the
 * same person is free, which is what lets a guest who could not reach a gate
 * yesterday be asked again today. See `Router.sendHome`.
 */
function sendDepartures(resort: Resort, day: number): void {
  const { guests } = resort;
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    if (guests.arrivedOn[person]! + guests.nights[person]! >= day) continue;
    resort.router.sendHome(person);
  }
}

/**
 * The scene's clock: the simulation's calendar and speed, and the sky and lamp
 * strength that follow from its time of day. See `sim/domain/simClock.ts`.
 *
 * The sky is recomputed only when the time of day actually moves — which is
 * most of the time it does not, since the resort opens paused — and that is a
 * whole scene's worth of colour and light updates nothing would have looked at.
 */
interface Clock {
  /** Normalised time of day, 0..1, which is what the sky is drawn from. */
  readonly time: number;
  /** Whole days since the resort opened. */
  readonly day: number;
  /**
   * What kind of day it is: a pure function of {@link Clock.day} and
   * {@link WEATHER_SEED}, so nothing about it is stored - unless somebody has
   * asked for a particular day with {@link Clock.setWeather}. See
   * `sim/domain/weather.ts`.
   */
  readonly weather: Weather;
  /**
   * The day somebody pinned the sky to, or null when the week is running as it
   * was drawn. What the HUD's weather buttons show pressed in.
   */
  readonly forcedWeather: Weather | null;
  /** The tick of the current day, 0..1439: what a party's bedtime is compared against. */
  readonly tickOfDay: number;
  /**
   * Whole simulated minutes since the resort opened: what a tick is numbered
   * by, and what the simulation stamps a visit's end with.
   */
  readonly ticks: number;
  /** `"Day 3  14:20"`, for the HUD. */
  readonly label: string;
  readonly speed: SimSpeed;
  /** Lamps contributing right now: the bake lights all of them, or none. */
  readonly litLamps: number;
  /**
   * How freely the beach is letting balloons go; see `releaseStrength`. Zero on
   * a wet day, whatever the hour: nobody lights a paper lantern in the rain.
   */
  readonly balloonReadiness: number;
  /**
   * Moves the clock on by a frame's worth of real seconds and hands back the
   * whole simulated ticks that frame is worth. What runs on them is the
   * simulation: the needs decay first, and everything after it queues up
   * behind that. See `sim/domain/needs.ts`.
   */
  advance(elapsedSeconds: number): number;
  /** Re-applies the time of day to a scene that has just been rebuilt. */
  relight(): void;
  /**
   * Jumps to a moment of the current day. Does not change the speed.
   *
   * Deliberately unlike the old cycle checkbox, which this stopped: with a speed
   * control beside it, dragging the sun to sunset while the resort runs is a
   * reasonable thing to want.
   */
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  /**
   * Pins the weather to one kind of day, or hands it back to the week's own
   * draw with null.
   *
   * Here rather than in `weather.ts` deliberately: `weatherOn` stays a pure
   * function of the day and the seed, and what is stored is one nullable field
   * on the clock - which is not saved, because it is a thing somebody did to
   * look at something rather than a fact about the resort. So the save file
   * still holds one integer, exactly as `simClock.ts` says.
   */
  setWeather(weather: Weather | null): void;
}

function createClock(handle: SceneHandle, resort: () => Resort, startTime: number): Clock {
  let clock: SimClock = createSimClock(0, startTime);
  let time = timeOf(clock);
  /**
   * The day somebody pinned the sky to, or null for the week as it was drawn.
   *
   * The one thing about the weather that is stored anywhere, and it is stored
   * here rather than in `weather.ts` so that module stays a pure function of
   * the day; see {@link Clock.setWeather}.
   */
  let forced: Weather | null = null;
  const weatherNow = (): Weather => forced ?? weatherOn(dayOf(clock), WEATHER_SEED);
  /** How grey the sky is under today's weather; see `weather.ts`. */
  const overcastNow = (): number => weatherEffect(weatherNow()).overcast;
  /**
   * Real seconds since the resort opened, which is what the lightning is a
   * function of.
   *
   * Real rather than simulated, for the reason the balloons fly off elapsed
   * seconds: the clock opens paused, and a storm whose flashes were a function
   * of the simulated hour would be a storm that never flashed for anybody
   * looking at a stopped plot. Off the same fixed step under a benchmark as
   * everything else, since `advance` is handed one.
   */
  let running = 0;
  const flashNow = (): number => (weatherNow() === 'storm' ? flashAt(running) : 0);
  let sky = flashSky(overcastSky(skyStateFor(time), overcastNow()), flashNow());
  let applied: number | null = null;
  let appliedOvercast: number | null = null;
  let appliedFlash = 0;

  const apply = (): void => {
    time = timeOf(clock);
    const overcast = overcastNow();
    const flash = flashNow();
    // The cloud is in the guard as well as the hour: the weather turns over at
    // midnight without the *time* moving at all at `paused`, and a guard on the
    // time alone would leave a storm's sky waiting for the next simulated
    // minute that never comes. The bolt is in it for the same reason and more
    // often - a flash is over inside half a second, and it has to reach the
    // scene on the frames it is actually alight rather than on the next minute.
    if (time === applied && overcast === appliedOvercast && flash === appliedFlash) return;
    sky = flashSky(overcastSky(skyStateFor(time), overcast), flash);
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
    appliedOvercast = overcast;
    appliedFlash = flash;
  };
  apply();

  return {
    get time() {
      return time;
    },
    get day() {
      return dayOf(clock);
    },
    get weather() {
      return weatherNow();
    },
    get forcedWeather() {
      return forced;
    },
    get tickOfDay() {
      return clock.ticks % TICKS_PER_DAY;
    },
    get ticks() {
      return clock.ticks;
    },
    get label() {
      return clockLabel(clock);
    },
    get speed() {
      return clock.speed;
    },
    get litLamps() {
      return sky.lampFactor > 0 ? resort().lighting.litCount : 0;
    },
    get balloonReadiness() {
      // Nobody lights a paper lantern in the rain. The flights already in the
      // air finish - `stepBalloons` only reads this when a gap runs out - so a
      // shower that comes in at dusk empties the sky over the next minute
      // rather than blinking it out.
      return isWet(weatherNow()) ? 0 : releaseStrength(time);
    },
    relight() {
      // A new resort is a new volume and a new set of blobs, and both start at
      // zero however far through the day the clock happens to be.
      applied = null;
      appliedOvercast = null;
      apply();
      // And its windows, which would otherwise open on the share the previous
      // plot's guests were sleeping at.
      lightRooms(resort(), null);
    },
    advance(elapsedSeconds) {
      running += elapsedSeconds;
      const advanced = advanceClock(clock, elapsedSeconds);
      clock = advanced.clock;
      apply();
      return advanced.ticks;
    },
    setTime(next) {
      clock = withTime(clock, next);
    },
    setSpeed(next) {
      clock = withSpeed(clock, next);
    },
    setWeather(next) {
      forced = next;
      // The sky follows on this frame rather than the next simulated minute:
      // pinning the weather while the resort is paused is exactly what the
      // button is for, and `apply`'s own guard has the overcast in it.
      apply();
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
  /** What kind of day it is, read afresh: the day turns over under the HUD. */
  readonly weather: () => Weather;
  /** The rain over the camera; see `sceneStats`. One field for the whole run. */
  readonly rain: RainField;
}): () => ShowcaseStats {
  // Everything is built by this point; the next thing that happens is a frame.
  const startup: StartupCost = {
    startupMs: Math.round(performance.now() - parts.mountStarted),
    startupFrames: parts.startup.frames(),
  };
  parts.startup.stop();
  return () => sceneStats({ ...parts, resort: parts.resort(), weather: parts.weather(), startup });
}

interface BenchRecorder {
  /** Records one frame's wall-clock duration; a no-op once the run has finished. */
  readonly record: (frameMs: number) => void;
  /** Records one frame's GPU duration, as the render loop read it back. */
  readonly recordGpu: (durationMs: number) => void;
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
    recordGpu(durationMs) {
      if (!result) gpuFrames.push(durationMs);
    },
    result: () => result,
  };
}

/** Where a newly placed object is counted; see `placementLists.ts`. */
function listFor(plot: Plot, id: string): Placement[] {
  return plot[listOf(id)];
}

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
  /** Carries the buildings that are going up forward by one frame. */
  advance(dt: number): void;
  /**
   * Drops every building site without standing what it was building.
   *
   * For the moment the plot they were pegged out on goes: their placements were
   * only ever in that plot's lists and its occupancy index, both of which go
   * with it, and the field drawing them is disposed with it too.
   */
  abandon(): void;
  /** The ground every pointer aims at, forwarded to whichever resort is standing. */
  readonly ground: PickGround;
  /** The placement standing under a key, which the occupancy index only names. */
  placementOf(key: string): Placement | undefined;
  dispose(): void;
}

/**
 * Wires the three pointers — objects, the spade and the bulldozer — to the
 * mutable scene.
 *
 * Three pointers and one cursor, because there is one left mouse button: arming
 * any one disarms the others, which is what {@link BuildTool} makes structural
 * rather than a rule to remember. They share the ghost too — a brush shows the
 * footprint patch alone, an object shows the model standing in it and the
 * bulldozer marks what it would take, and a second cursor object would be a
 * second thing to keep looking like this one.
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
  /** Called as a placement comes off the plot, so nothing goes on describing it. */
  readonly onLift: (placement: Placement) => void;
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
    flagstones: pavingItem(PATH_ID),
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
   * Three pointers ask for the same button, and `takeLeftButton` is a state
   * rather than a count: arming the spade while an object is armed would
   * otherwise be an arm and a disarm in whichever order `select` happened to run
   * them, and one of those orders gives the button back to the camera with a tool
   * still in hand. Naming the holder takes the ordering out of it entirely.
   */
  let holder: BuildTool['kind'] | null = null;
  const lendLeftButton =
    (who: BuildTool['kind']) =>
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
   * Takes one placement back off the plot: every effect {@link stand} has, in
   * reverse.
   *
   * Two callers. A flight of stairs replaces the slab a path had already laid on
   * the tile, so that one comes up first — off the index, out of the world and
   * out of the plot's own list — or the tile would be double-booked and the slab
   * would go on being drawn inside the flight; see `paving.ts`. And the bulldozer,
   * which is nothing but this.
   */
  const lift = (placement: Placement): void => {
    const { plot, world, lighting, shadows } = resort();
    parts.onLift(placement);
    occupancy.release(placement, placement.key);
    // A building still going up was never in the world, threw no shadow and lit
    // nothing: cancelling its site is the whole of taking it down. This is what
    // keeps `lift` a mirror of `stand` now that `stand` has two halves — it
    // mirrors whichever half actually ran.
    if (cancelSite(placement.key)) {
      const laid = listFor(plot, placement.id);
      const at = laid.findIndex((standing) => standing.key === placement.key);
      if (at !== -1) laid.splice(at, 1);
      return;
    }
    world.remove(placement.key);
    lighting.unlight(placement);
    // The sky it was shading, which `stand` took away with `lighting.add`. A
    // re-laid bridge deck is tall enough to shade, and without this every pass
    // over the crossing stood one more box under the same key.
    lighting.unshade(placement);
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

  /**
   * The half of standing that only becomes true once the building is finished:
   * what the scene draws, the shadow it throws and the lamps it lights.
   *
   * Apart from {@link stand} because a building that is still going up holds its
   * ground and its place in the plot's list from the moment it is placed, and
   * none of these three until the work is done — a blob shadow is sized from the
   * model's full height, and a hotel whose lanterns burned over a foundation
   * would be lighting a street from a building that is not there yet.
   */
  const raise = (placement: Placement): void => {
    const { world, lighting, shadows } = resort();
    world.add(placement);
    // Anything but a paving slab throws one; the model's height says which.
    const blob = blobOf(placement);
    if (blob) shadows.add(blob);
    // Any model may declare lights — a tiki torch and a swimming pool both do
    // — so this is not a check for one object type but a splat of whatever
    // the model brought with it.
    lighting.add(placement);
  };

  /**
   * The buildings still going up, and the clock they go up on.
   *
   * Held here rather than in the field, which only draws them: the field knows
   * about Three.js and nothing about time, and the domain's sites are values
   * folded forward a frame at a time. See `construction/domain/construction.ts`.
   */
  let sites: readonly ConstructionSite[] = [];

  /** Redraws every site at the height its build has reached. */
  const redrawSites = (): void => {
    const { construction } = resort();
    for (const site of sites) {
      construction.show(site.placement, site.height, revealHeightOf(progressOf(site), site.height));
    }
  };

  /** Drops a site that is still going up. False if nothing was being built there. */
  const cancelSite = (key: string): boolean => {
    if (!resort().construction.hide(key)) return false;
    sites = sites.filter((site) => site.placement.key !== key);
    return true;
  };

  /**
   * Stands one placement, taking up the one it replaces first if there is one.
   *
   * The specification of what a placement touches — the index, the world, its
   * shadow, its lamps and the sky it shades, and the plot's own list — and so the
   * thing {@link lift} has to mirror. A placement that grows a new effect grows
   * it in both. What it no longer specifies is *when*: everything {@link raise}
   * does waits for the building to be finished, and everything here does not.
   */
  const stand = (placement: Placement, lifted?: Placement): void => {
    const { plot, construction } = resort();
    if (lifted) lift(lifted);
    // Claimed first: if the tiles are gone the scene must not gain an object
    // the index does not know about. A building going up holds its ground from
    // the moment it is placed, which is what stops a second one being put on
    // top of a site.
    occupancy.claim(placement, placement.key);
    listFor(plot, placement.id).push(placement);
    // Before anything is built on it, and whether or not this takes time: the
    // ground under what stands is drawn square from the moment the tiles are
    // claimed.
    if (reshapesGround(placement)) parts.onGroundChange();
    const seconds = buildTimeOf(placement, lifted);
    if (seconds > 0) {
      const height = objectTypeTop(placement.id);
      sites = [...sites, openSite(placement, height, seconds)];
      construction.show(placement, height, revealHeightOf(0, height));
    } else {
      raise(placement);
    }
    onChange();
  };

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
    onPlace: stand,
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

  /**
   * The placement standing under a key, for the bulldozer.
   *
   * A scan of the lists that claim ground rather than a table of its own: the
   * occupancy index already says which key a tile holds, and a second table from
   * key to placement would be one more thing every edit had to keep in step —
   * the reason `railIndex.ts` is the only writer of its list. Asked once per
   * pointer move over something standing, which is a few thousand key compares.
   */
  const placementOf = (key: string): Placement | undefined => {
    const { plot } = resort();
    for (const list of [plot.placements, plot.props, plot.paths]) {
      const found = list.find((placement) => placement.key === key);
      if (found) return found;
    }
    return undefined;
  };

  const bulldozer = createDemolishPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('remove'),
    ghost,
    occupancy,
    ground,
    paving,
    handrails,
    placementOf,
    onDemolish(placement) {
      lift(placement);
      // The ground under what stood is drawn square, so taking it off the edge
      // of a terrace lets the slope back — the same test `stand` makes.
      if (reshapesGround(placement)) parts.onGroundChange();
      onChange();
    },
    onPlace: stand,
    onRails: changeRails,
    onCancel,
  });

  return {
    select(tool) {
      // All three are told, every time, and the order does not matter: see
      // `lendLeftButton` for why it cannot.
      const id = armedObject(tool);
      pointer.select(id === null ? null : layoutItemFor(objectTypeById(id)));
      spade.select(armedBrush(tool));
      bulldozer.select(armedRemove(tool));
    },
    advance(dt) {
      if (sites.length === 0) return;
      const tick = advanceSites(sites, dt);
      sites = tick.sites;
      redrawSites();
      for (const site of tick.finished) {
        cancelSite(site.placement.key);
        raise(site.placement);
      }
      // One call for the whole frame, however many topped out on it: the HUD
      // cannot show more than one set of numbers a frame anyway.
      if (tick.finished.length > 0) onChange();
    },
    abandon() {
      sites = [];
    },
    ground,
    placementOf,
    dispose() {
      pointer.dispose();
      spade.dispose();
      bulldozer.dispose();
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
      for (const copy of [model, model.coarse]) {
        copy?.lit?.dispose();
        copy?.emissive?.dispose();
        copy?.water?.dispose();
        copy?.window?.dispose();
      }
    }
  }
}

/**
 * The resort the page opens on: a generated one, unless a benchmark is running.
 *
 * A benchmark gets the hand-authored resort: a run is only comparable with the
 * run before it if the scene is the same scene, and `RESORT_PLAN` is the one
 * plot that does not move between builds.
 */
function startingSource(bench: BenchConfig | null, params: ResortParams): ResortSource {
  return bench ? { kind: 'authored' } : { kind: 'generate', params };
}

/** What to prepare for a source: tiled and framed as a benchmark asks, if one is running. */
function prepRequestFor(source: ResortSource, bench: BenchConfig | null): PrepRequest {
  if (!bench) return { source, repeat: 1, view: null };
  return { source, repeat: bench.repeat, view: bench.view };
}

/**
 * The real seconds the crowd is stepped by this frame, before its scale: the
 * bench's fixed step, nothing at all while the resort is paused, or the frame.
 */
function crowdStep(bench: boolean, speed: SimSpeed, elapsed: number): number {
  if (bench) return MAX_STEP;
  return speed === 'paused' ? 0 : elapsed;
}

/** Whether a page opens with the level of detail on: always, unless a bench run says not. */
function detailFrom(bench: BenchConfig | null): boolean {
  return bench?.detail ?? true;
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame, onSceneChange } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  // `?bench=1` pins the camera and the clock so two builds are compared on the
  // same pixels. Absent the flag this is null and nothing that reads it runs.
  const bench = parseBenchConfig(globalThis.location?.search ?? '');

  const scratch = scratchForModels();
  const preparer = createResortPreparer({
    forceMainThread: bench?.forceMainThreadMeshing ?? false,
  });
  let params = startingParams(bench);
  // Meshed and grown at the same time, each in a worker of its own.
  const [catalogue, first] = await Promise.all([
    meshModels(scratch, bench),
    preparer.prepare(prepRequestFor(startingSource(bench, params), bench)),
  ]);

  const slot = createResortSlot({
    prepared: first,
    // Not called until a frame steps somebody, by which time the clock exists.
    tickOfDay: () => clock.tickOfDay,
    weather: () => clock.weather,
    geometries: catalogue.geometries,
    people: catalogue.people,
    staff: catalogue.staff,
    sky: catalogue.sky,
    sea: catalogue.sea,
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
    surfaces: first.surfaces,
    // Forwarded to whichever resort is standing, exactly as the terrain is: the
    // ground under a cottage is drawn square rather than sloped, so the mesher
    // has to ask the live occupancy index and not a snapshot of it.
    isClear: (tileX, tileZ) => current().occupancy.keyAt({ x: tileX, z: tileZ }) === undefined,
    // Wall-clock frame times stop discriminating as soon as a frame fits inside
    // the refresh interval: everything faster reads as exactly 120 fps. The
    // GPU's own timers keep measuring past that point, and the HUD shows them
    // too, because a slow frame is either the main thread's or the GPU's.
    trackTimestamp: true,
    forceWebGL: bench?.forceWebGL ?? false,
  });
  handle.scene.add(current().world.group);
  handle.scene.add(current().shadows.group);
  handle.scene.add(current().construction.group);
  handle.scene.add(current().crowd.group);
  handle.scene.add(current().staff.group);
  handle.scene.add(current().balloons.group);
  handle.scene.add(current().sea.group);
  /**
   * The weather over the camera, built once for the whole run.
   *
   * Not part of a `Resort` and not rebuilt with one, unlike every other group
   * above: rain falls over wherever the camera is pointed rather than over
   * anything on the plot, so there is nothing about it a new resort changes.
   * See `features/weather/`.
   */
  const rain = buildRainField(createRaindrops(MAX_DROPS, RAIN_SEED));
  handle.scene.add(rain.group);
  slot.attach(handle);

  let fpsState = createFpsState();
  let frameCost = createFrameCostState();
  /** The GPU's last reported frame, which arrives a few frames after it was drawn. */
  let gpuMs: number | null = null;
  let running = true;
  let lastTimeMs: number | null = null;
  /** The share of beds slept in that the windows were last lit from. */
  let lastShare: number | null = null;
  const clock = createClock(handle, current, bench ? bench.time : INITIAL_TIME);
  /** The kind of day the HUD was last told about; see `onWeatherChange`. */
  let lastWeather: Weather = clock.weather;

  /**
   * The drawing buffer, in pixels, kept rather than asked for every frame.
   *
   * `handle.drawingBufferSize()` allocates a vector per call, and the only
   * thing that changes it is a resize - which has a handler of its own, below.
   */
  let buffer = handle.drawingBufferSize();

  /**
   * What the camera is doing, in the terms the rain is sized in.
   *
   * The elevation is not a constant anywhere: it is worked out from where the
   * camera stands relative to what it is looking at, which is true of both
   * cameras and survives the isometric one being turned or the perspective one
   * being flown. `pixelsPerVoxel` wants a distance, and the distance that
   * matters is the one to the ground the rain is falling on - the target - not
   * the one to the nearest thing in frame.
   */
  const rainView = (): RainView => {
    const view = handle.detailView();
    const target = handle.controls.target;
    const distance = Math.hypot(view.x - target.x, view.y - target.y, view.z - target.z);
    return {
      voxelsPerPixel: 1 / pixelsPerVoxel(view.lens, distance),
      width: buffer.width,
      height: buffer.height,
      rise: view.y - target.y,
      distance,
    };
  };

  /**
   * The weather's frame: the rain moved on, and the HUD told when the kind of
   * day has changed.
   *
   * A step of its own rather than four more lines inside the render loop, which
   * is already the most branching function in the file - `pnpm fallow:audit`
   * measures it, and every branch added there is one added to the one place
   * nothing can be tested.
   *
   * The rain is handed the camera's own view rather than anything about the
   * plot: the column of air that is drawn is whatever the camera can see, and
   * the streaks are sized in pixels, which is what lets a few thousand drops be
   * the same rain at every zoom over a plot 450 metres across. A dry day
   * hands over null and the field does nothing at all. See
   * `weather/domain/rainfall.ts`.
   *
   * Off the fixed step under a benchmark like everything else that moves, and
   * for the same reason: two runs only compare if the scene is in the same
   * place on the same frame of each.
   */
  const advanceWeather = (elapsedSeconds: number): void => {
    const target = handle.controls.target;
    rain.advance(bench ? MAX_STEP : elapsedSeconds, rainfallFor(clock.weather, rainView()), target);
    // Once a simulated day at midnight, and at once when somebody pins it from
    // the bar: a compare per frame, and a call on neither.
    if (clock.weather === lastWeather) return;
    lastWeather = clock.weather;
    options.onWeatherChange?.(lastWeather);
  };

  if (bench) pinCamera(handle);
  // A run only prices the rain if it is raining, and day 0 is clear: see
  // `BenchConfig.weather`. Through the same door the HUD's buttons use, so the
  // measured frame is the one somebody watching a storm actually gets.
  if (bench?.weather) clock.setWeather(bench.weather);

  /** Whether the level of detail is on; a benchmark can turn it off with `?lod=0`. */
  let detail = detailFrom(bench);

  const cameraView = (): CameraView => ({
    mode: handle.cameraMode,
    direction: handle.isoDirection,
    detail,
  });

  const setCameraMode = (mode: CameraMode): void => {
    // A bench run is measured through one lens; see `pinCamera`.
    if (bench) return;
    handle.setCameraMode(mode);
  };

  const setIsoDirection = (direction: CompassDirection): void => {
    handle.setIsoDirection(direction);
  };

  /**
   * Pans to the middle of a tile, at the height the ground there stands.
   *
   * Off the live terrain rather than off the placement, so panning to a
   * building on a terrace looks at the terrace and not through it, and so a
   * tile whose ground has been dug since is still found.
   */
  const lookAtTile = (tile: { readonly tileX: number; readonly tileZ: number }): void => {
    if (bench) return;
    const { terrain } = current();
    handle.lookAt({
      x: (tile.tileX + 0.5) * TILE_VOXELS,
      y: levelHeight(terrain.levelOf(tile.tileX, tile.tileZ)),
      z: (tile.tileZ + 0.5) * TILE_VOXELS,
    });
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
    // The rain is sized in pixels, so a resized window is a different column of
    // air; see `rainView`.
    buffer = handle.drawingBufferSize();
  };
  globalThis.addEventListener('resize', resize);

  const statsNow = createStatsReader({
    handle,
    resort: current,
    scratch,
    catalogue,
    startup,
    mountStarted,
    weather: () => clock.weather,
    rain,
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

  /**
   * When the walk graph last went stale, or null when it is current.
   *
   * A drag lays a tile per pointer move, and rebuilding a couple of thousand
   * nodes per tile of a drag is not something a frame can spend — so the rebuild
   * waits until the pointer has been still for {@link REANCHOR_DELAY_MS}, and a
   * whole stroke costs one. The same bargain `ground` and `counted` strike, with a
   * longer fuse because the work is bigger.
   */
  let walkStaleAt: number | null = null;

  const build = createEditMode({
    canvas,
    handle,
    resort: current,
    geometries: catalogue.geometries,
    onChange: () => {
      counted = true;
      // The paving may have moved, and with it every node index the crowd
      // holds. Not now, though: see `walkStaleAt`.
      walkStaleAt = performance.now();
    },
    onGroundChange: () => {
      ground = true;
    },
    onCancel: () => {
      selectTool(null);
      options.onToolChange?.(null);
    },
    onLift: (placement) => {
      // A panel describing a bungalow that is not there any more is worse than
      // no panel at all.
      if (namesPlacement(selected, placement.key)) select(null);
    },
  });

  /**
   * What the pointer is holding, or null: kept here because the edit mode only
   * takes orders, and the inspector listens exactly when nothing is armed.
   */
  let armedTool: BuildTool | null = null;
  const selectTool = (tool: BuildTool | null): void => {
    armedTool = tool;
    build.select(tool);
  };

  /**
   * Who or what is being looked at, or null.
   *
   * The index rather than the view, because the view has to be rebuilt whenever
   * the day changes or the resort is edited, and because the live line read per
   * frame needs the index anyway.
   */
  let selected: InspectTarget = null;
  /** The day the view on screen was worded on, so its nights left follow the clock. */
  let selectedOn = clock.day;

  /** One guest, worded from where they are standing. */
  const guestAt = (person: number): SelectionView => {
    const { guests, needs, happiness, venues, crowd } = current();
    const at = { x: crowd.crowd.x[person] ?? 0, z: crowd.crowd.z[person] ?? 0 };
    return guestView(guests, needs, happiness, venues, person, clock.day, at);
  };

  const viewOf = (target: InspectTarget): SelectionView | null => {
    if (!target) return null;
    if ('person' in target) return guestAt(target.person);
    const placement = build.placementOf(target.key);
    if (!placement) return null;
    const resort = current();
    const { guests, router } = resort;
    const label = objectTypeById(placement.id).label;
    // By key rather than by index, because the inspector is handed a placement
    // and the venue list is the router's numbering; -1 for anything that is not
    // a venue at all, which `cleanliness` reads as spotless.
    const venue = resort.venues.findIndex((candidate) => candidate.key === placement.key);
    return placeView(
      placement,
      label,
      guests,
      router.occupancyOf(placement.key),
      cleanliness(resort.upkeep, venue),
    );
  };

  /** Selects something, or nothing, and tells the HUD what to show. */
  const select = (target: InspectTarget): void => {
    const view = viewOf(target);
    selected = view ? target : null;
    selectedOn = clock.day;
    options.onSelectionChange?.(view);
  };

  /**
   * What the simulation has this guest doing, for the live line.
   *
   * The wording is `selection.ts`'s and the facts are the router's; this is the
   * one place the two meet, which is why neither of them imports the other.
   */
  const errandFor = (person: number): Errand => {
    const { router } = current();
    return errandOf({
      visit: router.visitOf(person),
      goal: router.goalOf(person),
      home: router.homewardTo(person),
      asleep: router.isAsleep(person),
      beach: router.stayOf(person),
    });
  };

  /**
   * The inspector's live line for this frame, or null with no guest selected.
   *
   * Re-words the selection once a simulated day, so a guest's nights left count
   * down while they are being looked at; never per frame.
   */
  const inspectLine = (): string | null => {
    if (selected !== null && clock.day !== selectedOn) select(selected);
    const person = personOf(selected);
    if (person === null) return null;
    const { crowd, needs, guests } = current();
    return activityLine(crowd.crowd, needs, guests, person, errandFor(person));
  };

  const inspector = createInspectPointer({
    canvas,
    camera: () => handle.camera,
    armed: () => armedTool === null,
    people: () => current().crowd.crowd,
    aimHeight: AIM_HEIGHT,
    ground: build.ground,
    keyAt: (tile) => current().occupancy.keyAt(tile),
    onSelect: select,
  });

  /**
   * Tells the HUD what the plot is getting wrong, ranked.
   *
   * Once a simulated day out of the tick block, and on an edit that has settled;
   * see {@link factsNow}, which is emphatic about it not being a per-frame call.
   */
  const advise = (): void =>
    options.onAdviceChange?.(adviceFor(factsNow(current(), clock.weather)));

  /** Tells everything above the renderer that the resort underneath it changed. */
  const rebuilt = (): void => {
    clock.relight();
    onSceneChange?.(statsNow());
    advise();
  };

  /** How many resorts have been asked for; only the latest one is put on screen. */
  let requested = 0;

  /**
   * Prepares a resort off the main thread and swaps it in once it is ready.
   *
   * The resort on screen keeps drawing — and keeps taking edits — while the new
   * one is grown; those edits go with it when it is replaced, as do the
   * buildings still going up. An answer overtaken by a later request is
   * dropped rather than flashed on screen on its way past.
   */
  const regrow = async (asked: ResortParams, source: ResortSource): Promise<void> => {
    const request = ++requested;
    const prepared = await preparer.prepare(prepRequestFor(source, bench));
    if (request !== requested || !running) return;
    params = asked;
    // Whatever was going up goes with the plot it was going up on.
    build.abandon();
    // So does whatever was being looked at: the person index and the placement
    // key both name something on the old plot.
    select(null);
    // The resort swapped in has a crowd built on its own graph already.
    walkStaleAt = null;
    slot.replace(prepared);
    rebuilt();
  };

  const recorder = bench
    ? createBenchRecorder({
        bench,
        handle,
        stats: statsNow,
        litLamps: () => clock.litLamps,
      })
    : null;

  /**
   * Picks what is drawn coarse and what not at all, after the camera has settled
   * for the frame and before anything is drawn: the view this frame renders.
   */
  const chooseDetail = (): void => {
    const view = detail ? handle.detailView() : null;
    current().world.updateDetail(view);
    current().crowd.setView(view);
  };
  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;
    const frameStarted = performance.now();

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
    // A benchmark places nothing, so this never fires in one; the guard is here
    // so that stays true if a bench case ever does place something, because a
    // rebuild mid-run would put the crowd somewhere the run before it was not.
    if (walkStaleAt !== null && !bench && timeMs - walkStaleAt >= REANCHOR_DELAY_MS) {
      walkStaleAt = null;
      const resort = current();
      const { plan, plot, shore, terrain, crowd } = resort;
      const network = networkFor({
        plan,
        shore,
        terrain,
        // What is standing, hand edits included, rather than what was planned.
        paved: plot.paths,
        standing: [...plot.placements, ...plot.props],
      });
      // The venues and the router go with the graph: a node index means nothing
      // across a rebuild, and a bakery may have just been built or bulldozed.
      const wasStanding = resort.venues;
      resort.venues = venuesOn(plot.placements);
      resort.lodgings = lodgingsOn(plot.placements);
      resort.gateways = gatewaysOn(plot.placements);
      // By key rather than by index, because an index means nothing across a
      // rebuild: whatever is still standing keeps the dirt it had, and anything
      // just built starts clean. See `upkeep.ts`.
      resort.upkeep = carryUpkeep(resort.upkeep, wasStanding, resort.venues);
      resort.unreachable = strandedOn(resort.venues, network);
      resort.router.rebuild(resort.venues, resort.lodgings, resort.gateways, network);
      resort.staffRouter.rebuild(resort.venues, network);
      crowd.relocate(network);
      resort.staff.relocate(network);
      // Bulldozing the only restaurant should say so now rather than tomorrow
      // morning. The day's counters are left alone: what happened at the doors
      // this morning happened, and the venues that are still standing kept
      // their keys.
      advise();
    }

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    // Off the fixed step under a benchmark, exactly as everything below it is: a
    // clock driven by the frame's own delta is a scene that is somewhere else on
    // the same frame of two runs.
    const ticks = clock.advance(bench ? MAX_STEP : elapsed);
    // Whole simulated minutes, at most MAX_TICKS_PER_ADVANCE of them, so a tab
    // that was in the background does not run a week of decay in one frame.
    if (ticks > 0) lastShare = runTicks(current(), clock, ticks, lastShare, advise);
    // A benchmark walks the crowd by a fixed step rather than by the frame's
    // own: two runs are only comparable if the scene is in the same place on
    // the same frame of each, and the frame's `dt` is exactly what differs
    // between a fast machine and a slow one. See `crowd.ts`. The scale is
    // pinned to real time under one for the same reason, and the crowd walks
    // there even though a benchmark's clock is paused, or the run stops
    // measuring the crowd.
    //
    // Outside one the crowd walks at the clock's pace (`crowdRate.ts`), and a
    // paused resort stands still: **this line is what stops it**, by handing
    // over a frame of no time, and not `crowdScaleFor`, which is 1 while paused.
    // A crowd that walked while the clock was stopped filled every queue on the
    // plot and kept them full, since nobody is let out but on a tick.
    current().crowd.advance(
      crowdStep(bench !== null, clock.speed, elapsed),
      bench ? 1 : crowdScaleFor(clock.speed),
    );
    // The same step and the same scale as the guests': the staff walk the same
    // graph at the same pace, and a second population off a different clock
    // would be a second thing for a bench run to fail to replay.
    current().staff.advance(
      crowdStep(bench !== null, clock.speed, elapsed),
      bench ? 1 : crowdScaleFor(clock.speed),
    );
    // Off the same fixed step as the crowd under a benchmark, and for the same
    // reason: two runs only compare if the scene is in the same place on the
    // same frame of each. See `crowd.ts`.
    current().balloons.advance(bench ? MAX_STEP : elapsed, clock.balloonReadiness);
    // Likewise the bay, and for the third time the same reason: a run only
    // compares with the one before it if the boats are where they were.
    current().sea.advance(bench ? MAX_STEP : elapsed);
    // And the weather, for the fourth.
    advanceWeather(elapsed);
    // Off the same fixed step under a benchmark as everything else, and for the
    // same reason, even though a bench run places nothing and so never has a
    // site: the rule should not depend on that staying true.
    build.advance(bench ? MAX_STEP : elapsed);
    if (!bench) handle.controls.update();
    chooseDetail();
    const renderStarted = performance.now();
    handle.renderer.render(handle.scene, handle.camera);
    // Everything the main thread did for this frame, the render submission
    // included: WebGPU records and submits here and the GPU works afterwards.
    const frameEnded = performance.now();
    frameCost = sampleFrameCost(frameCost, timeMs, frameEnded - frameStarted);
    // Resolving drains the query pool, so once a frame gives one reading a frame.
    void handle.renderer.resolveTimestampsAsync().then((duration) => {
      if (typeof duration !== 'number' || duration <= 0) return;
      gpuMs = duration;
      recorder?.recordGpu(duration);
    });

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    const { world, crowd } = current();
    onFrame({
      fps: fpsState.fps,
      time: clock.time,
      clock: clock.label,
      activeLights: clock.litLamps,
      drawCalls: handle.renderer.info.render.drawCalls,
      triangles: handle.renderer.info.render.triangles,
      cpu: {
        latestMs: frameCost.latestMs,
        worstMs: frameCost.worstMs,
        renderMs: frameEnded - renderStarted,
      },
      gpuMs,
      detail: world.detailCounts,
      people: { drawn: crowd.drawnCount, total: crowd.count },
      shaderBuilds: handle.shaderBuilds(),
      inspect: inspectLine(),
    });

    recorder?.record(elapsed * 1000);
  });

  return {
    get benchResult() {
      return recorder?.result() ?? null;
    },
    get stats() {
      return statsNow();
    },
    get advice() {
      return adviceFor(factsNow(current(), clock.weather));
    },
    get params() {
      return params;
    },
    get cameraView() {
      return cameraView();
    },
    setCameraMode,
    setIsoDirection,
    setDetail(enabled) {
      // A bench run says in its URL which it measures; see `benchConfig.ts`.
      if (bench) return;
      detail = enabled;
    },
    turnCamera: (quarters) => setIsoDirection(turnDirection(handle.isoDirection, quarters)),
    lookAtTile,
    generate(next) {
      const asked = clampParams(next);
      return regrow(asked, { kind: 'generate', params: asked });
    },
    clear(next) {
      const asked = clampParams(next);
      // The seed goes along, so clearing is a random landscape rather than the
      // same one every time: a coast, a hill and a river off it. See
      // `emptyResortPlan`.
      return regrow(asked, { kind: 'clear', params: asked });
    },
    selectTool,
    setTime: clock.setTime,
    setSpeed: clock.setSpeed,
    setWeather: clock.setWeather,
    selectPerson: (person) => select({ person }),
    clearSelection: () => select(null),
    dispose() {
      running = false;
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener('resize', resize);
      cameraKeys.dispose();
      inspector.dispose();
      build.dispose();
      preparer.dispose();
      rain.dispose();
      current().dispose();
      handle.dispose();
      // Last: everything above is built over these, so nothing may still be
      // holding them when they go.
      disposeCatalogue(catalogue);
    },
  };
}
