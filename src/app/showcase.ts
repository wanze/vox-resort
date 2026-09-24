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
import { arrivalsFor, ratingFor, type Rating } from '../features/sim/domain/rating';
import { carryUpkeep, cleanliness, createUpkeep, type Upkeep } from '../features/sim/domain/upkeep';
import {
  onDuty,
  rosterFor,
  shiftChange,
  STAFF_ROLES,
  staffPool,
  type Roster,
  type Staff,
  type Workplaces,
} from '../features/sim/domain/staff';
import {
  createStaffRouter,
  meanCleanliness,
  type StaffRouter,
} from '../features/sim/domain/staffRouter';
import {
  arrivalsDueBy,
  checkInDue,
  freeBedsOn,
  runCheckIn,
  wavesDue,
} from '../features/sim/domain/checkIn';
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
import {
  createCrowd,
  holdAt,
  MAX_STEP,
  putOnPlot,
  takeOffPlot,
  type Crowd,
} from '../features/crowd/domain/crowd';
import {
  crowdOverrideFrom,
  crowdSizeFor,
  crowdSizeForArea,
} from '../features/crowd/domain/crowdSize';
import { walkNetworkFor, type WalkNetwork } from '../features/crowd/domain/walkNetwork';
import { seatSpotsFor } from '../features/crowd/domain/seating';
import {
  bedCount,
  checkOutParty,
  createGuests,
  homelessCount,
  presentCount,
  rehome,
  type Guests,
} from '../features/guests/domain/guests';
import type { Home } from '../features/guests/domain/homes';
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

// Precomputed: read once per object placed, and a drag places one per pointer move.
const VOXELS_PER_TYPE = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.voxels.length]));

const CROWD_OVERRIDE = crowdOverrideFrom(globalThis.location?.search ?? '');

// Seeds are fixed so bench runs replay the same scene, and separate so retuning
// one draw never reshuffles another (more berths must not move the fleet).
const CROWD_SEED = 1;

const BALLOON_COUNT = 36;

const BALLOON_SEED = 2;

const CRAFT_COUNT = 12;

// Capped by the hut: a wider rack would moor boats among the swimmers.
const HIRE_COUNT = 6;

const SEA_SEED = 3;

const CREW_SEED = 4;

const GUEST_SEED = 5;

const NEEDS_SEED = 6;

const DWELL_SEED = 7;

const ARRIVALS_SEED = 8;

const STAFF_SEED = 9;

// 13 because it opens on three clear days; 10 opened day 0, and so every bench run, on rain.
const WEATHER_SEED = 13;

const RAIN_SEED = 4;

const AIM_HEIGHT = hipHeight(Math.max(...PEOPLE_MODELS.map((model) => model.height)));

// Late afternoon, so day 0 opens in daylight.
const INITIAL_TIME = 0.62;

export interface ShowcaseStats {
  readonly backend: 'webgpu' | 'webgl2';
  readonly typeCount: number;
  readonly objectCount: number;
  readonly propCount: number;
  readonly pathCount: number;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly chunkCount: number;
  // Cast shadows are left out so this stays comparable with the mesher's output.
  readonly uniqueTriangleCount: number;
  readonly unmergedTriangleCount: number;
  readonly drawnTriangleCount: number;
  readonly sceneVoxelCount: number;
  readonly meshedVoxelCount: number;
  readonly shadowCount: number;
  readonly occluderCount: number;
  readonly lightCount: number;
  readonly litLightCount: number;
  readonly lightGridCells: number;
  readonly lightGridBytes: number;
  readonly lightBakeMs: number;
  readonly skyBakeMs: number;
  readonly dveMs: number;
  readonly meshMs: number;
  readonly startupMs: number;
  readonly meshedInWorker: boolean;
  // A blocked main thread paints none, so this, not startupMs, says whether the page stayed alive.
  readonly startupFrames: number;
  readonly beds: { readonly total: number; readonly taken: number };
  readonly asleep: number;
  readonly venues: { readonly inside: number; readonly waiting: number };
  readonly routeFields: number;
  readonly guests: { readonly present: number; readonly capacity: number };
  readonly staff: { readonly total: number; readonly working: number; readonly roster: Roster };
  readonly cleanliness: number;
  readonly rating: number;
  readonly weather: Weather;
}

// Also published as window.__voxBench, which scripts/bench.ts reads.
export interface BenchResult {
  readonly config: BenchConfig;
  readonly backend: 'webgpu' | 'webgl2';
  readonly pixelRatio: number;
  readonly drawingBufferSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly activeLights: number;
  readonly scene: ShowcaseStats;
  readonly drawn: { readonly drawCalls: number; readonly triangles: number };
  readonly stats: FrameStats;
  // GPU timestamps keep meaning something once frames come in under the refresh interval.
  readonly gpu: FrameStats | null;
}

export type { FrameUpdate };

export interface ShowcaseOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onFrame: (update: FrameUpdate) => void;
  readonly onSceneChange?: (stats: ShowcaseStats) => void;
  readonly onToolChange?: (tool: BuildTool | null) => void;
  readonly onCameraChange?: (view: CameraView) => void;
  readonly onSelectionChange?: (selection: SelectionView | null) => void;
  readonly onAdviceChange?: (advice: readonly Advice[]) => void;
  readonly onWeatherChange?: (weather: Weather) => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface CameraView {
  readonly mode: CameraMode;
  readonly direction: CompassDirection;
  readonly detail: boolean;
}

export interface Showcase {
  readonly stats: ShowcaseStats;
  readonly advice: readonly Advice[];
  readonly benchResult: BenchResult | null;
  readonly params: ResortParams;
  readonly cameraView: CameraView;
  readonly open: boolean;
  setOpen(open: boolean): void;
  setCameraMode(mode: CameraMode): void;
  setIsoDirection(direction: CompassDirection): void;
  setDetail(enabled: boolean): void;
  turnCamera(quarters: number): void;
  lookAtTile(tile: { readonly tileX: number; readonly tileZ: number }): void;
  generate(params: ResortParams): Promise<void>;
  clear(params: ResortParams): Promise<void>;
  selectTool(tool: BuildTool | null): void;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  setWeather(weather: Weather | null): void;
  selectPerson(person: number): void;
  clearSelection(): void;
  dispose(): void;
}

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

function scratchForModels(): ScratchLayout {
  const scratch = scratchLayoutFor(
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
  readonly geometries: readonly ModelGeometry[];
  // Kept out of the instanced world: a person is not a placement and must never be stood on the
  // plot.
  readonly people: readonly ModelGeometry[];
  readonly staff: readonly ModelGeometry[];
  readonly sky: readonly ModelGeometry[];
  readonly sea: readonly ModelGeometry[];
  readonly dveMs: number;
  readonly meshMs: number;
  readonly threaded: boolean;
}

const PEOPLE_IDS: ReadonlySet<string> = new Set(PEOPLE_MODELS.map((model) => model.id));

// By id: the people registry's order is the art's to change.
const CHILD_VARIANT = PEOPLE_MODELS.findIndex((model) => model.id === 'child');
if (CHILD_VARIANT < 0) {
  throw new Error('No person model has the id "child"; the guests have no child to draw.');
}

// Kept apart: a guest's variant indexes PEOPLE_MODELS, so a staff model there would be dealt to a
// guest.
const STAFF_IDS: ReadonlySet<string> = new Set(STAFF_MODELS.map((model) => model.id));

// A staff variant indexes the meshed staff list, which is in STAFF_SOURCES order.
if (STAFF_MODELS.length < STAFF_ROLES.length) {
  throw new Error('Fewer staff models than staff roles; somebody would be drawn as nobody.');
}

const SKY_IDS: ReadonlySet<string> = new Set(SKY_MODELS.map((model) => model.id));

const SEA_IDS: ReadonlySet<string> = new Set(SEA_MODELS.map((model) => model.id));

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
    // In registry order: a person's variant indexes into it.
    people: geometries.filter((model) => PEOPLE_IDS.has(model.id)),
    staff: geometries.filter((model) => STAFF_IDS.has(model.id)),
    sky: geometries.filter((model) => SKY_IDS.has(model.id)),
    sea: geometries.filter((model) => SEA_IDS.has(model.id)),
    dveMs: meshed.dveMs,
    meshMs: Math.round(performance.now() - started),
    threaded: meshed.threaded,
  };
}

const STARTING_PARAMS: ResortParams = {
  tilesX: 112,
  tilesZ: 100,
  density: 0.7,
  seed: 1,
};

function startingParams(bench: BenchConfig | null): ResortParams {
  if (bench) return STARTING_PARAMS;
  return { ...STARTING_PARAMS, seed: Math.floor(Math.random() * 0xffffffff) };
}

// A re-laid slab appears at once: paving re-stands under one key, and a slab missing for a moment
// is a hole in the path.
function buildTimeOf(placement: Placement, lifted?: Placement): number {
  if (lifted) return 0;
  const { model } = objectTypeById(placement.id);
  return buildSeconds({
    category: model.category,
    height: model.height,
    voxelCount: model.voxels.length,
  });
}

interface BakedLighting {
  readonly live: LiveLightGrid;
  readonly sky: LiveSkyVisibility;
  readonly volume: BakedLightVolume;
}

// A lamp outside the grid re-bakes nothing and is left out of litCount, which the HUD reads.
function splatLights(baked: BakedLighting, placement: Placement): void {
  for (const anchor of anchorsFor(placement, lightsOf(placement))) {
    const edit = baked.live.add(anchor);
    if (edit.region) baked.volume.update(edit.region, edit.scale);
  }
}

function unsplatLights(baked: BakedLighting, placement: Placement): void {
  for (const anchor of anchorsFor(placement, lightsOf(placement))) {
    const edit = baked.live.remove(anchor.key);
    if (edit.region) baked.volume.update(edit.region, edit.scale);
  }
}

// Separate from splatLights: lamps and sky visibility write different channels, and most objects
// only do one.
function splatSkyVisibility(baked: BakedLighting, placement: Placement): void {
  const region = baked.sky.add(occluderOf(placement));
  if (region) baked.volume.updateSkyVisibility(region);
}

function unsplatSkyVisibility(baked: BakedLighting, placement: Placement): void {
  const region = baked.sky.remove(placement.key);
  if (region) baked.volume.updateSkyVisibility(region);
}

interface Lighting {
  readonly anchorCount: number;
  readonly litCount: number;
  readonly spec: LightGridSpec | null;
  readonly volume: BakedLightVolume | null;
  readonly bakeMs: number;
  readonly skyBakeMs: number;
  readonly occluderCount: number;
  add(placement: Placement): void;
  // A rail claims no ground, so it takes no sky away.
  light(placement: Placement): void;
  unlight(placement: Placement): void;
  unshade(placement: Placement): void;
}

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

// The grid is sized once for the whole plot and never resized.
// Lamps own three channels and sky visibility the fourth, so neither re-bakes the other.
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

interface Resort {
  readonly plot: Plot;
  readonly lighting: Lighting;
  readonly world: InstancedWorld;
  readonly shadows: BlobShadowField;
  // Per resort: its materials are bound to this plot's baked light volume.
  readonly construction: ConstructionField;
  readonly crowd: CrowdField;
  // A second crowd: a guest's variant indexes the guest models, and HUD counts are about guests.
  readonly staff: CrowdField;
  // Rebuilt rather than updated on an edit: its flow fields are indexed by node, and an edit
  // renumbers nodes.
  readonly staffRouter: StaffRouter;
  readonly staffPool: Staff;
  roster: Roster;
  // Read late by the staff router, so an edit swaps it rather than writing into it.
  duty: Uint8Array;
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  // Replaced wholesale on an edit rather than patched, so it cannot drift from what stands.
  venues: readonly Venue[];
  lodgings: readonly Lodging[];
  gateways: readonly Gateway[];
  // Dirt is carried across by key when venues are replaced, so paving one tile does not scrub the
  // plot.
  upkeep: Upkeep;
  unreachable: ReadonlySet<string>;
  rating: Rating;
  // Gates arrivals only: a closed resort still rates and says goodbye to the guests it has.
  open: boolean;
  // Sized once a day by the rating and let in over the waves. A wave nobody could come in is
  // counted as admitted, so its share is not carried into the next one.
  arrivalsPlanned: number;
  arrivalsAdmitted: number;
  // Per resort: two plots must not share a sequence.
  readonly arrivals: () => number;
  beds: { readonly total: number; readonly taken: number };
  // Rebuilt rather than updated on an edit: its flow fields are indexed by node, and an edit
  // renumbers nodes.
  readonly router: Router;
  readonly balloons: BalloonField;
  readonly sea: SeaField;
  readonly occupancy: TileOccupancy;
  readonly plan: ResortPlan;
  // The only writer of plot.rails; rails claim no tile, so they are indexed here instead of in
  // occupancy.
  readonly railIndex: RailIndex;
  readonly shore: Shore | null;
  readonly terrain: Terrain;
  readonly bounds: WorldBounds;
  readonly framing: CameraFraming;
  dispose(): void;
}

// Off the layout's placements: a benchmark tiles the plan ninefold and would sleep nine times its
// guests.
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
      // The key breaks ties so two runs house guests the same way.
      .toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key))
  );
}

// The graph is passed in so the router and the crowd share one node numbering.
function crowdFor(parts: {
  readonly network: WalkNetwork;
  readonly people: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
  readonly guests: Guests;
  readonly population: number;
  readonly routeOf: (person: number, at: number) => number;
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
      roamsBeach: false,
      seed: CROWD_SEED,
    }),
    models: parts.people,
    lightVolume: parts.lightVolume,
  });
}

function staffCrowdFor(parts: {
  readonly network: WalkNetwork;
  readonly models: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
  readonly staff: Staff;
  readonly routeOf: (worker: number, at: number) => number;
}): CrowdField {
  return buildCrowdField({
    crowd: createCrowd({
      network: parts.network,
      count: parts.staff.count,
      // Never zero: createCrowd deals a variant per body and would divide by zero.
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

// Long enough that a drag costs one rebuild, short enough to read as immediate.
const REANCHOR_DELAY_MS = 250;

// paved and standing are passed in: the first build reads layout.*, which a benchmark's tiled
// copies must not be counted from, and a rebuild after an edit reads plot.* with hand edits.
function networkFor(parts: {
  readonly plan: ResortPlan;
  readonly shore: Shore | null;
  readonly terrain: Terrain;
  readonly paved: readonly Placement[];
  readonly standing: readonly Placement[];
}): WalkNetwork {
  return walkNetworkFor({
    paved: parts.paved,
    levelOf: (tileX, tileZ) => parts.terrain.levelOf(tileX, tileZ),
    shore: parts.shore,
    tilesX: parts.plan.tilesX,
    // Asked of the ground exactly as layoutResort asks, so the crowd walks the deck the layout
    // stood.
    bridged: (tileX, tileZ) =>
      parts.terrain.surfaceOf(tileX, tileZ) === 'water' && !parts.terrain.isSea(tileX, tileZ),
    seats: seatSpotsFor(parts.standing.map(seatSiteOf)),
    obstacles: parts.standing,
  });
}

function balloonsFor(parts: {
  readonly shore: Shore | null;
  readonly sky: readonly ModelGeometry[];
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

// An empty ground rather than null, so nothing downstream needs a case for an inland resort.
function seaGroundOf(shore: Shore | null, rental: Rental | null): SailingGround {
  if (!shore) return { westX: 0, eastX: 0, seawardZ: 0, landwardZ: () => 0 };
  return sailingGroundFor(shore, rental);
}

const SEA_BERTHS = SEA_MODELS.map(berthsOf);

// Half the longer side, since a hull turns.
const SEA_RADII = SEA_MODELS.map((model) => Math.max(model.width, model.depth) / 2);

const driftingVariants = (sea: readonly ModelGeometry[]): number[] =>
  sea
    .map((_, variant) => variant)
    .filter((variant) => variant !== BUOY_INDEX && variant !== PEDALO_INDEX);

// Moorings are worked out beforehand because the lamp bake needs them before there is a sea.
function seaFor(parts: {
  readonly shore: Shore | null;
  readonly paved: readonly Placement[];
  readonly placements: readonly Placement[];
  readonly moorings: readonly Mooring[];
  readonly sea: readonly ModelGeometry[];
  readonly people: readonly ModelGeometry[];
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
    hire: rental ? { count: HIRE_COUNT, variant: PEDALO_INDEX, rental } : null,
    ground,
    radii: SEA_RADII,
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

interface ResortArt {
  // Late-bound: the first resort is built before the clock is.
  readonly tickOfDay: () => number;
  readonly weather: () => Weather;
  readonly geometries: readonly ModelGeometry[];
  readonly people: readonly ModelGeometry[];
  readonly staff: readonly ModelGeometry[];
  readonly sky: readonly ModelGeometry[];
  readonly sea: readonly ModelGeometry[];
}

// The volume is wired up before the world, because the world's materials bind to it.
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
  // Only a plot with no paving is sized by its area and starts away: a generated plot's opening
  // scene and the benchmark stay as they were.
  const building = plot.layout.paths.length === 0;
  const population = building
    ? crowdSizeForArea(plan.tilesX, plan.tilesZ, CROWD_OVERRIDE)
    : crowdSizeFor(plot.layout.paths.length, CROWD_OVERRIDE);
  const guests = createGuests({
    count: population,
    homes: homesOn(plot.layout.placements),
    variants: parts.people.length,
    childVariant: CHILD_VARIANT,
    seed: GUEST_SEED,
    away: building,
  });
  const needs = createNeeds(guests, NEEDS_SEED);
  const happiness = createHappiness(population);
  const arrivals = createRandom(ARRIVALS_SEED);
  // Off the layout's paving, not the plot's: a benchmark tiles the plan ninefold onto ground
  // the elevation and the shore know nothing about.
  const network = networkFor({
    plan,
    shore,
    terrain,
    paved: plot.layout.paths,
    // Props too: the layout stands benches as props, so placements alone have nothing to sit on.
    standing: [...plot.layout.placements, ...plot.layout.props],
  });
  const venues = venuesOn(plot.layout.placements);
  const lodgings = lodgingsOn(plot.layout.placements);
  const gateways = gatewaysOn(plot.layout.placements);
  const unreachable = strandedOn(venues, network);
  const upkeep = createUpkeep(venues.length);
  const beds = bedCount(guests);
  // The router reads crowd positions and the crowd is built with the router, so one is bound late.
  let crowdField: CrowdField | null = null;
  const router = createRouter({
    guests,
    needs,
    venues,
    lodgings,
    gateways,
    network,
    onLeave: (person) => {
      const left = checkOutParty(guests, guests.party[person]!);
      const people = crowdField!.crowd;
      for (const member of left) {
        // Every member: a visit left standing would walk an empty body out of the door.
        router.forget(member);
        takeOffPlot(people, member, people.x[member]!, people.y[member]!, people.z[member]!);
      }
    },
    tickOfDay: parts.tickOfDay,
    weather: parts.weather,
    // Safe: the crowd is built on the next statement, and nothing calls the router before a frame.
    crowd: () => crowdField!.crowd,
    // Late-bound: an edit replaces the upkeep, and a stale one would soil venues that no longer
    // stand.
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
  // The pool is meshed once per resort; the roster follows the plot, putting bodies on and off it.
  const employed = staffPool();
  const roster = rosterFor({ venues: venues.length });
  const duty = onDuty(employed, roster);
  let staffField: CrowdField | null = null;
  const staffRouter = createStaffRouter({
    staff: employed,
    venues,
    network,
    upkeep: () => resort.upkeep,
    crowd: () => staffField!.crowd,
    weather: parts.weather,
    duty: () => resort.duty,
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
  const workers = staff.crowd;
  for (let worker = 0; worker < employed.count; worker++) {
    if (duty[worker] === 1) continue;
    takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
  }
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
    staffPool: employed,
    roster,
    duty,
    guests,
    needs,
    happiness,
    venues,
    lodgings,
    gateways,
    upkeep,
    unreachable,
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    // A plot with no paving is a building site; a generated one is a resort already running,
    // and the benchmark must see it running.
    open: !building,
    arrivalsPlanned: 0,
    arrivalsAdmitted: 0,
    beds: { total: beds.beds, taken: beds.taken },
    router,
    arrivals,
    balloons,
    sea,
    shore,
    terrain,
    // The sea is not in it: what water takes is a rule about the object, not a held tile.
    // Off the layout's lists: a benchmark's tiled copies would all claim their originals' tiles.
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

interface ResortSlot {
  readonly current: () => Resort;
  attach(handle: SceneHandle): void;
  replace(prepared: PreparedResort): Resort;
}

function createResortSlot(parts: ResortArt & { readonly prepared: PreparedResort }): ResortSlot {
  let resort = buildResort(parts);
  // The first resort is built before the renderer, because the scene is created around its light
  // volume.
  let scene: SceneHandle | null = null;

  return {
    current: () => resort,
    attach(handle) {
      scene = handle;
    },
    replace(prepared) {
      // Disposed last: the ground is bound to the light volume, and freeing it first leaves a
      // material holding freed textures.
      const previous = resort;
      resort = buildResort({ ...parts, prepared });
      scene?.scene.remove(previous.world.group);
      scene?.scene.remove(previous.shadows.group);
      scene?.scene.remove(previous.construction.group);
      scene?.scene.remove(previous.crowd.group);
      // Without this, the previous plot's cleaners keep walking over the new one.
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

// One pass rather than a concatenated copy: read on every object placed, and a drag places one per
// pointer move.
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

interface StartupCost {
  readonly startupMs: number;
  readonly startupFrames: number;
}

function sceneStats(parts: {
  readonly handle: SceneHandle;
  readonly resort: Resort;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupCost;
  readonly weather: Weather;
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
    // Shadows and the crowd included, so the count matches what a bench reads off the renderer.
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
      total: parts.resort.duty.reduce((sum, each) => sum + each, 0),
      working: parts.resort.staffRouter.workingCount,
      roster: parts.resort.roster,
    },
    cleanliness: meanCleanliness(parts.resort.upkeep, parts.resort.venues.length),
    rating: parts.resort.rating.stars,
    weather: parts.weather,
    ...parts.startup,
  };
}

// Written only on a change: this runs per tick and the share moves a few times a night.
function lightRooms(resort: Resort, last: number | null): number {
  const share = occupiedShare(resort.beds.total, resort.router.asleepCount);
  if (share !== last) resort.world.setOccupiedShare(share);
  return share;
}

function runTicks(
  resort: Resort,
  clock: Clock,
  ticks: number,
  lastShare: number | null,
  advise: () => void,
): number {
  decayNeeds(resort.needs, resort.guests, ticks, weatherEffect(clock.weather));
  // One tick at a time: a place freed on the first tick must let somebody in on the first.
  for (let tick = ticks; tick > 0; tick--) {
    resort.router.tick(clock.ticks - tick + 1);
    // Same tick as the guests', so a venue cleaned on the first tick is clean for whoever decides
    // next.
    resort.staffRouter.tick(clock.ticks - tick + 1);
  }
  // After the ticks, so a guest is charged for the line they were actually in.
  ageHappiness(
    resort.happiness,
    resort.needs,
    resort.guests,
    (person) => resort.router.isWaitingAt(person),
    ticks,
  );
  // Over the whole run of ticks: twelve ticks in a frame must not step over the check-in hour.
  if (checkInDue(clock.ticks - ticks + 1, clock.ticks)) {
    runDay(resort, clock.day);
    // After the coaches and before the counters are wiped, which the advice reads.
    advise();
    resort.router.forgetTheDay();
  }
  admitLaterWaves(resort, clock, ticks);
  return lightRooms(resort, lastShare);
}

function workplacesOn(resort: Resort): Workplaces {
  return { venues: resort.venues.length };
}

// Stood at the node first, or a body dealt on an empty plot walks in from the origin.
function enterAt(crowd: Crowd, i: number, node: number): void {
  const at = crowd.network.nodes[node];
  if (at) holdAt(crowd, i, at.x, at.y, at.z, crowd.heading[i] ?? 0);
  putOnPlot(crowd, i, node);
}

// After the relocate, so the arrival node is on the graph the staff crowd now walks. With no
// entrance yet they start at node 0: anywhere on the paving beats waiting for a gate.
function staffTheResort(resort: Resort): void {
  const roster = rosterFor(workplacesOn(resort));
  const duty = onDuty(resort.staffPool, roster);
  const workers = resort.staff.crowd;
  const shift = shiftChange(duty, workers.offPlot);
  for (const worker of shift.leaving) {
    takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
  }
  const arrival = Math.max(0, resort.router.arrivalNode);
  // No paving yet: they are owed their shift at the next edit that lays some.
  const paved = workers.network.edges.length > 0;
  if (paved) for (const worker of shift.starting) enterAt(workers, worker, arrival);
  resort.roster = roster;
  resort.duty = duty;
}

function strandedOn(venues: readonly Venue[], network: WalkNetwork): ReadonlySet<string> {
  const index = nodeIndexFor(network);
  return unreachableOn(venues, (venue) => doorsFor(venue, index, network));
}

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

// Once a simulated day and on an edit, never per frame: it walks the guest list twice.
function factsNow(resort: Resort, weather: Weather): ResortFacts {
  const { guests, router } = resort;
  const effect = weatherEffect(weather);
  return {
    venues: resort.venues,
    lodgings: resort.lodgings,
    present: presentCount(guests),
    homeless: homelessCount(guests),
    bedsFree: guests.freeBeds.reduce((free, home) => free + home, 0),
    wanting: wantingOn(resort),
    balks: router.dayBalks(),
    visits: router.dayVisits(),
    unreachable: resort.unreachable,
    open: resort.open,
    entrance: router.arrivalNode >= 0,
    reception: router.receptionReachable,
    bedsTotal: resort.beds.total,
    // By key: advice names a building, and indices change on the next edit.
    cleanliness: new Map(
      resort.venues.map((venue, index) => [venue.key, cleanliness(resort.upkeep, index)]),
    ),
    // The router's own isOpenIn, so the panel and the door agree about what is shut.
    closed: new Set(
      resort.venues
        .filter((venue) => !isOpenIn(shelterOf(venue), effect))
        .map((venue) => venue.key),
    ),
  };
}

// The rating comes first, so the morning coach is sized by the resort the current guests
// experienced.
function runDay(resort: Resort, day: number): void {
  const beds = bedCount(resort.guests);
  resort.rating = ratingFor({
    happiness: meanHappiness(resort.happiness, resort.guests),
    present: presentCount(resort.guests),
    housed: beds.taken,
    cleanliness: meanCleanliness(resort.upkeep, resort.venues.length),
  });
  resort.arrivalsPlanned = arrivalsFor(resort.rating, freeBedsOn(resort.guests));
  resort.arrivalsAdmitted = 0;
  admitWave(resort, day, 0);
  sendDepartures(resort, day);
  const after = bedCount(resort.guests);
  resort.beds = { total: after.beds, taken: after.taken };
}

// The first wave is the day's own check-in, run by runDay with the rating it is sized by.
function admitLaterWaves(resort: Resort, clock: Clock, ticks: number): void {
  for (const wave of wavesDue(clock.ticks - ticks + 1, clock.ticks)) {
    if (wave > 0) admitWave(resort, clock.day, wave);
  }
}

// No reachable gate or desk means no arrivals, which is a real state the advice reports.
const canArrive = (resort: Resort): boolean =>
  resort.open && resort.router.arrivalNode >= 0 && resort.router.receptionReachable;

function admitWave(resort: Resort, day: number, wave: number): void {
  const due = arrivalsDueBy(resort.arrivalsPlanned, wave);
  const room = due - resort.arrivalsAdmitted;
  if (!canArrive(resort) || room <= 0) {
    resort.arrivalsAdmitted = Math.max(resort.arrivalsAdmitted, due);
    return;
  }
  const arrived = runCheckIn({
    guests: resort.guests,
    needs: resort.needs,
    happiness: resort.happiness,
    rating: resort.rating,
    day,
    random: resort.arrivals,
    room,
  });
  for (const person of arrived) resort.router.admit(person, resort.router.arrivalNode);
  resort.arrivalsAdmitted += arrived.length;
  const beds = bedCount(resort.guests);
  resort.beds = { total: beds.beds, taken: beds.taken };
}

// Once a day, not per tick; asking twice is free, so a guest who could not reach a gate is asked
// again tomorrow.
function sendDepartures(resort: Resort, day: number): void {
  const { guests } = resort;
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    if (guests.arrivedOn[person]! + guests.nights[person]! >= day) continue;
    resort.router.sendHome(person);
  }
}

interface Clock {
  readonly time: number;
  readonly day: number;
  readonly weather: Weather;
  readonly forcedWeather: Weather | null;
  readonly tickOfDay: number;
  readonly ticks: number;
  readonly label: string;
  readonly speed: SimSpeed;
  readonly litLamps: number;
  readonly balloonReadiness: number;
  advance(elapsedSeconds: number): number;
  relight(): void;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  // Kept on the clock, not in weather.ts, so weatherOn stays pure; it is not saved.
  setWeather(weather: Weather | null): void;
}

function createClock(handle: SceneHandle, resort: () => Resort, startTime: number): Clock {
  let clock: SimClock = createSimClock(0, startTime);
  let time = timeOf(clock);
  let forced: Weather | null = null;
  const weatherNow = (): Weather => forced ?? weatherOn(dayOf(clock), WEATHER_SEED);
  const overcastNow = (): number => weatherEffect(weatherNow()).overcast;
  // Real seconds, not simulated: the clock opens paused and a storm must still flash.
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
    // Overcast and flash are in the guard too: the weather turns at midnight even while paused,
    // and a flash lasts under half a second.
    if (time === applied && overcast === appliedOvercast && flash === appliedFlash) return;
    sky = flashSky(overcastSky(skyStateFor(time), overcast), flash);
    handle.applySky(sky);
    resort().lighting.volume?.setLampFactor(sky.lampFactor);
    resort().world.setLampFactor(sky.lampFactor);
    resort().shadows.applySky(sky);
    // The pools use the sea's shader, so they need the sky too.
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
      // Flights already in the air finish, so a shower at dusk empties the sky gradually.
      return isWet(weatherNow()) ? 0 : releaseStrength(time);
    },
    relight() {
      // A new resort's volume and blobs start at zero whatever the time of day.
      applied = null;
      appliedOvercast = null;
      apply();
      // Otherwise its windows open on the previous plot's sleeping share.
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
      // Applied now: pinning the weather while paused is what the button is for.
      apply();
    },
  };
}

function createStatsReader(parts: {
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupTracker;
  readonly mountStarted: number;
  readonly weather: () => Weather;
  readonly rain: RainField;
}): () => ShowcaseStats {
  const startup: StartupCost = {
    startupMs: Math.round(performance.now() - parts.mountStarted),
    startupFrames: parts.startup.frames(),
  };
  parts.startup.stop();
  return () => sceneStats({ ...parts, resort: parts.resort(), weather: parts.weather(), startup });
}

interface BenchRecorder {
  readonly record: (frameMs: number) => void;
  readonly recordGpu: (durationMs: number) => void;
  readonly result: () => BenchResult | null;
}

// Published as window.__voxBench, which scripts/bench.ts reads.
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

function listFor(plot: Plot, id: string): Placement[] {
  return plot[listOf(id)];
}

// Damping would nudge the camera for the first second, and runs must compare on the same pixels.
// Mode changes are refused during a bench: every preset and recorded number is perspective.
function pinCamera(handle: SceneHandle): void {
  handle.controls.enabled = false;
  handle.controls.enableDamping = false;
}

interface EditMode {
  select(tool: BuildTool | null): void;
  advance(dt: number): void;
  abandon(): void;
  readonly ground: PickGround;
  placementOf(key: string): Placement | undefined;
  dispose(): void;
}

// Occupancy keeps the layout's overlap check live, so a hover costs a map lookup per footprint
// tile.
function createEditMode(parts: {
  readonly canvas: HTMLCanvasElement;
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly geometries: readonly ModelGeometry[];
  readonly onChange: () => void;
  // Placing counts too: the ground under anything standing is drawn square.
  readonly onGroundChange: () => void;
  readonly onCancel: () => void;
  readonly onLift: (placement: Placement) => void;
}): EditMode {
  const { canvas, handle, resort, onChange, onCancel } = parts;
  const ghost = createPlacementGhost(parts.geometries);
  handle.scene.add(ghost.group);

  // The pointer outlives every resort, so it forwards to whichever one is standing.
  const occupancy: TileOccupancy = {
    isFree: (footprint) => resort().occupancy.isFree(footprint),
    keyAt: (tile) => resort().occupancy.keyAt(tile),
    claim: (footprint, key) => resort().occupancy.claim(footprint, key),
    release: (footprint, key) => resort().occupancy.release(footprint, key),
    get size() {
      return resort().occupancy.size;
    },
  };

  // Forwarded too: the ground itself moves under the pointer.
  const ground: PickGround = {
    levelOf: (tileX, tileZ) => resort().terrain.levelOf(tileX, tileZ),
    get maxLevel() {
      return resort().terrain.maxLevel;
    },
  };

  const catalogue = OBJECT_TYPES.map(layoutItemFor);
  const pavingItems = catalogue.filter((item) => isPaving(item));
  const pavingItem = (id: string): LayoutItem | null =>
    pavingItems.find((item) => item.id === id) ?? null;
  const pavedWith = pavedGroundOf(occupancy, pavingItems);
  const paving: PavingRules = {
    pavedWith,
    levelOf: ground.levelOf,
    // Sand is asked of the ground, not the shore, so a hand-drawn dune path gets decking like a
    // generated one.
    isSand: (tileX, tileZ) => resort().terrain.surfaceOf(tileX, tileZ) === 'sand',
    isWater: (tileX, tileZ) => resort().terrain.surfaceOf(tileX, tileZ) === 'water',
    // The base, not the tile as it stands: a river gets a bridge and the bay gets a pier.
    isSea: (tileX, tileZ) => resort().terrain.isSea(tileX, tileZ),
    decking: pavingItem(BOARDWALK_ID),
    pier: pavingItem(JETTY_ID),
    bridge: pavingItem(BRIDGE_ID),
    bridgeRamp: pavingItem(BRIDGE_RAMP_ID),
    stairs: pavingItem(STAIRS_ID),
    flagstones: pavingItem(PATH_ID),
  };

  // Standing rails come from the rail index: rails are not in occupancy, and scanning the plot per
  // edit is too slow on a drag.
  const handrails: HandrailRules = {
    pavedWith,
    levelOf: ground.levelOf,
    isWater: paving.isWater,
    isSpan: raisedProvider(paving),
    models: railModelsIn(catalogue),
    standing: (tileX, tileZ) => resort().railIndex.at(tileX, tileZ),
  };

  // Naming the holder rather than counting: otherwise arming one tool while another is armed
  // can hand the button back to the camera with a tool still in hand.
  let holder: BuildTool['kind'] | null = null;
  const lendLeftButton =
    (who: BuildTool['kind']) =>
    (taken: boolean): void => {
      if (taken) holder = who;
      else if (holder === who) holder = null;
      handle.takeLeftButton(holder !== null);
    };

  const changeRails = (stand: readonly Placement[], lift: readonly Placement[]): void => {
    const { world, lighting, railIndex } = resort();
    for (const rail of lift) {
      world.remove(rail.key);
      lighting.unlight(rail);
      railIndex.remove(rail);
    }
    // Lifted first, so edge rails and a balustrade never stand at once and a re-stood lantern goes
    // out before it is lit.
    for (const rail of stand) {
      world.add(rail);
      lighting.light(rail);
      railIndex.add(rail);
    }
    onChange();
  };

  // Also lifts the slab a stair flight replaces, or the tile would be double-booked.
  const lift = (placement: Placement): void => {
    const { plot, world, lighting, shadows } = resort();
    parts.onLift(placement);
    occupancy.release(placement, placement.key);
    // A building still going up was never raised, so cancelling its site is all of taking it down.
    if (cancelSite(placement.key)) {
      const laid = listFor(plot, placement.id);
      const at = laid.findIndex((standing) => standing.key === placement.key);
      if (at !== -1) laid.splice(at, 1);
      return;
    }
    world.remove(placement.key);
    lighting.unlight(placement);
    // Without this, every pass over a re-laid bridge deck stacks another shading box under the same
    // key.
    lighting.unshade(placement);
    // Likewise, a re-laid bridge would otherwise stack a shadow quad per pass.
    shadows.remove(placement.key);
    const laid = listFor(plot, placement.id);
    const at = laid.findIndex((standing) => standing.key === placement.key);
    if (at !== -1) laid.splice(at, 1);
  };

  // Only over a terrace drop: rebuilding the terrain per tile of a flat drag is too costly.
  const reshapesGround = (placement: Placement): boolean =>
    footprintTiles(placement).some((tile) => overlooksDrop(resort().terrain, tile.x, tile.z));

  // Deferred until finished: blob shadows are sized from full height, and lanterns must not burn
  // over a foundation.
  const raise = (placement: Placement): void => {
    const { world, lighting, shadows } = resort();
    world.add(placement);
    const blob = blobOf(placement);
    if (blob) shadows.add(blob);
    lighting.add(placement);
  };

  let sites: readonly ConstructionSite[] = [];

  const redrawSites = (): void => {
    const { construction } = resort();
    for (const site of sites) {
      construction.show(site.placement, site.height, revealHeightOf(progressOf(site), site.height));
    }
  };

  const cancelSite = (key: string): boolean => {
    if (!resort().construction.hide(key)) return false;
    sites = sites.filter((site) => site.placement.key !== key);
    return true;
  };

  // Every effect here must be mirrored by lift; raise holds the ones that wait for the building to
  // finish.
  const stand = (placement: Placement, lifted?: Placement): void => {
    const { plot, construction } = resort();
    if (lifted) lift(lifted);
    // Claimed first: if the tiles are gone the scene must not gain an object the index does not
    // know.
    occupancy.claim(placement, placement.key);
    listFor(plot, placement.id).push(placement);
    // Whether or not it takes time: the ground under what stands is square from the moment the
    // tiles are claimed.
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
    // Read per pick: the isometric view puts a different camera on screen.
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
      // Separate from onChange: the HUD counts are unchanged, but the terrain meshes must be
      // rebuilt.
      parts.onGroundChange();
    },
    onCancel,
  });

  // A scan rather than a second key table, which every edit would have to keep in step.
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
      if (reshapesGround(placement)) parts.onGroundChange();
      onChange();
    },
    onPlace: stand,
    onRails: changeRails,
    onCancel,
  });

  return {
    select(tool) {
      // All three are told every time, so the order cannot matter.
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

// Only here: the models are shared by every resort, the crowd, the sky and the bay.
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

// A benchmark gets the authored plan: runs only compare if the scene is the same.
function startingSource(bench: BenchConfig | null, params: ResortParams): ResortSource {
  return bench ? { kind: 'authored' } : { kind: 'generate', params };
}

function prepRequestFor(source: ResortSource, bench: BenchConfig | null): PrepRequest {
  if (!bench) return { source, repeat: 1, view: null };
  return { source, repeat: bench.repeat, view: bench.view };
}

function crowdStep(bench: boolean, speed: SimSpeed, elapsed: number): number {
  if (bench) return MAX_STEP;
  return speed === 'paused' ? 0 : elapsed;
}

function detailFrom(bench: BenchConfig | null): boolean {
  return bench?.detail ?? true;
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame, onSceneChange } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  const bench = parseBenchConfig(globalThis.location?.search ?? '');

  const scratch = scratchForModels();
  const preparer = createResortPreparer({
    forceMainThread: bench?.forceMainThreadMeshing ?? false,
  });
  let params = startingParams(bench);
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
    // The live occupancy, not a snapshot: the ground under a cottage is drawn square.
    isClear: (tileX, tileZ) => current().occupancy.keyAt({ x: tileX, z: tileZ }) === undefined,
    // Wall-clock times cap at the refresh rate; the GPU's timers keep discriminating.
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
  // Not per resort: rain falls over the camera, not the plot.
  const rain = buildRainField(createRaindrops(MAX_DROPS, RAIN_SEED));
  handle.scene.add(rain.group);
  slot.attach(handle);

  let fpsState = createFpsState();
  let frameCost = createFrameCostState();
  // Arrives a few frames after it was drawn.
  let gpuMs: number | null = null;
  let running = true;
  let lastTimeMs: number | null = null;
  let lastShare: number | null = null;
  const clock = createClock(handle, current, bench ? bench.time : INITIAL_TIME);
  let lastWeather: Weather = clock.weather;

  // Cached: drawingBufferSize() allocates a vector per call; the resize handler updates it.
  let buffer = handle.drawingBufferSize();

  // Distance to the target, not the nearest thing in frame: that is the ground the rain falls on.
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

  // Its own step to keep the render loop's branching down, which fallow:audit measures.
  const advanceWeather = (elapsedSeconds: number): void => {
    const target = handle.controls.target;
    rain.advance(bench ? MAX_STEP : elapsedSeconds, rainfallFor(clock.weather, rainView()), target);
    if (clock.weather === lastWeather) return;
    lastWeather = clock.weather;
    options.onWeatherChange?.(lastWeather);
  };

  if (bench) pinCamera(handle);
  // Through the same door the HUD uses, so the measured frame is what somebody watching a storm
  // gets.
  if (bench?.weather) clock.setWeather(bench.weather);

  let detail = detailFrom(bench);

  const cameraView = (): CameraView => ({
    mode: handle.cameraMode,
    direction: handle.isoDirection,
    detail,
  });

  const setCameraMode = (mode: CameraMode): void => {
    if (bench) return;
    handle.setCameraMode(mode);
  };

  const setIsoDirection = (direction: CompassDirection): void => {
    handle.setIsoDirection(direction);
  };

  // Off the live terrain, so a building on a terrace is looked at rather than through.
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
    // The rain is sized in pixels, so a resize changes it.
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

  // A flag rather than a rebuild per spadeful: the rebuild is coalesced to one per frame.
  let ground = false;

  // Told once a frame: a placement costs a scan and a React render, and a drag places one per move.
  let counted = false;

  // Deferred until the pointer is still for REANCHOR_DELAY_MS, so a whole stroke costs one rebuild.
  let walkStaleAt: number | null = null;

  const build = createEditMode({
    canvas,
    handle,
    resort: current,
    geometries: catalogue.geometries,
    onChange: () => {
      counted = true;
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
      if (namesPlacement(selected, placement.key)) select(null);
    },
  });

  let armedTool: BuildTool | null = null;
  const selectTool = (tool: BuildTool | null): void => {
    armedTool = tool;
    build.select(tool);
  };

  // The index, not the view: the view is rebuilt on a new day or an edit, and the live line needs
  // the index.
  let selected: InspectTarget = null;
  let selectedOn = clock.day;

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
    // By key: the venue list is the router's numbering; -1 reads as spotless.
    const venue = resort.venues.findIndex((candidate) => candidate.key === placement.key);
    return placeView(
      placement,
      label,
      guests,
      router.occupancyOf(placement.key),
      cleanliness(resort.upkeep, venue),
    );
  };

  const select = (target: InspectTarget): void => {
    const view = viewOf(target);
    selected = view ? target : null;
    selectedOn = clock.day;
    options.onSelectionChange?.(view);
  };

  // The one place selection wording and router facts meet, so neither imports the other.
  const errandFor = (person: number): Errand => {
    const { router } = current();
    return errandOf({
      visit: router.visitOf(person),
      goal: router.goalOf(person),
      home: router.homewardTo(person),
      asleep: router.isAsleep(person),
      beach: router.stayOf(person),
      checkingIn: router.isArriving(person),
    });
  };

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

  const advise = (): void =>
    options.onAdviceChange?.(adviceFor(factsNow(current(), clock.weather)));

  const rebuilt = (): void => {
    clock.relight();
    onSceneChange?.(statsNow());
    advise();
  };

  let requested = 0;

  // An answer overtaken by a later request is dropped rather than flashed on screen.
  const regrow = async (asked: ResortParams, source: ResortSource): Promise<void> => {
    const request = ++requested;
    const prepared = await preparer.prepare(prepRequestFor(source, bench));
    if (request !== requested || !running) return;
    params = asked;
    build.abandon();
    // The person index and the placement key both name something on the old plot.
    select(null);
    walkStaleAt = null;
    slot.replace(prepared);
    rebuilt();
    options.onOpenChange?.(current().open);
  };

  const recorder = bench
    ? createBenchRecorder({
        bench,
        handle,
        stats: statsNow,
        litLamps: () => clock.litLamps,
      })
    : null;

  const chooseDetail = (): void => {
    const view = detail ? handle.detailView() : null;
    current().world.updateDetail(view);
    current().crowd.setView(view);
  };
  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;
    const frameStarted = performance.now();

    // First: the ground the crowd walks and the surfaces the camera sees must agree.
    if (ground) {
      handle.retile();
      ground = false;
    }
    if (counted) {
      onSceneChange?.(statsNow());
      counted = false;
    }
    // Guarded so a bench that ever places something does not rebuild mid-run.
    if (walkStaleAt !== null && !bench && timeMs - walkStaleAt >= REANCHOR_DELAY_MS) {
      walkStaleAt = null;
      const resort = current();
      const { plan, plot, shore, terrain, crowd } = resort;
      const network = networkFor({
        plan,
        shore,
        terrain,
        paved: plot.paths,
        standing: [...plot.placements, ...plot.props],
      });
      const wasStanding = resort.venues;
      resort.venues = venuesOn(plot.placements);
      resort.lodgings = lodgingsOn(plot.placements);
      resort.gateways = gatewaysOn(plot.placements);
      // Before the router's rebuild, whose findHomes maps the new home indices.
      rehome(resort.guests, homesOn(plot.placements));
      const beds = bedCount(resort.guests);
      resort.beds = { total: beds.beds, taken: beds.taken };
      // By key: surviving venues keep their dirt, and new ones start clean.
      resort.upkeep = carryUpkeep(resort.upkeep, wasStanding, resort.venues);
      resort.unreachable = strandedOn(resort.venues, network);
      resort.router.rebuild(resort.venues, resort.lodgings, resort.gateways, network);
      resort.staffRouter.rebuild(resort.venues, network);
      crowd.relocate(network);
      resort.staff.relocate(network);
      staffTheResort(resort);
      // Said now rather than tomorrow; the day's counters are left alone.
      advise();
    }

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    // Fixed step under a benchmark: a frame-delta clock puts the scene elsewhere on the same frame
    // of two runs.
    const ticks = clock.advance(bench ? MAX_STEP : elapsed);
    // Capped, so a backgrounded tab does not run a week of decay in one frame.
    if (ticks > 0) lastShare = runTicks(current(), clock, ticks, lastShare, advise);
    // Pinned to real time under a bench so runs replay; the crowd still walks though the bench
    // clock is paused. Outside one, handing over zero time is what stops a paused crowd;
    // crowdScaleFor is 1 while paused.
    current().crowd.advance(
      crowdStep(bench !== null, clock.speed, elapsed),
      bench ? 1 : crowdScaleFor(clock.speed),
    );
    current().staff.advance(
      crowdStep(bench !== null, clock.speed, elapsed),
      bench ? 1 : crowdScaleFor(clock.speed),
    );
    current().balloons.advance(bench ? MAX_STEP : elapsed, clock.balloonReadiness);
    current().sea.advance(bench ? MAX_STEP : elapsed);
    advanceWeather(elapsed);
    build.advance(bench ? MAX_STEP : elapsed);
    if (!bench) handle.controls.update();
    chooseDetail();
    const renderStarted = performance.now();
    handle.renderer.render(handle.scene, handle.camera);
    // WebGPU records and submits here; the GPU works afterwards.
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
    get open() {
      return current().open;
    },
    setOpen(open) {
      const resort = current();
      if (resort.open === open) return;
      resort.open = open;
      options.onOpenChange?.(open);
      advise();
    },
    setCameraMode,
    setIsoDirection,
    setDetail(enabled) {
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
      // The seed goes along, so clearing gives a random landscape.
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
      // Last: everything above is built over these.
      disposeCatalogue(catalogue);
    },
  };
}
