import { materialKeyFor, voxelIdFor } from '../features/catalog/domain/materials';
import {
  allMaterials,
  emissiveByModelId,
  waterByModelId,
  windowsByModelId,
  familyOf,
  hireOf,
  isGateway,
  materialColorsById,
  OBJECT_TYPES,
  objectTypeById,
  LITTER_MODELS,
  PAINTED_MODELS,
  PEOPLE_MODELS,
  PROP_MODELS,
  SEA_MODELS,
  signOf,
  SKY_MODELS,
  STAFF_MODELS,
  TILE_VOXELS,
} from '../features/catalog/domain/objectTypes';
import { buildCostOf, DIG_COST, landPriceOf } from '../features/catalog/domain/prices';
import {
  casterOf,
  hearthOf,
  lightsOf,
  occluderOf,
} from '../features/catalog/domain/placementFacts';
import type { Placement } from '../features/layout/domain/resortLayout';
import type { ResortPlan } from '../features/layout/domain/resortPlan';
import type { Shore } from '../features/layout/domain/shoreline';
import { beachTilesOf, isBeach, shoreFor } from '../features/layout/domain/shoreline';
import type { Terrain } from '../features/layout/domain/terrain';
import { terrainFor } from '../features/layout/domain/terrain';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { clampParams } from '../features/layout/domain/resortGenerator';
import {
  claimingOn,
  everythingOn,
  rentalsOf,
  type Plot,
  type PreparedResort,
  type ResortSource,
} from '../features/resort-prep/domain/prepareResort';
import { referenceWorldOf } from '../features/resort-prep/domain/referenceResort';
import { createOwnershipMask } from '../features/land/adapters/ownershipMask';
import {
  buyParcel,
  forSale,
  landViewOf,
  ownedArea,
  ownedSpan,
  type LandView,
  type TileSpan,
} from '../features/land/domain/landRights';
import { restoreResort } from '../features/sim/domain/resortState';
import { type GameSnapshot } from '../features/saves/domain/snapshot';
import { createResortPreparer } from '../features/resort-prep/adapters/resortPreparer';
import { armedLand, armedZone, type BuildTool } from '../features/build/domain/buildTool';
import { type LandPointerOptions } from '../features/build/adapters/landPointer';
import type { TileOccupancy } from '../features/build/domain/tileOccupancy';
import { createTileOccupancy } from '../features/build/domain/tileOccupancy';
import type { RailIndex } from '../features/build/domain/railIndex';
import { createRailIndex } from '../features/build/domain/railIndex';
import { createEditMode, type Purse, type Refusal } from '../features/build/adapters/editMode';
import { createSelectionController } from './selectionController';
import {
  createResortLifecycle,
  INITIAL_TIME,
  prepRequestFor,
  type ResortIdentity,
} from './resortLifecycle';
import { levelHeight } from '../features/layout/domain/elevation';
import type { WorldBounds } from '../features/layout/domain/worldBounds';
import { TICKS_PER_DAY, wallTimeOf, type SimSpeed } from '../features/sim/domain/simClock';
import { strongestNeed } from '../features/sim/domain/needs';
import { carryUpkeep, cleanliness } from '../features/sim/domain/upkeep';
import { carryBreakdowns, isBroken } from '../features/sim/domain/breakdowns';
import { litterSummary, pruneLitter, type Litter } from '../features/sim/domain/litter';
import { loudest } from '../features/sim/domain/thoughts';
import {
  hire,
  shortOf,
  STAFF_ROLES,
  unwatched,
  type StaffRole,
} from '../features/sim/domain/staff';
import { canAfford, record, type GameMode, type Ledger } from '../features/sim/domain/ledger';
import {
  createStaffTask,
  meanCleanliness,
  type OrderRole,
  type StaffTask,
} from '../features/sim/domain/staffRouter';
import { staffByZone, zoneAt, type Zones } from '../features/sim/domain/zones';
import { CHECK_IN_TICK } from '../features/sim/domain/checkIn';
import { beachVenueFor, withBeach } from '../features/sim/domain/beach';
import { relabelled, shelterOf, type Venue } from '../features/sim/domain/venues';
import { assignNames, namedPlacesOf, renameTo } from '../features/naming/domain/venueNames';
import { occupiedShare } from '../features/sim/domain/night';
import { plotFactsOf } from '../features/resort-sim/domain/plotFacts';
import { createSimState, keptFactsOf, type SimState } from '../features/resort-sim/domain/simState';
import { venueIndexOf } from '../features/resort-sim/domain/visits';
import {
  beachTilesFor,
  knowPaving,
  litterWindowOf,
  pavingIndexOf,
  rezone,
  rosterNow,
  staffTheResort,
  type TileAt,
} from '../features/resort-sim/domain/staffing';
import { refreshNightOut } from '../features/resort-sim/domain/nights';
import {
  beachIndexOf,
  eventFactsOf,
  refreshEventVenues,
  refreshInvited,
  refreshKeen,
  runningShowOf,
  WEATHER_SEED,
  weatherOnDay,
} from '../features/resort-sim/domain/eventSteps';
import { stepSim } from '../features/resort-sim/domain/stepSim';
import { partiesArrivedOn } from '../features/resort-sim/domain/arrivals';
import { partyMixOf } from '../features/events/domain/audience';
import { createEvents, type EventStep } from '../features/events/domain/eventRuns';
import { restoreEvents } from '../features/events/domain/eventsSnapshot';
import {
  book,
  BUILT_INS,
  keepStanding,
  nextEvents,
  occurrencesOn,
  rebook,
  siteKey,
  switchBuiltIn,
  toNewStage,
  unbook,
  withBuiltIns,
  type BookingChange,
  type BookingDraft,
  type BookingRefusal,
  type Programme,
} from '../features/events/domain/programme';
import { type DayForecast, type ProgrammeFacts } from '../features/events/domain/programmeView';
import { heldAt, stageKeysOf } from '../features/events/domain/sites';
import { stageRank, withoutBuiltIns } from '../features/events/domain/welcome';
import { bookingDayKey, showToTell } from '../features/events/domain/stayingUp';
import { dayAt } from '../features/events/domain/week';
import { watchRoom, type LaunchSite } from '../features/fireworks/domain/launch';
import { fireworksDrought } from '../features/fireworks/domain/nights';
import { eventNewsFrom, tonightNewsOf, type EventNews } from '../features/hud/domain/news';
import {
  isOpenIn,
  weatherEffect,
  type Weather,
  type WeatherEffect,
} from '../features/sim/domain/weather';
import { openAt, openNow } from '../features/sim/domain/hours';
import { createRaindrops, MAX_DROPS, rainfallFor } from '../features/weather/domain/rainfall';
import { buildRainField, type RainField } from '../features/weather/adapters/rainField';
import {
  buildFireworksField,
  type FireworksField,
} from '../features/fireworks/adapters/fireworksField';
import { type ShowLight } from '../features/fireworks/domain/light';
import { showPace } from '../features/fireworks/domain/pace';
import {
  benchShow,
  planShow,
  playheadFor,
  showSeed,
  tierIdOf,
} from '../features/fireworks/domain/show';
import type { RainView } from '../features/weather/domain/rainfall';
import { pixelsPerVoxel } from '../features/rendering/domain/levelOfDetail';
import {
  adviceFor,
  refreshedWithin,
  type Advice,
  type ResortFacts,
} from '../features/sim/domain/advice';
import { demandFor, type Demand } from '../features/sim/domain/demand';
import { doorsFor } from '../features/sim/domain/doors';
import { stepFreeReachOn, type StepFreeReach } from '../features/sim/domain/stepFree';
import { hopsFrom, reachSeedsFor } from '../features/overlays/domain/reach';
import {
  createFootfall,
  overlayValuesFor,
  type OverlayKind,
} from '../features/overlays/domain/overlays';
import {
  buildOverlayField,
  type OverlayField,
  type OverlayTile,
} from '../features/overlays/adapters/overlayField';
import {
  highlightBoxesOf,
  highlightTypesOf,
  ringWidthAt,
  type HighlightKind,
  type HighlightPick,
} from '../features/highlights/domain/highlights';
import {
  buildHighlightField,
  type HighlightField,
} from '../features/highlights/adapters/highlightField';
import { crowdScaleFor } from '../features/sim/domain/crowdRate';
import { anchorsFor, type LightAnchor } from '../features/lighting/domain/lightAnchors';
import { buildFlamesField, type FlamesField } from '../features/bonfire/adapters/flamesField';
import { LIGHT_RISE, relit } from '../features/bonfire/domain/flames';
import type { LightGridSpec } from '../features/lighting/domain/lightGrid';
import { cellCount, gridByteSize } from '../features/lighting/domain/lightGrid';
import type { LiveLightGrid } from '../features/lighting/domain/liveLightGrid';
import { createLiveLightGrid, type LightGridEdit } from '../features/lighting/domain/liveLightGrid';
import type { LiveSkyVisibility } from '../features/lighting/domain/skyVisibility';
import { createLiveSkyVisibility } from '../features/lighting/domain/skyVisibility';
import type { BakedLightVolume } from '../features/lighting/adapters/bakedLightVolume';
import { createBakedLightVolume } from '../features/lighting/adapters/bakedLightVolume';
import { createSkyApplier } from '../features/lighting/adapters/skyApplier';
import { createResortClock, type ResortClock } from '../features/sim/domain/resortClock';
import type { ScratchLayout } from '../features/voxel-world/domain/modelScratch';
import {
  canopyScratchModelsOf,
  scratchLayoutFor,
} from '../features/voxel-world/domain/modelScratch';
import { coarseScratchModelOf } from '../features/voxel-world/domain/coarseVoxels';
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from '../features/voxel-world/adapters/dveEngine';
import { meshCatalogue } from '../features/voxel-world/adapters/meshCatalogue';
import type { InstancedWorld } from '../features/rendering/adapters/instancedWorld';
import { buildInstancedWorld } from '../features/rendering/adapters/instancedWorld';
import type { ModelGeometry } from '../features/rendering/adapters/voxelMeshBuilder';
import { buildModelGeometries } from '../features/rendering/adapters/voxelMeshBuilder';
import { blobShadowsFor } from '../features/rendering/domain/blobShadows';
import {
  joinColumns,
  SAND_LEVEL,
  SEA_LEVEL,
  type TileColumns,
} from '../features/rendering/domain/terrainSurface';
import type { BlobShadowField } from '../features/rendering/adapters/blobShadowField';
import { buildBlobShadowField } from '../features/rendering/adapters/blobShadowField';
import {
  buildConstructionField,
  type ConstructionField,
} from '../features/construction/adapters/constructionField';
import { restoreCrowd, WALK_SPEED } from '../features/crowd/domain/crowd';
import {
  crowdOverrideFrom,
  crowdSizeFor,
  crowdSizeForArea,
  crowdSizeForOwned,
} from '../features/crowd/domain/crowdSize';
import { BEACH_SURFACE, type WalkNetwork } from '../features/crowd/domain/walkNetwork';
import {
  carryPlaces,
  createCast,
  insideAt,
  keepSeats,
  noteShows,
  recast,
  recastStaff,
  whereDrawn,
  type Cast,
  type Casting,
} from '../features/choreography/domain/casting';
import { placesFor, type VenuePlaces } from '../features/choreography/domain/places';
import { advanceActs, perform } from '../features/choreography/domain/acts';
import { performAtSea } from '../features/choreography/domain/seaSwim';
import { performOnSand } from '../features/choreography/domain/sandCastles';
import { performWork } from '../features/choreography/domain/work';
import {
  bedCount,
  homelessCount,
  usesWheelchair,
  presentCount,
  rehome,
  unmadeCount,
} from '../features/guests/domain/guests';
import type { CrowdField } from '../features/crowd/adapters/crowdField';
import { buildCrowdField } from '../features/crowd/adapters/crowdField';
import { createInspectPointer } from '../features/inspect/adapters/inspectPointer';
import { namesPlacement, placementKeyOf, workerOf } from '../features/inspect/domain/selection';
import type { GuestNeed } from '../../voxel-gen/voxelgen.ts';
import { ADULT_VOXELS, hipHeight } from '../../voxel-gen/people/figure.ts';
import type { BalloonField } from '../features/balloons/adapters/balloonField';
import { buildLitterField, type LitterField } from '../features/litter/adapters/litterField';
import { buildBallField, type BallField } from '../features/choreography/adapters/ballField';
import { piecesFor } from '../features/litter/domain/litterPieces';
import { buildBalloonField } from '../features/balloons/adapters/balloonField';
import { createBalloons, type ReleaseSite } from '../features/balloons/domain/balloons';
import type { SeaField } from '../features/sea/adapters/seaField';
import { buildSeaField } from '../features/sea/adapters/seaField';
import { createFlotilla } from '../features/sea/domain/flotilla';
import { pierBoxesFor, type PierBox } from '../features/sea/domain/piers';
import { islandBoxesFor } from '../features/sea/domain/islands';
import { berthsOf, createPassengers } from '../features/sea/domain/passengers';
import { fleetsFor, hutAllowances, type RentalHut } from '../features/sea/domain/fleets';
import type { Mooring, SailingGround, SwimAreaOptions } from '../features/sea/domain/swimArea';
import { sailingGroundFor } from '../features/sea/domain/swimArea';
import { BUOY_INDEX } from '../../voxel-gen/sea/index.ts';
import type {
  CameraFraming,
  CameraMode,
  CompassDirection,
} from '../features/layout/domain/worldBounds';
import { turnDirection } from '../features/layout/domain/worldBounds';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { createScene } from '../features/rendering/adapters/threeScene';
import { createCameraKeys } from '../features/rendering/adapters/cameraKeys';
import { startCameraDrift, type CameraDrift } from '../features/rendering/adapters/cameraDrift';
import type { LoadingStep } from '../features/welcome/domain/loading';
import { resortNameFor } from '../features/naming/domain/resortName';
import type { SharedResort } from '../features/sharing/domain/sharedResort';
import { createNameplates, type Nameplates } from '../features/naming/adapters/nameplateField';
import { createFpsState, sampleFrame } from '../features/hud/domain/fps';
import { createFrameCostState, sampleFrameCost } from '../features/hud/domain/frameCost';
import { reportDue } from '../features/hud/domain/reportPace';
import type { FrameUpdate } from '../features/hud/adapters/hudOverlay';
import type { HudState, HudStore } from '../features/hud/domain/hudStore';
import {
  createMarkerSpots,
  createSignSpots,
  tilePxAt,
} from '../features/hud/adapters/screenAnchors';
import { createStaffPinner, groundUnder, writeDrawn } from '../features/hud/adapters/staffPinner';
import { createHearing } from '../features/sound/adapters/hearingProbe';
import { MAX_MARKERS } from '../features/hud/domain/markers';
import { signAnchorOf, signSpotsOf, type SignSpot } from '../features/hud/domain/signs';
import { roofOver, tallyStaff, type Anchor } from '../features/hud/domain/staffPins';
import type { BuildCue } from '../features/sound/domain/cues';
import { type HeardScene } from '../features/sound/domain/hearing';
import {
  benchRefusal,
  benchStep,
  parseBenchConfig,
  timesGpu,
  type BenchConfig,
} from '../features/bench/domain/benchConfig';
import { roundStats, summarizeFrames, type FrameStats } from '../features/bench/domain/frameStats';
import { summarizeTimings, type TimingStats } from '../features/bench/domain/timings';
import { createFrameTimer } from '../features/bench/adapters/frameTimer';
import type {
  BuildNote,
  CameraView,
  ShowcaseStats,
  StatusView,
  VoicesView,
} from '../features/hud/domain/views';

// Precomputed: read once per object placed, and a drag places one per pointer move.
const VOXELS_PER_TYPE = new Map(OBJECT_TYPES.map((type) => [type.id, type.model.voxels.length]));

const CROWD_OVERRIDE = crowdOverrideFrom(globalThis.location?.search ?? '');

const BALLOON_COUNT = 36;

// Seeds are fixed so bench runs replay the same scene, and separate so retuning
// one draw never reshuffles another (more berths must not move the fleet).
const BALLOON_SEED = 2;

// Four pieces on 128 tiles is already a landfill, and the advice will have said so long before.
const LITTER_PIECES = 512;

// Per kind of ball: courts playing at once beyond this go without one. Fixed, so an edit that
// adds a court needs no new field.
const BALLS_PER_KIND = 16;

const CRAFT_COUNT = 12;

const SEA_SEED = 3;

const CREW_SEED = 4;

const RAIN_SEED = 4;

const AIM_HEIGHT = hipHeight(ADULT_VOXELS);

const LOUDEST_SHOWN = 5;

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
  // The whole loop callback, which `stats` cannot show: under vsync it reads the refresh rate.
  readonly cpu: FrameStats;
  readonly clock: string;
  readonly timings: Readonly<Record<string, TimingStats>>;
}

export type { FrameUpdate };

export interface ShowcaseOptions {
  readonly canvas: HTMLCanvasElement;
  // What the HUD shows; the callbacks below are what it reacts to once.
  readonly hud: HudStore;
  readonly onFrame: (update: FrameUpdate) => void;
  readonly onToolChange?: (tool: BuildTool | null) => void;
  // A double tap on the resort while no tool is armed.
  readonly onDoubleTap?: () => void;
  // A new game or a load, told before the new resort's first advice.
  readonly onResortReplaced?: () => void;
  readonly onRefused?: (note: BuildNote) => void;
  readonly onBuildNote?: (note: BuildNote) => void;
  // Something a save would keep has changed. Not per step: from the places that already tell React.
  readonly onDirty?: () => void;
  readonly onMorning?: () => void;
  // Only for what the player does, never for a load or a settle laying the plot out again.
  readonly onCue?: (cue: BuildCue) => void;
  // At most five times a second of real time, with one scene object reused every time.
  readonly onHear?: (scene: HeardScene) => void;
  // Only for a speed the showcase set itself, as a load does.
  readonly onSpeedChange?: (speed: SimSpeed) => void;
  // An event announced, called off or put off; never told during a load.
  readonly onEventNews?: (news: EventNews) => void;
  // Opens behind the welcome screen: the camera drifts, the controls are off and the resort keeps
  // the player's local time, until the first new game.
  readonly welcome?: boolean;
  readonly onLoading?: (step: LoadingStep) => void;
}

export interface Showcase {
  readonly benchResult: BenchResult | null;
  readonly params: ResortParams;
  setOpen(open: boolean): void;
  // Kept beside the params rather than in the resort, so a settle or a load of the scene keeps it.
  rename(name: string): void;
  // An emptied name draws a fresh one where the model suggests names, else goes back to the kind.
  renameVenue(key: string, typed: string): void;
  setHiring(role: StaffRole, count: number | null): void;
  setCameraMode(mode: CameraMode): void;
  setIsoDirection(direction: CompassDirection): void;
  setDetail(enabled: boolean): void;
  turnCamera(quarters: number): void;
  lookAtTile(tile: { readonly tileX: number; readonly tileZ: number }): void;
  // Where the problem markers stand, in the order the HUD draws them; at most MAX_MARKERS.
  setMarkers(tiles: readonly { readonly tileX: number; readonly tileZ: number }[]): void;
  // A pin over every member of staff on duty; the one inspected is pinned either way.
  setStaffPins(shown: boolean): void;
  // Over every venue's door while zoomed in; under a bench, never placed.
  setSigns(shown: boolean): void;
  setSingleKeys(on: boolean): void;
  selectAt(tile: { readonly tileX: number; readonly tileZ: number }): void;
  generate(params: ResortParams): Promise<void>;
  clear(params: ResortParams, mode: GameMode): Promise<void>;
  // Always sandbox: tycoon pays for everything that stands, and this resort was not built here.
  openShared(shared: SharedResort): Promise<void>;
  selectTool(tool: BuildTool | null): void;
  confirmPlacement(): void;
  dismissPlacement(): void;
  turnPlacement(quarters: number): void;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  setWeather(weather: Weather | null): void;
  setOverlay(kind: OverlayKind | null): void;
  // Rings every building of the picked kinds; under a bench, never drawn.
  setHighlights(picks: readonly HighlightPick[]): void;
  selectPerson(person: number): void;
  selectWorker(worker: number): void;
  // Turns the camera on the inspected member of staff, wherever they have walked to since.
  showSelected(): void;
  // Sends the nearest free worker of the role to the inspected building.
  sendStaff(role: OrderRole): void;
  sendCleanerTo(tile: { readonly tileX: number; readonly tileZ: number }): void;
  clearSelection(): void;
  book(draft: BookingDraft): BookingRefusal | null;
  unbook(id: number): void;
  rebook(id: number, change: BookingChange): BookingRefusal | null;
  switchBuiltIn(id: number, on: boolean): void;
  // Finishes what is being built first: the save is of a world with no scaffolding.
  snapshot(): GameSnapshot;
  // Opens paused. Rejects, with the resort already replaced, if the save does not fit its world.
  load(snapshot: GameSnapshot): Promise<void>;
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
  const started = performance.now();
  const scratch = scratchLayoutFor(
    [
      ...PAINTED_MODELS,
      ...PAINTED_MODELS.flatMap(canopyScratchModelsOf),
      ...OBJECT_TYPES.map((type) => coarseScratchModelOf(type.model)),
    ],
    (color) => voxelIdFor(materialKeyFor(color)),
    sectionSizeOf(DEFAULT_WORLD_SCALE),
  );
  if (scratch.extentX > DEFAULT_WORLD_SCALE.horizontalExtent) {
    throw new Error(
      `The models need ${scratch.extentX} voxels of scratch space, the world allows ${DEFAULT_WORLD_SCALE.horizontalExtent}`,
    );
  }
  performance.measure('vox:boot:scratch', { start: started });
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
  readonly litter: readonly ModelGeometry[];
  readonly props: readonly ModelGeometry[];
  readonly dveMs: number;
  readonly meshMs: number;
  readonly threaded: boolean;
  // A count, so the session does not keep the scratch's writes alive just to report them.
  readonly meshedVoxelCount: number;
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
if (STAFF_ROLES.some((role, variant) => STAFF_MODELS[variant]?.id !== role)) {
  throw new Error('Staff models are not in STAFF_ROLES order; somebody would wear the wrong kit.');
}

const SKY_IDS: ReadonlySet<string> = new Set(SKY_MODELS.map((model) => model.id));

const SEA_IDS: ReadonlySet<string> = new Set(SEA_MODELS.map((model) => model.id));

const LITTER_IDS: ReadonlySet<string> = new Set(LITTER_MODELS.map((model) => model.id));

const PROP_IDS: ReadonlySet<string> = new Set(PROP_MODELS.map((model) => model.id));

// A prop the crowd field draws under its users, not a ball.
const WHEELCHAIR_ID = 'wheelchair';

const KEPT_APART_IDS: ReadonlySet<string> = new Set([
  ...PEOPLE_IDS,
  ...STAFF_IDS,
  ...SKY_IDS,
  ...SEA_IDS,
  ...LITTER_IDS,
  ...PROP_IDS,
]);

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
    geometries: geometries.filter((model) => !KEPT_APART_IDS.has(model.id)),
    // In registry order: a person's variant indexes into it.
    people: geometries.filter((model) => PEOPLE_IDS.has(model.id)),
    staff: geometries.filter((model) => STAFF_IDS.has(model.id)),
    sky: geometries.filter((model) => SKY_IDS.has(model.id)),
    sea: geometries.filter((model) => SEA_IDS.has(model.id)),
    litter: geometries.filter((model) => LITTER_IDS.has(model.id)),
    props: geometries.filter((model) => PROP_IDS.has(model.id)),
    dveMs: meshed.dveMs,
    meshMs: Math.round(performance.now() - started),
    threaded: meshed.threaded,
    meshedVoxelCount: scratch.writes.voxelIds.length,
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

interface BakedLighting {
  readonly live: LiveLightGrid;
  readonly sky: LiveSkyVisibility;
  readonly volume: BakedLightVolume;
}

// A lamp outside the grid re-bakes nothing and is left out of litCount, which the HUD reads.
function rebake(baked: BakedLighting, edit: LightGridEdit): void {
  if (edit.region) baked.volume.update(edit.region, edit.scale);
}

function splatLights(baked: BakedLighting, placement: Placement): void {
  for (const anchor of anchorsFor(placement, lightsOf(placement)))
    rebake(baked, baked.live.add(anchor));
}

function unsplatLights(baked: BakedLighting, placement: Placement): void {
  for (const anchor of anchorsFor(placement, lightsOf(placement))) {
    rebake(baked, baked.live.remove(anchor.key));
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
  // The fires burning now; a fire's light comes and goes with its evening, not with the pit.
  burn(fires: readonly LightAnchor[]): void;
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
    burn() {},
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
  const burning = new Set<string>();
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
    burn(fires) {
      const { out, lit } = relit(burning, fires);
      for (const key of out) {
        burning.delete(key);
        rebake(baked, baked.live.remove(key));
      }
      for (const fire of lit) {
        burning.add(fire.key);
        rebake(baked, baked.live.add(fire));
      }
    },
  };
}

export interface Resort extends SimState {
  // Narrowed from the holders the rules read: a relocate or an adopt on the field is seen by both.
  readonly crowd: CrowdField;
  readonly staff: CrowdField;
  readonly lighting: Lighting;
  readonly world: InstancedWorld;
  readonly shadows: BlobShadowField;
  // Per resort: its materials are bound to this plot's baked light volume.
  readonly construction: ConstructionField;
  // Per resort for the same reason; lettered by the showcase, which holds the name.
  readonly nameplates: Nameplates;
  // Where visitors are drawn, index-aligned with `venues`. Replaced with them on an edit, which
  // renumbers the network's seats the places point into.
  places: readonly VenuePlaces[];
  cast: Cast;
  staffCast: Cast;
  readonly casting: Casting;
  // Off the rentals the resort was built with: an edit puts new fleets out, but moves no buoy.
  readonly bathing: SwimAreaOptions;
  // The huts whose fleets are on the sea, in the fleets' order.
  rentals: readonly RentalHut[];
  readonly waters: SeaWaters;
  // Allocated once, for a click to merge the crowd with the cast into.
  readonly drawnAt: {
    readonly x: Float32Array;
    readonly y: Float32Array;
    readonly z: Float32Array;
  };
  readonly staffDrawnAt: {
    readonly x: Float32Array;
    readonly y: Float32Array;
    readonly z: Float32Array;
  };
  // The points out at sea a show is launched from.
  launchSites: readonly LaunchSite[];
  readonly overlay: OverlayField;
  readonly balloons: BalloonField;
  readonly litterField: LitterField;
  readonly ballField: BallField;
  readonly flames: FlamesField;
  // The keys of the fires burning, so their flames and light change only when the fires do.
  burning: string;
  // Replaced when an edit adds or pulls down a hut that hires craft out.
  sea: SeaField;
  readonly occupancy: TileOccupancy;
  // The only writer of plot.rails; rails claim no tile, so they are indexed here instead of in
  // occupancy.
  readonly railIndex: RailIndex;
  readonly terrain: Terrain;
  readonly bounds: WorldBounds;
  readonly framing: CameraFraming;
  dispose(): void;
}

function balloonsFor(parts: {
  readonly shore: Shore | null;
  readonly span: TileSpan;
  readonly sky: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
}): BalloonField {
  const { from, to } = parts.span;
  const owned = beachTilesOf(parts.shore).filter((tile) => tile.x >= from && tile.x < to);
  const sites: ReleaseSite[] = owned.map((tile) => ({
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
function seaGroundOf(shore: Shore | null, rentals: readonly RentalHut[]): SailingGround {
  if (!shore) return { westX: 0, eastX: 0, seawardZ: 0, landwardZ: () => 0 };
  return sailingGroundFor(shore, rentals);
}

const SEA_BERTHS = SEA_MODELS.map(berthsOf);

// Half the longer side, since a hull turns.
const SEA_RADII = SEA_MODELS.map((model) => Math.max(model.width, model.depth) / 2);

const HIRED_CRAFT: ReadonlySet<string> = new Set(
  OBJECT_TYPES.flatMap((type) =>
    (type.model.hire?.fleets ?? []).flatMap((fleet) => [fleet.craft, fleet.tows ?? fleet.craft]),
  ),
);

const seaIndexOf = (id: string): number => SEA_MODELS.findIndex((model) => model.id === id);

// Hire craft only ever leave their berths with somebody aboard.
const driftingVariants = (sea: readonly ModelGeometry[]): number[] =>
  sea
    .map((_, variant) => variant)
    .filter((variant) => variant !== BUOY_INDEX && !HIRED_CRAFT.has(sea[variant]!.id));

// Everything the sea is built on but its fleets, kept so an edit can put new fleets on the same
// water. The ground keeps the corridors it was built with, as the buoys and the swim area do.
interface SeaWaters {
  readonly shore: Shore | null;
  readonly ground: SailingGround;
  readonly moorings: readonly Mooring[];
  readonly piers: readonly PierBox[];
  readonly islands: readonly PierBox[];
  readonly sea: readonly ModelGeometry[];
  readonly people: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
}

// Moorings are worked out beforehand because the lamp bake needs them before there is a sea.
function seaWatersFor(parts: {
  readonly shore: Shore | null;
  readonly terrain: Terrain;
  readonly paved: readonly Placement[];
  readonly rentals: readonly RentalHut[];
  readonly moorings: readonly Mooring[];
  readonly sea: readonly ModelGeometry[];
  readonly people: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
}): SeaWaters {
  const { shore } = parts;
  return {
    shore,
    ground: seaGroundOf(shore, parts.rentals),
    moorings: parts.moorings,
    piers: pierBoxesFor(shore, parts.paved),
    // Off the terrain as it stands when the resort is built: an island raised later is sailed
    // round from the next load.
    islands: islandBoxesFor(parts.terrain),
    sea: parts.sea,
    people: parts.people,
    lightVolume: parts.lightVolume,
  };
}

function seaFor(waters: SeaWaters, rentals: readonly RentalHut[]): SeaField {
  const { ground } = waters;
  const fleets = fleetsFor(rentals, hireOf, seaIndexOf, WALK_SPEED);
  const flotilla = createFlotilla({
    moorings: waters.moorings,
    buoyVariant: BUOY_INDEX,
    craft: waters.shore ? CRAFT_COUNT : 0,
    craftVariants: driftingVariants(waters.sea),
    fleets,
    // Nobody is at the hut before the first recast, which sets the real allowance.
    hireAllowed: fleets.map(() => 0),
    ground,
    radii: SEA_RADII,
    piers: waters.piers,
    islands: waters.islands,
    waterline: SEA_LEVEL,
    seed: SEA_SEED,
  });
  const passengers = createPassengers({
    flotilla,
    berths: SEA_BERTHS,
    variants: waters.people.length,
    seed: CREW_SEED,
  });
  return buildSeaField({
    flotilla,
    ground,
    models: waters.sea,
    crew: { passengers, models: waters.people },
    lightVolume: waters.lightVolume,
  });
}

interface ResortArt {
  // Late-bound: the first resort is built before the clock is.
  readonly tickOfDay: () => number;
  readonly ticks: () => number;
  readonly weather: () => Weather;
  readonly geometries: readonly ModelGeometry[];
  readonly people: readonly ModelGeometry[];
  readonly staff: readonly ModelGeometry[];
  readonly sky: readonly ModelGeometry[];
  readonly sea: readonly ModelGeometry[];
  readonly litter: readonly ModelGeometry[];
  readonly props: readonly ModelGeometry[];
}

// A load or a settle restores whoever is here, so the bodies a settle adds start away.
const startsAway = (building: boolean, saved: number | undefined): boolean =>
  building || saved !== undefined;

// The plan's land, which is the live rights as they stood at the last settle.
const spanOf = (plan: ResortPlan): TileSpan => ownedSpan(plan.land ?? null, plan);

// The volume is wired up before the world, because the world's materials bind to it.
// A save brings its own: a plot started empty but paved since would otherwise be sized again, and
// every per-guest array would come out another length.
function populationOf(plan: ResortPlan, plot: Plot, saved: number | undefined): number {
  if (saved !== undefined) return saved;
  // Land, not paving: the guests a game expects grow as it buys, and a settle deals the newcomers.
  if (plan.land) return crowdSizeForOwned(ownedArea(plan.land, plan), CROWD_OVERRIDE);
  return plot.layout.paths.length === 0
    ? crowdSizeForArea(plan.tilesX, plan.tilesZ, CROWD_OVERRIDE)
    : crowdSizeFor(plot.layout.paths.length, CROWD_OVERRIDE);
}

function buildResort(
  parts: ResortArt & {
    readonly prepared: PreparedResort;
    readonly population?: number | undefined;
  },
): Resort {
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
  const nameplates = createNameplates(lighting.volume, (id) => objectTypeById(id).model);
  const terrain = terrainFor(plan);
  // Only a plot with no paving is sized by its area and starts away: a generated plot's opening
  // scene and the benchmark stay as they were.
  const building = plot.layout.paths.length === 0;
  const population = populationOf(plan, plot, parts.population);
  // The layout's lists, not the plot's: a benchmark tiles the plan ninefold onto ground the
  // elevation and the shore know nothing about, and would sleep nine times its guests.
  const facts = plotFactsOf({ plan, shore, terrain }, plot.layout, new Map());
  knowPaving(facts);
  const state = createSimState({
    plan,
    plot,
    shore,
    facts,
    population,
    away: startsAway(building, parts.population),
    guestVariants: parts.people.length,
    childVariant: CHILD_VARIANT,
    // Never zero: createCrowd deals a variant per body and would divide by zero.
    staffVariants: Math.max(1, parts.staff.length),
    clock: { ticks: parts.ticks, tickOfDay: parts.tickOfDay, weather: parts.weather },
  });
  const { network, venues } = facts;
  const { guests, router, staffPool } = state;
  const places = placesFor(venues, byKey(plot.layout.placements), network);
  const rentals = rentalsOf(shore, plot.layout.placements, hireOf);
  const bathing = { shore, rentals, span: spanOf(plan) };
  const cast = createCast(population, places, { sand: network.sand, swim: bathing });
  const overlay = buildOverlayField();
  const chair = parts.props.find((model) => model.id === WHEELCHAIR_ID);
  const crowd = buildCrowdField({
    crowd: state.crowd.crowd,
    models: parts.people,
    lightVolume: lighting.volume,
    drawnAs: cast,
    ...(chair ? { chair } : {}),
  });
  const staffCast = createCast(staffPool.count, places);
  const staff = buildCrowdField({
    crowd: state.staff.crowd,
    models: parts.staff,
    lightVolume: lighting.volume,
    drawnAs: staffCast,
  });
  const balloons = balloonsFor({
    shore,
    span: spanOf(plan),
    sky: parts.sky,
    lightVolume: lighting.volume,
  });
  const litterField = buildLitterField({
    models: parts.litter,
    capacity: LITTER_PIECES,
    lightVolume: lighting.volume,
  });
  const ballField = buildBallField({
    models: parts.props.filter((model) => model.id !== WHEELCHAIR_ID),
    capacity: BALLS_PER_KIND,
    lightVolume: lighting.volume,
  });
  const flames = buildFlamesField();
  const waters = seaWatersFor({
    shore,
    terrain,
    paved: plot.layout.paths,
    rentals,
    moorings,
    sea: parts.sea,
    people: parts.people,
    lightVolume: lighting.volume,
  });
  const sea = seaFor(waters, rentals);

  // The same object, not a copy: the routers' callbacks write the state they were built with.
  const resort: Resort = Object.assign(state, {
    lighting,
    world,
    shadows,
    construction,
    nameplates,
    crowd,
    staff,
    places,
    cast,
    staffCast,
    casting: {
      count: population,
      venueOf: (person: number) => router.venueIndexOf(person),
      isWaiting: (person: number) => router.isWaitingAt(person),
      queuePlace: (person: number) => router.queuePlaceOf(person),
      isAsleep: (person: number) => router.isAsleep(person),
      isPresent: (person: number) => guests.present[person] === 1,
      isChild: (person: number) => guests.child[person] === 1,
      partyOf: (person: number) => guests.party[person]!,
      inChair: (person: number) => usesWheelchair(guests, person),
      bathing: {
        restingUntil: (person: number) => router.restingUntil(person),
        // A getter: relocate replaces the crowd.
        get crowd() {
          return resort.crowd.crowd;
        },
      },
    },
    bathing,
    rentals,
    waters,
    drawnAt: {
      x: new Float32Array(population),
      y: new Float32Array(population),
      z: new Float32Array(population),
    },
    staffDrawnAt: {
      x: new Float32Array(staffPool.count),
      y: new Float32Array(staffPool.count),
      z: new Float32Array(staffPool.count),
    },
    launchSites: facts.launchSites,
    overlay,
    balloons,
    litterField,
    ballField,
    flames,
    burning: '',
    sea,
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
      nameplates.dispose();
      crowd.dispose();
      staff.dispose();
      balloons.dispose();
      litterField.dispose();
      ballField.dispose();
      flames.dispose();
      overlay.dispose();
      resort.sea.dispose();
      lighting.volume?.dispose();
    },
  });
  recastAll(resort);
  return resort;
}

const byKey = (placements: readonly Placement[]): ReadonlyMap<string, Placement> =>
  new Map(placements.map((placement) => [placement.key, placement]));

// Drawn only: the visit is the router's, and the boats keep the crowd's time.
function allowHire(resort: Resort): void {
  const venues = resort.rentalVenues;
  const hirersAt = (key: string): number => {
    const venue = venues.get(key);
    return venue === undefined ? 0 : insideAt(resort.cast, venue);
  };
  for (const [fleet, boats] of hutAllowances(resort.rentals, hireOf, hirersAt).entries()) {
    resort.sea.allowHire(fleet, boats);
  }
}

// After the ticks, never inside them: the cast only reads what the routers decided.
// A placement's fire, as the light it casts; its flames rise from below the light.
function fireOf(resort: Resort, key: string): LightAnchor | null {
  const placement = resort.plot.placements.find((each) => each.key === key);
  const hearth = placement ? hearthOf(placement) : null;
  if (!placement || !hearth) return null;
  const [fire] = anchorsFor({ ...placement, key: `${key}:fire` }, [hearth]);
  return { ...fire!, y: fire!.y + LIGHT_RISE };
}

// At the pits a bonfire is held at, for as long as it is running.
const firesOf = (resort: Resort): LightAnchor[] =>
  resort.venues.flatMap((venue, index) => {
    const lit = venue.hearth === true && resort.eventShowing[index] === 1;
    const fire = lit ? fireOf(resort, venue.key) : null;
    return fire ? [fire] : [];
  });

function lightTheFires(resort: Resort): void {
  const fires = firesOf(resort);
  const burning = fires.map((fire) => fire.key).join();
  if (burning === resort.burning) return;
  resort.burning = burning;
  resort.flames.burn(fires.map((fire) => ({ ...fire, y: fire.y - LIGHT_RISE })));
  resort.lighting.burn(fires);
}

function recastAll(resort: Resort): void {
  recast(resort.cast, resort.casting, resort.crowd.crowd.seatBy);
  allowHire(resort);
  const { staffRouter, venues } = resort;
  noteShows(
    resort.cast,
    (venue) =>
      staffRouter.performingAt(venue) ||
      resort.eventShowing[venue] === 1 ||
      resort.djOn[venue] === 1,
  );
  recastStaff(
    resort.staffCast,
    (worker) => {
      const venue = staffRouter.atWork(worker);
      return venue ? venues.indexOf(venue) : -1;
    },
    (worker) => resort.staffPool.role[worker]!,
    resort.staff.crowd,
    (worker) => isSweeping(staffRouter.taskOf(worker, recastTask)),
  );
}

// Shared by every recast: a task read per worker per frame must not allocate.
const recastTask = createStaffTask();

const isSweeping = (task: StaffTask): boolean => task.kind === 'sweep' && task.working;

const hutsKey = (rentals: readonly RentalHut[]): string =>
  rentals.map((hut) => `${hut.key}@${hut.x},${hut.z}`).join();

// Only the fleets, on the water the sea was built on: the buoys and the swim area keep their
// layout until the next load, so a hut built in play berths its boats outside the buoys.
function refleetAfterEdit(resort: Resort, handle: SceneHandle): void {
  const rentals = rentalsOf(resort.shore, resort.plot.placements, hireOf);
  if (hutsKey(rentals) === hutsKey(resort.rentals)) return;
  handle.scene.remove(resort.sea.group);
  resort.sea.dispose();
  resort.rentals = rentals;
  resort.sea = seaFor(resort.waters, rentals);
  handle.scene.add(resort.sea.group);
}

// Rebuilt with the venues and the network: a place points at a seat by its index there.
function recastAfterEdit(
  resort: Resort,
  network: WalkNetwork,
  wasStanding: readonly Venue[],
): void {
  const was = resort.cast;
  resort.places = placesFor(resort.venues, byKey(resort.plot.placements), network);
  resort.cast = createCast(resort.guests.count, resort.places, {
    sand: network.sand,
    swim: resort.bathing,
  });
  carryPlaces(
    was,
    resort.cast,
    (venue) => resort.venueIndex.get(wasStanding[venue]?.key ?? '') ?? -1,
  );
  resort.staffCast = createCast(resort.staffPool.count, resort.places);
  recastAll(resort);
  resort.crowd.drawAs(resort.cast);
  resort.staff.drawAs(resort.staffCast);
}

export interface ResortSlot {
  readonly current: () => Resort;
  attach(handle: SceneHandle): void;
  replace(prepared: PreparedResort, population?: number): Resort;
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
    replace(prepared, population) {
      // Disposed last: the ground is bound to the light volume, and freeing it first leaves a
      // material holding freed textures.
      const previous = resort;
      resort = buildResort({ ...parts, prepared, population });
      scene?.scene.remove(previous.world.group);
      scene?.scene.remove(previous.shadows.group);
      scene?.scene.remove(previous.construction.group);
      scene?.scene.remove(previous.nameplates.group);
      scene?.scene.remove(previous.crowd.group);
      // Without this, the previous plot's cleaners keep walking over the new one.
      scene?.scene.remove(previous.staff.group);
      scene?.scene.remove(previous.balloons.group);
      scene?.scene.remove(previous.litterField.group);
      scene?.scene.remove(previous.ballField.group);
      scene?.scene.remove(previous.flames.group);
      scene?.scene.remove(previous.overlay.group);
      scene?.scene.remove(previous.sea.group);
      scene?.scene.add(resort.world.group);
      scene?.scene.add(resort.shadows.group);
      scene?.scene.add(resort.construction.group);
      scene?.scene.add(resort.nameplates.group);
      scene?.scene.add(resort.crowd.group);
      scene?.scene.add(resort.staff.group);
      scene?.scene.add(resort.balloons.group);
      scene?.scene.add(resort.litterField.group);
      scene?.scene.add(resort.ballField.group);
      scene?.scene.add(resort.flames.group);
      scene?.scene.add(resort.overlay.group);
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
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupCost;
  readonly weather: Weather;
  readonly rain: RainField;
  readonly fireworks: FireworksField;
  readonly highlights: HighlightField;
}): ShowcaseStats {
  const { handle, catalogue, rain, fireworks, highlights } = parts;
  const { plot, world, shadows, construction, crowd, staff, balloons, litterField, overlay } =
    parts.resort;
  const { sea, lighting, ballField, flames } = parts.resort;
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
      litterField.drawCalls +
      ballField.drawCalls +
      flames.drawCalls +
      overlay.drawCalls +
      sea.drawCalls +
      rain.drawCalls +
      fireworks.drawCalls +
      highlights.drawCalls,
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
      litterField.triangleCount +
      ballField.triangleCount +
      flames.triangleCount +
      overlay.triangleCount +
      sea.triangleCount +
      rain.triangleCount +
      fireworks.triangleCount +
      highlights.triangleCount,
    shadowCount: shadows.count,
    occluderCount: lighting.occluderCount,
    sceneVoxelCount: totals.voxels,
    meshedVoxelCount: catalogue.meshedVoxelCount,
    lightCount: lighting.anchorCount,
    litLightCount: lighting.litCount,
    lightGridCells: lighting.spec ? cellCount(lighting.spec) : 0,
    lightGridBytes: lighting.spec ? gridByteSize(lighting.spec) : 0,
    lightBakeMs: lighting.bakeMs,
    skyBakeMs: lighting.skyBakeMs,
    dveMs: catalogue.dveMs,
    meshMs: catalogue.meshMs,
    meshedInWorker: catalogue.threaded,
    beds: { ...parts.resort.beds, unmade: unmadeCount(parts.resort.guests) },
    asleep: parts.resort.router.asleepCount,
    venues: parts.resort.router.occupancyTotals,
    routeFields: parts.resort.router.fieldCount,
    guests: { present: presentCount(parts.resort.guests), capacity: parts.resort.guests.count },
    staff: {
      total: parts.resort.duty.reduce((sum, each) => sum + each, 0),
      working: parts.resort.staffRouter.workingCount,
      roster: parts.resort.roster,
      recommended: parts.resort.recommended,
      hiring: parts.resort.hiring,
      zones: staffByZone(parts.resort.staffPool.role, parts.resort.zoneOf),
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

function voicesOf(resort: Resort): VoicesView {
  return { loudest: loudest(resort.thoughtDay, LOUDEST_SHOWN), reviews: resort.reviews };
}

// The rating is the one set at check-in, not a fresh one: it is what sizes the arrivals.
function statusOf(resort: Resort, clock: Pick<Clock, 'day'>, demand: Demand | null): StatusView {
  const { reached, venues } = stepFreeOf(resort);
  return {
    day: clock.day,
    rating: resort.rating,
    stepFree: { reached, venues },
    present: presentCount(resort.guests),
    beds: resort.beds,
    demand,
    staff: tallyStaff(resort.staffPool.role, (worker, into) =>
      resort.staffRouter.taskOf(worker, into),
    ),
  };
}

interface DrawnLitter {
  readonly litter: Litter | null;
  readonly version: number;
}

// Only on a change: litter moves a few times an hour, and a write touches every slot. The grid
// is compared too, so a new resort whose version happens to match is still drawn.
function drawLitter(resort: Resort, drawn: DrawnLitter): DrawnLitter {
  const { litter } = resort;
  if (drawn.litter === litter && drawn.version === litter.version) return drawn;
  const network = resort.crowd.crowd.network;
  const index = pavingIndexOf(network);
  const groundOf = (tileX: number, tileZ: number): number | null => {
    const node = index.at(tileX, tileZ)?.[0];
    if (node !== undefined) return network.nodes[node]!.y;
    return isBeach(resort.shore, tileX, tileZ) ? BEACH_SURFACE : null;
  };
  resort.litterField.write(
    piecesFor(litter, groundOf, LITTER_PIECES, LITTER_MODELS.length, litterWindowOf(resort)),
  );
  return { litter, version: litter.version };
}

const sandSlotLists = new WeakMap<WalkNetwork, readonly TileAt[]>();

// The overlay's slots past the node count, in this order; sand a node stands on is drawn by it.
// Only the sand guests may roam, which is the land owned.
function sandSlotsOf(network: WalkNetwork, shore: Shore | null): readonly TileAt[] {
  let slots = sandSlotLists.get(network);
  if (!slots) {
    const index = pavingIndexOf(network);
    const span = network.beach?.span ?? { from: 0, to: 0 };
    slots = beachTilesFor(shore).filter(
      ({ tileX, tileZ }) => tileX >= span.from && tileX < span.to && !index.at(tileX, tileZ),
    );
    sandSlotLists.set(network, slots);
  }
  return slots;
}

// The first node on each tile stands for it, so a stair tile with two stands gets one quad.
function overlayTilesOf(network: WalkNetwork, shore: Shore | null): OverlayTile[] {
  const index = pavingIndexOf(network);
  const tiles: OverlayTile[] = [];
  for (const [node, { tileX, tileZ, y }] of network.nodes.entries()) {
    if (index.at(tileX, tileZ)?.[0] !== node) continue;
    tiles.push({ x: (tileX + 0.5) * TILE_VOXELS, y, z: (tileZ + 0.5) * TILE_VOXELS, node });
  }
  return [...tiles, ...sandOverlayTilesOf(network, shore)];
}

function sandOverlayTilesOf(network: WalkNetwork, shore: Shore | null): OverlayTile[] {
  return sandSlotsOf(network, shore).map(({ tileX, tileZ }, k) => ({
    x: (tileX + 0.5) * TILE_VOXELS,
    y: BEACH_SURFACE,
    z: (tileZ + 0.5) * TILE_VOXELS,
    node: network.nodes.length + k,
  }));
}

function zonesOfSlots(zones: Zones, network: WalkNetwork, shore: Shore | null): Int8Array {
  const slots = [...network.nodes, ...sandSlotsOf(network, shore)];
  return Int8Array.from(slots, (tile) => zoneAt(zones, tile.tileX, tile.tileZ));
}

// Per graph, which an edit replaces along with the venues, so a sweep is kept until the next
// rebuild rather than rerun every hour.
const reachSweeps = new WeakMap<WalkNetwork, Map<GuestNeed, Int32Array>>();

function hopsTo(resort: Resort, need: GuestNeed): Int32Array {
  const network = resort.crowd.crowd.network;
  let sweeps = reachSweeps.get(network);
  if (!sweeps) {
    sweeps = new Map();
    reachSweeps.set(network, sweeps);
  }
  let hops = sweeps.get(need);
  if (!hops) {
    hops = hopsFrom(network, reachSeedsFor(resort.venues, need, network, pavingIndexOf(network)));
    sweeps.set(need, hops);
  }
  return hops;
}

// Per graph, as the reach sweeps are: venues and gates change only with the graph an edit makes.
const stepFreeSweeps = new WeakMap<WalkNetwork, StepFreeReach>();

function stepFreeOf(resort: Resort): StepFreeReach {
  const network = resort.crowd.crowd.network;
  let reach = stepFreeSweeps.get(network);
  if (!reach) {
    const index = pavingIndexOf(network);
    const gates = [
      ...new Set(resort.gateways.flatMap((gateway) => doorsFor(gateway, index).nodes)),
    ].toSorted((a, b) => a - b);
    reach = stepFreeReachOn(
      network,
      resort.venues,
      (venue) => doorsFor(venue, index, network).nodes,
      gates,
    );
    stepFreeSweeps.set(network, reach);
  }
  return reach;
}

// Only litter is fielded on the sand; every other layer leaves the sand slots hidden.
function overlayValues(resort: Resort, kind: OverlayKind): Float32Array {
  const { network } = resort.crowd.crowd;
  const { nodes } = network;
  const { litter } = resort;
  const sand = kind === 'litter' ? sandSlotsOf(network, resort.shore) : [];
  return overlayValuesFor(kind, {
    footfall: resort.footfall,
    nodes: nodes.length + sand.length,
    tileOf: (node) => nodes[node] ?? sand[node - nodes.length]!,
    hopsTo: (need) => hopsTo(resort, need),
    stepFree: () => stepFreeOf(resort).nodes,
    scenery: resort.scenery,
    litter: { tilesX: litter.tilesX, tilesZ: litter.tilesZ, value: litter.level },
  });
}

function relabelVenues(resort: Resort): void {
  resort.venues = relabelled(resort.venues, resort.names);
  resort.siteVenues = withBeach(resort.venues, resort.crowd.crowd.network);
  resort.router.relabel(resort.venues);
}

const WEEK_TICKS = 7 * TICKS_PER_DAY;

// Follows the run rather than its start and end steps, so a load mid-show, a call-off and a
// dragged clock all come out right with no case of their own.
function syncFireworks(resort: Resort, field: FireworksField, now: number): void {
  const run = runningShowOf(resort);
  if (!run) {
    field.stop();
    return;
  }
  const key = bookingDayKey(run.occurrence);
  if (field.key === key) return;
  const { occurrence } = run;
  const show = planShow({
    tier: tierIdOf(occurrence.tier),
    seed: showSeed(occurrence),
    sites: resort.launchSites,
  });
  field.play(show, playheadFor(occurrence, now, show.length), key);
}

// Timed from the first frame, which the recorder also counts from; played again should a run
// outlast it.
function playBenchShow(resort: Resort, field: FireworksField, bench: BenchConfig): void {
  if (!bench.fireworks || field.show) return;
  if (resort.launchSites.length === 0) console.warn('bench: no beach to launch fireworks from');
  const seconds = (bench.warmupFrames + bench.measureFrames) * benchStep(bench);
  const { show, from } = benchShow(bench.fireworks, resort.launchSites, seconds);
  field.play(show, from, 'bench');
}

// While a run's show plays, its half hour lasts as long as the show on screen.
function showPaceOf(resort: Resort, field: FireworksField, clock: Clock): number {
  const run = runningShowOf(resort);
  if (!run || !field.show || field.key !== bookingDayKey(run.occurrence)) return 1;
  return showPace({
    speed: clock.speed,
    ticksLeft: run.occurrence.end - clock.ticks,
    secondsLeft: field.show.length - field.playhead,
  });
}

// Flights already up finish, as in a shower.
const lanternsOf = (resort: Resort, clock: Clock): number =>
  resort.fireworksNight ? 0 : clock.balloonReadiness;

function quietBeachOf(resort: Resort, now: number): Venue | null {
  const beach = resort.siteVenues[beachIndexOf(resort)];
  if (!beach || resort.beachTiles === 0) return null;
  const day = dayAt(now);
  const week = Array.from({ length: 7 }, (_, offset) =>
    occurrencesOn(resort.events.programme, day + offset),
  ).flat();
  return fireworksDrought(resort.history, week) ? beach : null;
}

// The first stage by key, so the line points at the same one from hour to hour.
function idleStageOf(resort: Resort, now: number): Venue | null {
  const stages = resort.venues.filter((venue) => venue.stage === true);
  if (stages.length === 0) return null;
  // The daily welcome would otherwise keep this line quiet for good.
  const [next] = nextEvents(withoutBuiltIns(resort.events.programme), now, 1);
  if (next && next.start < now + WEEK_TICKS) return null;
  return stages.toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))[0]!;
}

function programmeFactsOf(resort: Resort, clock: Clock): ProgrammeFacts {
  const forecast: DayForecast[] = Array.from({ length: 7 }, (_, offset) => ({
    day: clock.day + offset,
    weather: weatherOnDay(clock, clock.day + offset),
    pinned: clock.forcedWeather !== null,
  }));
  return {
    programme: resort.events.programme,
    stages: resort.venues.filter((venue) => venue.stage === true),
    now: clock.ticks,
    mode: resort.ledger.mode,
    balance: resort.ledger.balance,
    forecast,
    mix: partyMixOf(resort.guests),
    animators: resort.roster.animator,
    beachRoom: beachIndexOf(resort) >= 0 ? watchRoom(resort.beachTiles) : 0,
    fireRoom: resort.venues[heldAt({ kind: 'beach' }, 'bonfire', resort.venues)]?.capacity ?? 0,
  };
}

// Edits drop the bookings of a stage pulled down and move a built-in to a stage left standing.
// The beach's stay while any sand is owned, so paving over its gates calls a show off instead.
function keepProgrammeStanding(resort: Resort, wasStanding: readonly Venue[]): void {
  const stages = stageKeysOf(resort.venues);
  const sites = new Set(resort.beachTiles > 0 ? [...stages, siteKey({ kind: 'beach' })] : stages);
  const kept: Programme = keepStanding(resort.events.programme, sites);
  const rank = stageRank(resort.venues);
  const before = new Set(stageKeysOf(wasStanding));
  const built = stages.filter((key) => !before.has(key));
  resort.events.programme = toNewStage(withBuiltIns(kept, BUILT_INS, stages, rank), built, rank);
}

function wantingOn(resort: Resort): { readonly [need in GuestNeed]: number } {
  const { guests, needs } = resort;
  const counted = { hunger: 0, thirst: 0, energy: 0, fun: 0, hygiene: 0, health: 0 };
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    const want = strongestNeed(needs, guests, person);
    if (want) counted[want.need]++;
  }
  return counted;
}

// The beach last, as the guests' router lists it. Water a lifeguard is walking to is not
// reported: right after an edit every lifeguard is on the way.
function unwatchedOn(
  resort: Resort,
  effect: WeatherEffect,
  tickOfDay: number,
): ReadonlySet<string> {
  const { staffRouter, venues } = resort;
  const { network } = resort.crowd.crowd;
  const beach = beachVenueFor(network);
  const water = beach ? [...venues, beach] : venues;
  const guarded = (venue: number): boolean =>
    venue < venues.length ? staffRouter.guarded(venue) : staffRouter.beachGuarded;
  const open = (venue: number): boolean => openNow(water[venue]!, effect, tickOfDay);
  return unwatched(water, guarded, network.posts.length, open);
}

function brokenOn(resort: Resort, now: number): ReadonlyMap<string, number> {
  const { breakdowns, venues } = resort;
  const down = new Map<string, number>();
  for (const [index, venue] of venues.entries()) {
    if (isBroken(breakdowns, index)) down.set(venue.key, now - breakdowns.since[index]!);
  }
  return down;
}

function hurtCount(resort: Resort): number {
  const { guests, needs } = resort;
  let count = 0;
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1 && needs.level.health[person]! < 1) count++;
  }
  return count;
}

// Once a simulated hour and on an edit, never per frame: it walks the guest list three times.
function factsNow(resort: Resort, weather: Weather, now: number): ResortFacts {
  const { guests, router } = resort;
  const effect = weatherEffect(weather);
  return {
    venues: resort.venues,
    lodgings: resort.lodgings,
    present: presentCount(guests),
    homeless: homelessCount(guests),
    bedsFree: guests.freeBeds.reduce((free, home) => free + home, 0),
    bedsUnmade: unmadeCount(guests),
    wanting: wantingOn(resort),
    balks: router.dayBalks(),
    visits: router.dayVisits(),
    unreachable: resort.unreachable,
    notStepFree: stepFreeOf(resort).cutOff,
    open: resort.open,
    entrance: router.arrivalNode >= 0,
    reception: router.receptionReachable,
    bedsTotal: resort.beds.total,
    litter: litterSummary(resort.litter, litterWindowOf(resort)),
    // By key: advice names a building, and indices change on the next edit.
    cleanliness: new Map(
      resort.venues.map((venue, index) => [venue.key, cleanliness(resort.upkeep, index)]),
    ),
    unwatched: unwatchedOn(resort, effect, now % TICKS_PER_DAY),
    broken: brokenOn(resort, now),
    shortStaffed: shortOf(resort.hiring, resort.recommended),
    hurt: hurtCount(resort),
    depots: resort.depots.length,
    cleanersOnDuty: resort.staffPool.role.filter(
      (role, worker) => role === 'cleaner' && resort.duty[worker] === 1,
    ).length,
    // The router's own isOpenIn, so the panel and the door agree about what is shut. The weather's
    // alone: the rain is not to blame for a breakdown, which has its own line.
    closed: new Set(
      resort.venues
        .filter((venue) => !isOpenIn(shelterOf(venue), effect))
        .map((venue) => venue.key),
    ),
    shut: new Set(
      resort.venues
        .filter((venue) => !openAt(venue.hours, now % TICKS_PER_DAY))
        .map((venue) => venue.key),
    ),
    idleStage: idleStageOf(resort, now),
    quietBeach: quietBeachOf(resort, now),
    welcomeless: stageKeysOf(resort.venues).length === 0 ? resort.today.arrived : 0,
  };
}

export interface Clock extends ResortClock {
  readonly litLamps: number;
  relight(): void;
}

function createClock(
  handle: SceneHandle,
  resort: () => Resort,
  startTime: number,
  glow: () => ShowLight,
): Clock {
  const clock = createResortClock(startTime, WEATHER_SEED);
  const sky = createSkyApplier({ handle, resort, glow });
  sky.apply(clock);

  const relight = (): void => {
    sky.reset();
    sky.apply(clock);
    // Otherwise its windows open on the previous plot's sleeping share.
    lightRooms(resort(), null);
  };

  return {
    get time() {
      return clock.time;
    },
    get day() {
      return clock.day;
    },
    get weather() {
      return clock.weather;
    },
    get forcedWeather() {
      return clock.forcedWeather;
    },
    get tickOfDay() {
      return clock.tickOfDay;
    },
    get ticks() {
      return clock.ticks;
    },
    get label() {
      return clock.label;
    },
    get speed() {
      return clock.speed;
    },
    get litLamps() {
      return sky.lampFactor > 0 ? resort().lighting.litCount : 0;
    },
    get balloonReadiness() {
      return clock.balloonReadiness;
    },
    get running() {
      return clock.running;
    },
    relight,
    advance(elapsedSeconds, pace) {
      const ticks = clock.advance(elapsedSeconds, pace);
      sky.apply(clock);
      return ticks;
    },
    follow(next, elapsedSeconds) {
      const ticks = clock.follow(next, elapsedSeconds);
      sky.apply(clock);
      return ticks;
    },
    restart: clock.restart,
    setTime: clock.setTime,
    setSpeed: clock.setSpeed,
    setWeather(next) {
      clock.setWeather(next);
      // Applied now: pinning the weather while paused is what the button is for.
      sky.apply(clock);
    },
    snapshot: clock.snapshot,
    restore(saved) {
      clock.restore(saved);
      relight();
    },
  };
}

function createStatsReader(parts: {
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupTracker;
  readonly mountStarted: number;
  readonly weather: () => Weather;
  readonly rain: RainField;
  readonly fireworks: FireworksField;
  readonly highlights: HighlightField;
}): () => ShowcaseStats {
  const startup: StartupCost = {
    startupMs: Math.round(performance.now() - parts.mountStarted),
    startupFrames: parts.startup.frames(),
  };
  parts.startup.stop();
  return () => sceneStats({ ...parts, resort: parts.resort(), weather: parts.weather(), startup });
}

interface BenchRecorder {
  readonly record: (frameMs: number, cpuMs: number) => void;
  readonly recordGpu: (durationMs: number) => void;
  readonly result: () => BenchResult | null;
}

// Published as window.__voxBench, which scripts/bench.ts reads.
function createBenchRecorder(parts: {
  readonly bench: BenchConfig;
  readonly handle: SceneHandle;
  readonly stats: () => ShowcaseStats;
  readonly litLamps: () => number;
  readonly clockLabel: () => string;
}): BenchRecorder {
  const { bench, handle, stats, litLamps } = parts;
  const frames: number[] = [];
  const cpuFrames: number[] = [];
  const gpuFrames: number[] = [];
  let seen = 0;
  let measuredFrom = 0;
  let result: BenchResult | null = null;

  return {
    record(frameMs, cpuMs) {
      if (result) return;
      seen++;
      if (seen <= bench.warmupFrames) {
        measuredFrom = performance.now();
        return;
      }
      frames.push(frameMs);
      cpuFrames.push(cpuMs);
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
        cpu: roundStats(summarizeFrames(cpuFrames)),
        clock: parts.clockLabel(),
        timings: summarizeTimings(performance.getEntriesByType('measure'), measuredFrom),
      };
      (globalThis as Record<string, unknown>).__voxBench = result;
    },
    recordGpu(durationMs) {
      if (!result) gpuFrames.push(durationMs);
    },
    result: () => result,
  };
}

// Damping would nudge the camera for the first second, and runs must compare on the same pixels.
// Mode changes are refused during a bench: every preset and recorded number is perspective.
function pinCamera(handle: SceneHandle): void {
  handle.controls.enabled = false;
  handle.controls.enableDamping = false;
}

// Only here: every list is shared by every resort, the crowd, the staff, the sky and the bay.
function disposeCatalogue(catalogue: MeshedCatalogue): void {
  const all = [
    catalogue.geometries,
    catalogue.people,
    catalogue.staff,
    catalogue.sky,
    catalogue.sea,
    catalogue.litter,
    catalogue.props,
  ];
  for (const models of all) {
    for (const model of models) {
      for (const copy of [model, model.coarse]) {
        copy?.lit?.dispose();
        copy?.emissive?.dispose();
        copy?.water?.dispose();
        copy?.window?.dispose();
        copy?.canopy?.dispose();
      }
    }
  }
}

const STAIRS_FALLBACK: BuildNote = {
  title: 'Stairs here',
  message: 'A ramp needs two straight tiles below the step.',
};

function moneyRefusalFor(id: string | null, balance: number): string {
  const bank = `there is ${balance.toLocaleString('en-US')} in the bank`;
  if (id === null) return `Reshaping a tile costs ${DIG_COST}, and ${bank}.`;
  const name = objectTypeById(id).label.toLowerCase();
  const article = /^[aeiou]/.test(name) ? 'An' : 'A';
  return `${article} ${name} costs ${buildCostOf(id).toLocaleString('en-US')}, and ${bank}.`;
}

const GATE_REFUSAL: BuildNote = {
  title: 'Entrance away from the edge',
  message: "An entrance must face land you don't own.",
};

function landRefusalFor(mode: GameMode): BuildNote {
  return {
    title: 'Not your land',
    message: `${mode === 'sandbox' ? 'Claim' : 'Buy'} this land first.`,
  };
}

function parcelRefusalFor(price: number, balance: number): string {
  const bank = `there is ${balance.toLocaleString('en-US')} in the bank`;
  return `A parcel of land costs ${price.toLocaleString('en-US')}, and ${bank}.`;
}

function refusalFor(refusal: Refusal, ledger: Ledger): BuildNote {
  switch (refusal.kind) {
    case 'land':
      return landRefusalFor(ledger.mode);
    case 'gate':
      return GATE_REFUSAL;
    case 'parcel':
      return {
        title: 'Not enough money',
        message: parcelRefusalFor(refusal.price, ledger.balance),
      };
    default:
      return { title: 'Not enough money', message: moneyRefusalFor(refusal.id, ledger.balance) };
  }
}

// Served by `pnpm dev` from the repository root, which is the only server a benchmark runs against.
const REFERENCE_RESORT = '/fixtures/reference-resort.json';

// A benchmark gets a fixed plot, authored or the reference resort: runs only compare if the scene
// is the same.
async function startingSource(
  bench: BenchConfig | null,
  params: ResortParams,
): Promise<ResortSource> {
  if (!bench) return { kind: 'generate', params };
  return bench.plot === 'reference' ? referenceSource(bench) : { kind: 'authored' };
}

// Thrown, so the bench's error reaches `.hud-error` and scripts/bench.ts stops on it.
async function referenceSource(bench: BenchConfig): Promise<ResortSource> {
  const refusal = benchRefusal(bench);
  if (refusal) throw new Error(refusal);
  const response = await fetch(REFERENCE_RESORT);
  if (!response.ok) throw new Error(`No reference resort at ${REFERENCE_RESORT}`);
  return { kind: 'saved', world: referenceWorldOf(await response.json()) };
}

const fixedStepOf = (bench: BenchConfig | null): number | null => (bench ? benchStep(bench) : null);

function crowdStep(fixedStep: number | null, walking: boolean, elapsed: number): number {
  if (fixedStep !== null) return fixedStep;
  return walking ? elapsed : 0;
}

// Pressed as a player would press it, and told to the HUD, so its buttons read what runs.
function startBenchClock(
  clock: Clock,
  bench: BenchConfig | null,
  tell?: (speed: SimSpeed) => void,
): void {
  if (!bench?.speed) return;
  clock.setSpeed(bench.speed);
  tell?.(bench.speed);
}

// Never under a benchmark: a drifting camera would draw a different frame on every run.
function driftFor(
  options: ShowcaseOptions,
  bench: BenchConfig | null,
  handle: SceneHandle,
): CameraDrift | null {
  if (!options.welcome || bench) return null;
  return startCameraDrift(handle.camera, handle.controls.target);
}

function startTimeOf(bench: BenchConfig | null, welcome: boolean): number {
  if (bench) return bench.time;
  return welcome ? wallTimeOf(new Date()) : INITIAL_TIME;
}

// A wall clock rather than a speed: behind the welcome screen the resort shows the player's hour.
function stepClock(clock: Clock, welcome: boolean, elapsed: number, pace: number): number {
  return welcome ? clock.follow(wallTimeOf(new Date()), elapsed) : clock.advance(elapsed, pace);
}

function loaded<T>(step: LoadingStep, onLoading?: (step: LoadingStep) => void) {
  return (value: T): T => {
    onLoading?.(step);
    return value;
  };
}

function detailFrom(bench: BenchConfig | null): boolean {
  return bench?.detail ?? true;
}

// Over the roof of the venue on the tile, or over the ground where it is litter. Resolved once per
// advice refresh, not per frame.
function markerAnchorOf(
  resort: Resort,
  tile: { readonly tileX: number; readonly tileZ: number },
): Anchor {
  const key = resort.occupancy.keyAt({ x: tile.tileX, z: tile.tileZ });
  const venue = key === undefined ? undefined : resort.venues.find((each) => each.key === key);
  if (!venue) {
    return {
      x: (tile.tileX + 0.5) * TILE_VOXELS,
      y: groundUnder(resort, tile) + LITTER_MARKER_LIFT,
      z: (tile.tileZ + 0.5) * TILE_VOXELS,
    };
  }
  return roofOver(venue, groundUnder(resort, venue), objectTypeById(venue.id).model.height);
}

// Venues only, lodging among them: a bench or a lamp is not a place anyone looks for.
const HIGHLIGHT_KINDS: ReadonlyMap<string, HighlightKind> = new Map(
  OBJECT_TYPES.filter((type) => type.venue !== null).map((type) => [
    type.id,
    { family: type.family, label: type.label, sign: signOf(type.id) },
  ]),
);

const highlightKindOf = (id: string): HighlightKind | null => HIGHLIGHT_KINDS.get(id) ?? null;

const LITTER_MARKER_LIFT = 8;

function lookAtWorker(handle: SceneHandle, resort: Resort, worker: number | null): void {
  if (worker === null) return;
  const at = writeDrawn(resort, worker, { x: 0, y: 0, z: 0 });
  if (!Number.isNaN(at.x)) handle.lookAt(at);
}

function sendToPlace(resort: Resort, role: OrderRole, key: string | null): void {
  const venue = key === null ? -1 : venueIndexOf(resort, key);
  if (venue >= 0) resort.staffRouter.order(role, { venue });
}

function sendToTile(resort: Resort, at: { readonly tileX: number; readonly tileZ: number }) {
  resort.staffRouter.order('cleaner', { tile: at.tileZ * resort.litter.tilesX + at.tileX });
}

// NaN for anybody off the plot as well as out of sight: a worker gone home is not to be clicked.
function staffWhereDrawn(resort: Resort) {
  const { staff, staffCast, staffDrawnAt } = resort;
  const drawn = whereDrawn(staff.crowd, staffCast, { count: staff.count, ...staffDrawnAt });
  for (let worker = 0; worker < drawn.count; worker++) {
    if (staff.crowd.offPlot[worker] !== 1) continue;
    drawn.x[worker] = Number.NaN;
    drawn.y[worker] = Number.NaN;
    drawn.z[worker] = Number.NaN;
  }
  return drawn;
}

// Every module in the order its readers expect: the guests before the routers that read them
// and the routers before the crowds they steer.
function restoreGame(resort: Resort, saved: GameSnapshot, clock: Clock): void {
  restoreResort(resort, saved.resort);
  // The resort was just built off the layout; a save from before venues had names draws them.
  resort.names = assignNames(resort.names, namedPlacesOf(resort.plot.layout.placements));
  relabelVenues(resort);
  // Before the staff router's restore, which reads the duty.
  Object.assign(resort, rosterNow(resort));
  rezone(resort);
  resort.router.restore(saved.router);
  resort.staffRouter.restore(saved.staffRouter);
  const { count } = resort.guests;
  resort.events = saved.events ? restoreEvents(saved.events, count) : createEvents(count);
  resort.events.programme = withBuiltIns(
    resort.events.programme,
    BUILT_INS,
    stageKeysOf(resort.venues),
    stageRank(resort.venues),
  );
  resort.newcomers = partiesArrivedOn(resort.guests, dayAt(saved.clock.ticks - CHECK_IN_TICK));
  resort.settled.clear();
  refreshEventVenues(resort, saved.clock.ticks);
  refreshInvited(resort);
  resort.crowd.adopt(restoreCrowd(resort.crowd.crowd, saved.crowd));
  resort.staff.adopt(restoreCrowd(resort.staff.crowd, saved.staff));
  recastAll(resort);
  clock.restore(saved.clock);
  refreshKeen(resort, clock);
  // Not saved: a party sent home early may go out again once, which is harmless.
  resort.homeEarly.clear();
  resort.nightOwls.clear();
  refreshNightOut(resort, clock);
}

// The walk graph and everything indexed by its nodes, rebuilt from the plot's lists after an edit.
function rebuildAfterEdit(resort: Resort, ticks: number, handle: SceneHandle): void {
  const { plan, plot, shore, terrain, crowd } = resort;
  const wasStanding = resort.venues;
  const facts = plotFactsOf({ plan, shore, terrain }, plot, resort.names);
  knowPaving(facts);
  const { network } = facts;
  Object.assign(resort, keptFactsOf(facts), { launchSites: facts.launchSites });
  // Before the router's rebuild, whose findHomes maps the new home indices.
  rehome(resort.guests, facts.homes);
  const beds = bedCount(resort.guests);
  resort.beds = { total: beds.beds, taken: beds.taken };
  // By key: surviving venues keep their dirt, and new ones start clean.
  resort.upkeep = carryUpkeep(resort.upkeep, wasStanding, resort.venues);
  resort.breakdowns = carryBreakdowns(resort.breakdowns, wasStanding, resort.venues);
  // Sand under a building just placed would never be swept.
  pruneLitter(
    resort.litter,
    (x, z) =>
      facts.paving.at(x, z) !== undefined ||
      (isBeach(shore, x, z) && resort.occupancy.keyAt({ x, z }) === undefined),
  );
  keepProgrammeStanding(resort, wasStanding);
  refreshInvited(resort);
  refreshEventVenues(resort, ticks);
  resort.router.rebuild(resort.venues, resort.lodgings, resort.gateways, network);
  resort.staffRouter.rebuild(resort.venues, network, resort.lodgings, resort.depots);
  crowd.relocate(network, (person) => resort.router.holds(person));
  resort.staff.relocate(network);
  staffTheResort(resort);
  // Before the recast, which sets the new fleets' allowances.
  refleetAfterEdit(resort, handle);
  recastAfterEdit(resort, network, wasStanding);
  resort.footfall = createFootfall(network.nodes.length);
}

export async function mountShowcase(options: ShowcaseOptions): Promise<Showcase> {
  const { canvas, onFrame, hud, onSpeedChange } = options;
  const mountStarted = performance.now();
  const startup = trackStartupFrames();

  const bench = parseBenchConfig(globalThis.location?.search ?? '');
  const timing = timesGpu(globalThis.location?.search ?? '');

  const preparer = createResortPreparer({
    forceMainThread: bench?.forceMainThreadMeshing ?? false,
  });
  const starting = startingParams(bench);
  const identity: ResortIdentity = { params: starting, name: resortNameFor(starting.seed) };
  const [catalogue, first] = await Promise.all([
    meshModels(scratchForModels(), bench).then(loaded('models', options.onLoading)),
    startingSource(bench, starting)
      .then((source) => preparer.prepare(prepRequestFor(source, bench)))
      .then(loaded('resort', options.onLoading)),
  ]);

  const slot = createResortSlot({
    prepared: first,
    // Not called until a frame steps somebody, by which time the clock exists.
    tickOfDay: () => clock.tickOfDay,
    ticks: () => clock.ticks,
    weather: () => clock.weather,
    geometries: catalogue.geometries,
    people: catalogue.people,
    staff: catalogue.staff,
    sky: catalogue.sky,
    sea: catalogue.sea,
    litter: catalogue.litter,
    props: catalogue.props,
  });
  const current = slot.current;

  // Kept for the showcase's lifetime: the terrain materials read it, and a new one would recompile them.
  const ownership = createOwnershipMask();
  ownership.update(current().rights, current().plan);

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
    groundShade: ownership.shade,
    // Wall-clock times cap at the refresh rate; the GPU's timers keep discriminating.
    trackTimestamp: timing,
    forceWebGL: bench?.forceWebGL ?? false,
  });
  handle.scene.add(current().world.group);
  handle.scene.add(current().shadows.group);
  handle.scene.add(current().construction.group);
  handle.scene.add(current().nameplates.group);
  handle.scene.add(current().crowd.group);
  handle.scene.add(current().staff.group);
  handle.scene.add(current().balloons.group);
  handle.scene.add(current().litterField.group);
  handle.scene.add(current().ballField.group);
  handle.scene.add(current().flames.group);
  handle.scene.add(current().overlay.group);
  handle.scene.add(current().sea.group);
  // Not per resort: rain falls over the camera, not the plot.
  const rain = buildRainField(createRaindrops(MAX_DROPS, RAIN_SEED));
  handle.scene.add(rain.group);
  // Not per resort either: a new plot clears it rather than building another.
  const fireworks = buildFireworksField();
  handle.scene.add(fireworks.group);
  // Not per resort either: the picks outlast a new plot, and the rings are placed again for it.
  const highlights = buildHighlightField();
  handle.scene.add(highlights.group);
  slot.attach(handle);

  let fpsState = createFpsState();
  let frameCost = createFrameCostState();
  // Arrives a few frames after it was drawn.
  let gpuMs: number | null = null;
  let running = true;
  let lastTimeMs: number | null = null;
  // Kept across rebuilds, though a new cast starts everybody on a fresh leg anyway.
  let actSeconds = 0;
  let lastShare: number | null = null;
  let drawnLitter: DrawnLitter = { litter: null, version: -1 };
  let drift = driftFor(options, bench, handle);
  const fixedStep = fixedStepOf(bench);
  const timer = createFrameTimer(bench !== null);
  handle.controls.enabled = drift === null;
  let drawnFirst = false;
  const clock = createClock(
    handle,
    current,
    startTimeOf(bench, drift !== null),
    () => fireworks.light,
  );
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

  // Its own function for the same reason as the weather's. A bench plays only the show it asks for.
  const advanceFireworks = (elapsedSeconds: number): void => {
    if (bench) playBenchShow(current(), fireworks, bench);
    else syncFireworks(current(), fireworks, clock.ticks);
    fireworks.advance(elapsedSeconds);
    current().flames.advance(elapsedSeconds);
  };

  // Its own function to keep the render loop's branching down, which fallow:audit measures.
  const advanceWeather = (elapsedSeconds: number): void => {
    const target = handle.controls.target;
    rain.advance(elapsedSeconds, rainfallFor(clock.weather, rainView()), target);
    if (clock.weather === lastWeather) return;
    lastWeather = clock.weather;
    hud.publish({ weather: lastWeather });
  };

  if (bench) pinCamera(handle);
  // Through the same door the HUD uses, so the measured frame is what somebody watching a storm
  // gets.
  if (bench?.weather) clock.setWeather(bench.weather);
  startBenchClock(clock, bench, onSpeedChange);

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

  const openIsometric = (): void => {
    if (drift === null) return;
    setCameraMode('isometric');
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

  let singleKeys = true;
  const cameraKeys = createCameraKeys({
    mode: () => handle.cameraMode,
    onModeChange: (mode) => {
      if (drift) return;
      setCameraMode(mode);
      hud.publish({ camera: cameraView() });
    },
    onTurn: (quarters) => {
      if (drift) return;
      setIsoDirection(turnDirection(handle.isoDirection, quarters));
      hud.publish({ camera: cameraView() });
    },
    singleKeys: () => singleKeys,
  });

  const viewSize = { width: 0, height: 0 };
  const resize = (): void => {
    viewSize.width = canvas.clientWidth || globalThis.innerWidth;
    viewSize.height = canvas.clientHeight || globalThis.innerHeight;
    handle.resize(viewSize.width, viewSize.height);
    // The rain is sized in pixels, so a resize changes it.
    buffer = handle.drawingBufferSize();
  };
  globalThis.addEventListener('resize', resize);
  // Measured here rather than per frame: reading the canvas's size forces a layout.
  viewSize.width = canvas.clientWidth || globalThis.innerWidth;
  viewSize.height = canvas.clientHeight || globalThis.innerHeight;

  const markerSpots = createMarkerSpots(MAX_MARKERS);
  const staffPins = createStaffPinner(current().staffPool.count);
  let staffPinsShown = false;
  const signSpots = createSignSpots();
  let signsWanted = false;

  const { onHear } = options;
  const listen =
    bench || !onHear
      ? () => {}
      : createHearing({ handle, resort: current, clock, view: viewSize, fireworks, onHear });

  const statsNow = createStatsReader({
    handle,
    resort: current,
    catalogue,
    startup,
    mountStarted,
    weather: () => clock.weather,
    rain,
    fireworks,
    highlights,
  });

  // A span rather than a relay per spadeful: one relay a frame, over every column touched.
  let groundColumns: TileColumns | null = null;

  // Coalesced by tellHud: a placement costs a scan and a React render, and a drag places one per move.
  let counted = false;

  // Coalesced by tellHud: a drag spends once per tile.
  let spent = false;

  // Each report re-renders the whole HUD; the flags stay set until the gap passes, so the last
  // change of a drag is still told. One patch, so its stats and money reach React together.
  let toldAt: number | null = null;
  const heldReport = (): Partial<HudState> => ({
    ...(counted ? { stats: statsNow() } : {}),
    ...(spent ? { ledger: current().ledger } : {}),
  });
  const tellHud = (nowMs: number): void => {
    if (!(counted || spent) || !reportDue(toldAt, nowMs)) return;
    hud.publish(heldReport());
    counted = false;
    spent = false;
    toldAt = nowMs;
  };

  const money: Purse = {
    canAfford: (amount) => canAfford(current().ledger, amount),
    spend(reason, amount) {
      const resort = current();
      resort.ledger = record(resort.ledger, reason, -amount);
      spent = true;
      options.onDirty?.();
    },
    refund(amount) {
      const resort = current();
      resort.ledger = record(resort.ledger, 'demolish', amount);
      spent = true;
      options.onDirty?.();
    },
  };

  const refused = (refusal: Refusal): void =>
    options.onRefused?.(refusalFor(refusal, current().ledger));

  // Told once as the pointer comes onto such a tile, not on every move across it.
  let fellBack = false;
  const fallback = (now: boolean): void => {
    if (now && !fellBack) options.onBuildNote?.(STAIRS_FALLBACK);
    fellBack = now;
  };

  // Never under a bench, whose runs place nothing a player did.
  const cue = (played: BuildCue): void => {
    if (!bench) options.onCue?.(played);
  };

  const landPrice = (): number => landPriceOf(current().ledger.mode);
  const landNow = (): LandView => landViewOf(current().rights, landPrice());

  // Money, the mask and the right to build move at once; the lighting, the beach and the guests
  // wait for the settle.
  const land: Pick<LandPointerOptions, 'canBuy' | 'onBuy'> = {
    canBuy(px, pz) {
      const { rights } = current();
      return rights !== null && forSale(rights, px, pz) && money.canAfford(landPrice());
    },
    onBuy(px, pz) {
      const resort = current();
      const { rights } = resort;
      if (!rights || !forSale(rights, px, pz)) return;
      const price = landPrice();
      if (!money.canAfford(price)) {
        refused({ kind: 'parcel', price });
        return;
      }
      money.spend('land', price);
      buyParcel(rights, px, pz);
      ownership.update(rights, resort.plan);
      lifecycle.groundEdited();
      lifecycle.scheduleSettle();
      hud.publish({ land: landNow() });
      cue('land');
    },
  };

  const build = createEditMode({
    canvas,
    handle,
    resort: current,
    geometries: catalogue.geometries,
    onChange: () => {
      counted = true;
      lifecycle.edited();
      letter();
      options.onDirty?.();
    },
    onGroundChange: (columns) => {
      groundColumns = joinColumns(groundColumns, columns);
      lifecycle.groundEdited();
      options.onDirty?.();
    },
    onZonesChange: () => {
      rezone(current());
      paintOverlay();
      counted = true;
      options.onDirty?.();
    },
    onCancel: () => {
      selectTool(null);
      options.onToolChange?.(null);
    },
    onLift: (placement) => {
      if (namesPlacement(selection.target(), placement.key)) select(null);
    },
    money,
    onRefused: refused,
    onFallback: fallback,
    onPending: (pending) => hud.publish({ pending }),
    land,
    onCue: cue,
    singleKeys: () => singleKeys,
  });

  // Off under a bench, as the markers are, so every recorded figure is drawn without them. A gate
  // still going up is lettered once it is raised.
  const letter = (): void => {
    if (bench) return;
    const resort = current();
    const building = new Set(build.openSites().map((site) => site.placement.key));
    resort.nameplates.show(
      resort.plot.placements.filter(
        (placement) => isGateway(placement.id) && !building.has(placement.key),
      ),
      identity.name,
    );
  };
  letter();

  // Off under a bench, as the markers are. Told again whenever the venues are rebuilt, so the
  // HUD's buttons and the anchors line up.
  const placeSigns = (): Partial<HudState> => {
    if (bench) return {};
    const resort = current();
    const spots = signSpotsOf(resort.venues, signOf);
    const venues = new Map(resort.venues.map((venue) => [venue.key, venue]));
    const anchorOf = (spot: SignSpot): Anchor => {
      const venue = venues.get(spot.key)!;
      return signAnchorOf(venue, groundUnder(resort, venue), objectTypeById(venue.id).model.height);
    };
    signSpots.place(spots.map(anchorOf));
    return { signs: spots };
  };

  let highlightPicks: readonly HighlightPick[] = [];
  const placeHighlights = (): Partial<HudState> => {
    if (bench) return {};
    const resort = current();
    const { placements } = resort.plot.layout;
    highlights.show(
      highlightBoxesOf(placements, highlightPicks, familyOf, (placement) =>
        groundUnder(resort, placement),
      ),
    );
    return { highlightTypes: highlightTypesOf(placements, highlightKindOf) };
  };

  const widenHighlights = (): void => {
    if (highlightPicks.length === 0) return;
    const { width, height } = viewSize;
    highlights.widen(ringWidthAt(tilePxAt(handle.camera, handle.controls.target, width, height)));
  };

  let armedTool: BuildTool | null = null;
  const selectTool = (tool: BuildTool | null): void => {
    const wasZoning = armedZone(armedTool) !== null;
    const zoning = armedZone(tool) !== null;
    const wasBuying = armedLand(armedTool);
    armedTool = tool;
    build.select(tool);
    landToolChanged(wasBuying, armedLand(tool));
    // Arming puts any map away; disarming brings none back, the player picks it again.
    if (zoning && !wasZoning) overlayKind = null;
    if (zoning !== wasZoning) paintOverlay();
  };

  const selection = createSelectionController({
    resort: current,
    clock,
    placementOf: build.placementOf,
    onSelectionChange: (view) => hud.publish({ selection: view }),
    onOrdersChange: (orders) => hud.publish({ orders }),
  });
  const select = selection.select;

  const inspector = createInspectPointer({
    canvas,
    camera: () => handle.camera,
    armed: () => armedTool === null,
    people: () => {
      const { crowd, cast, drawnAt } = current();
      return whereDrawn(crowd.crowd, cast, { count: crowd.count, ...drawnAt });
    },
    staff: () => staffWhereDrawn(current()),
    aimHeight: AIM_HEIGHT,
    ground: build.ground,
    keyAt: (tile) => current().occupancy.keyAt(tile),
    onSelect: select,
    onDoubleTap: () => options.onDoubleTap?.(),
  });

  let dayAdvice: readonly Advice[] = [];
  let demandNow: Demand | null = null;

  // One facts build for both, so the bars and the advice describe the same moment.
  const adviceAndDemand = (): readonly Advice[] => {
    const facts = factsNow(current(), clock.weather, clock.ticks);
    demandNow = demandFor(facts);
    return adviceFor(facts);
  };

  const advise = (): HudState['advice'] => {
    dayAdvice = adviceAndDemand();
    return { list: dayAdvice, ticks: clock.ticks };
  };

  const adviseHourly = (): HudState['advice'] => ({
    list: refreshedWithin(dayAdvice, adviceAndDemand()),
    ticks: clock.ticks,
  });

  // After the advice, whose facts fill the demand the status shows.
  const report = (): StatusView => statusOf(current(), clock, demandNow);

  const programmeNow = (): ProgrammeFacts => programmeFactsOf(current(), clock);

  const heardEvents = (steps: readonly EventStep[]): void => {
    for (const news of eventNewsFrom(steps, current().siteVenues, clock.weather)) {
      options.onEventNews?.(news);
    }
    // A fee or a refund may have moved the money, and a show put off moved the programme.
    spent = true;
    hud.publish({ programme: programmeNow() });
    options.onDirty?.();
  };

  // A booking moves no money, but it does change the advice and what a save holds.
  const programmeChanged = (programme: Programme): void => {
    const resort = current();
    resort.events.programme = programme;
    refreshEventVenues(resort, clock.ticks);
    refreshKeen(resort, clock);
    refreshNightOut(resort, clock);
    // A stage open in the inspector says what is on next there.
    selection.reword();
    hud.publish({ programme: programmeNow(), advice: adviseHourly() });
    options.onDirty?.();
  };

  let overlayKind: OverlayKind | null = null;
  // The graph the tiles were placed for: a new one, from an edit or a new plot, places them again.
  let overlayPlacedOn: WalkNetwork | null = null;

  const placeOverlay = (resort: Resort): WalkNetwork => {
    const network = resort.crowd.crowd.network;
    if (overlayPlacedOn !== network) {
      resort.overlay.place(overlayTilesOf(network, resort.shore));
      overlayPlacedOn = network;
    }
    return network;
  };

  // The zone view wins while the zone brush is armed: both are drawn on the same tiles.
  const paintOverlay = (): void => {
    const resort = current();
    const zoning = armedZone(armedTool) !== null;
    if (overlayKind === null && !zoning) {
      resort.overlay.paint(null);
      return;
    }
    const network = placeOverlay(resort);
    if (zoning) resort.overlay.paintZones(zonesOfSlots(resort.zones, network, resort.shore));
    else resort.overlay.paint(overlayValues(resort, overlayKind!));
  };

  // At most once a simulated hour: thoughts are heard per step, and React must not be.
  const hourly = (): void => {
    hud.publish({
      advice: adviseHourly(),
      voices: voicesOf(current()),
      status: report(),
      ledger: current().ledger,
      programme: programmeNow(),
    });
    if (overlayKind !== null) paintOverlay();
    options.onDirty?.();
  };

  // At the check-in, for a show that keeps its audience up from noon.
  const tellTonight = (): void => {
    const resort = current();
    const facts = eventFactsOf(resort, clock);
    const show = showToTell({
      programme: resort.events.programme,
      day: clock.day,
      open: (site, kind) => facts.siteOpen(site, clock.weather, kind),
      settled: resort.settled,
    });
    if (show) options.onEventNews?.(tonightNewsOf(show, resort.siteVenues));
  };

  const morning = (): void => {
    tellTonight();
    hud.publish({
      advice: advise(),
      status: report(),
      history: current().history,
      ledger: current().ledger,
    });
    options.onDirty?.();
    options.onMorning?.();
  };

  // Everything React shows is told again: the HUD still holds the game that was replaced.
  const rebuilt = (): void => {
    clock.relight();
    paintOverlay();
    letter();
    hud.publish({
      ...placeSigns(),
      ...placeHighlights(),
      stats: statsNow(),
      advice: advise(),
      voices: voicesOf(current()),
      status: report(),
      history: current().history,
      ledger: current().ledger,
      land: landNow(),
      programme: programmeNow(),
      open: current().open,
      name: identity.name,
      camera: cameraView(),
    });
  };

  // Putting the land tool away settles at once rather than leaving the player to wait for it.
  const landToolChanged = (was: boolean, now: boolean): void => {
    ownership.showForSale(now);
    if (was && !now) lifecycle.settleNow();
  };

  // A snapshot runs it too, so what is saved never pairs new lists with the old graph.
  const reanchor = (): void => {
    rebuildAfterEdit(current(), clock.ticks, handle);
    paintOverlay();
    letter();
    // Said now rather than tomorrow; the day's counters are left alone.
    hud.publish({
      ...placeSigns(),
      ...placeHighlights(),
      advice: advise(),
      voices: voicesOf(current()),
      status: report(),
      programme: programmeNow(),
    });
  };

  const lifecycle = createResortLifecycle({
    preparer,
    bench,
    slot,
    handle,
    clock,
    fireworks,
    ownership,
    build,
    selection,
    running: () => running,
    identity,
    populationOf: (prepared) => populationOf(prepared.plan, prepared.plot, undefined),
    restoreGame: (resort, saved) => restoreGame(resort, saved, clock),
    reanchor,
    openIsometric,
    stopDrift: () => {
      drift = null;
      handle.controls.enabled = true;
    },
    rebuilt,
    onResortReplaced: () => options.onResortReplaced?.(),
    onSpeedChange: (speed) => onSpeedChange?.(speed),
  });

  const recorder = bench
    ? createBenchRecorder({
        bench,
        handle,
        stats: statsNow,
        litLamps: () => clock.litLamps,
        clockLabel: () => clock.label,
      })
    : null;

  const moveCamera = (elapsed: number): void => {
    if (drift) drift.advance(elapsed);
    else if (!bench) handle.controls.update();
  };

  // After the render call: that is where the shaders are built, which is most of the wait.
  const tellDrawn = (): void => {
    if (drawnFirst) return;
    drawnFirst = true;
    performance.measure('vox:boot:first-frame');
    options.onLoading?.('scene');
  };

  const chooseDetail = (): void => {
    const view = detail ? handle.detailView() : null;
    current().world.updateDetail(view);
    current().crowd.setView(view);
  };
  // Skipped, not left to fail: three warns when a renderer built without timers is asked.
  const timeGpu = (): void => {
    if (!timing) return;
    // Resolving drains the query pool, so once a frame gives one reading a frame.
    void handle.renderer.resolveTimestampsAsync().then((duration) => {
      if (typeof duration !== 'number' || duration <= 0) return;
      gpuMs = duration;
      recorder?.recordGpu(duration);
    });
  };
  handle.renderer.setAnimationLoop((timeMs: number) => {
    if (!running) return;
    const frameStarted = performance.now();

    // First: the ground the crowd walks and the surfaces the camera sees must agree.
    if (groundColumns) {
      handle.retile(groundColumns);
      groundColumns = null;
    }
    tellHud(frameStarted);
    if (lifecycle.reanchorDue(timeMs)) lifecycle.reanchor();

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    // Fixed step under a benchmark: a frame-delta clock puts the scene elsewhere on the same frame
    // of two runs, and a running bench would tick a different number of times.
    const step = fixedStep ?? elapsed;
    const pace = showPaceOf(current(), fireworks, clock);
    const ticks = stepClock(clock, drift !== null, step, pace);
    // Capped, so a backgrounded tab does not run a week of decay in one frame.
    if (ticks > 0) {
      const simStarted = timer.start();
      stepSim(current(), clock, ticks, { morning, hourly, heard: heardEvents });
      lastShare = lightRooms(current(), lastShare);
      recastAll(current());
      lightTheFires(current());
      timer.end('vox:frame:sim', simStarted, ticks);
    }
    // Fixed under a bench so runs replay; a paused bench still walks the crowd. Outside one,
    // handing over zero time is what stops a paused crowd; crowdScaleFor is 1 while paused.
    const walked = crowdStep(fixedStep, drift !== null || clock.speed !== 'paused', elapsed);
    keepSeats(current().cast, current().casting, current().crowd.crowd.seatBy);
    const crowdScale = crowdScaleFor(clock.speed);
    // Before the crowd writes its instances, which draw the cast where perform left it.
    actSeconds = advanceActs(actSeconds, walked, crowdScale);
    perform(current().cast, actSeconds);
    performAtSea(current().cast, actSeconds, clock.ticks);
    performOnSand(current().cast, actSeconds, clock.ticks);
    performWork(current().staffCast, current().cast, actSeconds);
    current().ballField.write(current().cast.played);
    const crowdStarted = timer.start();
    current().crowd.advance(walked, crowdScale);
    current().staff.advance(walked, crowdScale);
    timer.end('vox:frame:crowd', crowdStarted);
    current().balloons.advance(step, lanternsOf(current(), clock));
    advanceFireworks(step);
    drawnLitter = drawLitter(current(), drawnLitter);
    current().sea.advance(step, walked * crowdScale);
    advanceWeather(step);
    build.advance(step);
    moveCamera(elapsed);
    listen(timeMs);
    chooseDetail();
    const renderStarted = performance.now();
    handle.renderer.render(handle.scene, handle.camera);
    // WebGPU records and submits here; the GPU works afterwards.
    const frameEnded = performance.now();
    tellDrawn();
    frameCost = sampleFrameCost(frameCost, timeMs, frameEnded - frameStarted);
    timeGpu();

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    signSpots.project(handle.camera, handle.controls.target, signsWanted, viewSize);
    widenHighlights();
    markerSpots.project(handle.camera, viewSize.width, viewSize.height);
    staffPins.pin(current(), staffPinsShown, workerOf(selection.target()));
    selection.tellOrders();
    staffPins.project(handle.camera, viewSize.width, viewSize.height);
    const { world, crowd } = current();
    onFrame({
      sampled: sample.updated,
      fps: fpsState.fps,
      clock: clock.label,
      activeLights: clock.litLamps,
      drawCalls: handle.renderer.info.render.drawCalls,
      triangles: handle.renderer.info.render.triangles,
      cpu: {
        meanMs: frameCost.meanMs,
        worstMs: frameCost.worstMs,
        renderMs: frameEnded - renderStarted,
      },
      gpuMs,
      detail: world.detailCounts,
      people: { drawn: crowd.drawnCount, total: crowd.count },
      shaderBuilds: handle.shaderBuilds(),
      inspect: selection.inspectLine(),
      markers: markerSpots.view,
      staff: staffPins.view,
      signs: signSpots.view,
    });

    recorder?.record(elapsed * 1000, performance.now() - frameStarted);
  });

  // Every slice once, so the HUD shows this resort before its first hour comes round. The advice
  // fills the demand the status reads, and is not the day's, so the first check-in still sets it.
  hud.publish({
    ...placeSigns(),
    ...placeHighlights(),
    stats: statsNow(),
    camera: cameraView(),
    advice: { list: adviceAndDemand(), ticks: clock.ticks },
    voices: voicesOf(current()),
    status: report(),
    history: current().history,
    open: current().open,
    name: identity.name,
    ledger: current().ledger,
    land: landNow(),
    programme: programmeNow(),
    weather: clock.weather,
  });

  return {
    get benchResult() {
      return recorder?.result() ?? null;
    },
    get params() {
      return identity.params;
    },
    setOpen(open) {
      const resort = current();
      if (resort.open === open) return;
      resort.open = open;
      hud.publish({ open, advice: advise() });
      options.onDirty?.();
    },
    rename(next) {
      if (next === identity.name) return;
      identity.name = next;
      letter();
      hud.publish({ name: identity.name });
      options.onDirty?.();
    },
    renameVenue(key, typed) {
      const resort = current();
      const placement = build.placementOf(key);
      const [place] = placement ? namedPlacesOf([placement]) : [];
      if (!place) return;
      resort.names = renameTo(resort.names, place, typed, Math.random);
      // Not reanchored: that would rebuild the walk network and every flow field for a label.
      relabelVenues(resort);
      selection.reword();
      hud.publish({ ...placeSigns(), advice: advise() });
      options.onDirty?.();
    },
    setHiring(role, count) {
      const resort = current();
      resort.hiring = hire(resort.hiring, role, count);
      staffTheResort(resort);
      options.onDirty?.();
      hud.publish({ stats: statsNow(), advice: advise(), programme: programmeNow() });
    },
    book(draft) {
      const result = book(current().events.programme, draft, clock.ticks);
      if (!result.refusal) programmeChanged(result.programme);
      return result.refusal;
    },
    unbook(id) {
      const { programme } = current().events;
      const after = unbook(programme, id);
      if (after !== programme) programmeChanged(after);
    },
    rebook(id, change) {
      const result = rebook(current().events.programme, id, change);
      if (!result.refusal) programmeChanged(result.programme);
      return result.refusal;
    },
    switchBuiltIn(id, on) {
      const { programme } = current().events;
      const after = switchBuiltIn(programme, id, on);
      if (after !== programme) programmeChanged(after);
    },
    // Told back whether or not it took: a bench refuses mode changes.
    setCameraMode(mode) {
      setCameraMode(mode);
      hud.publish({ camera: cameraView() });
    },
    setIsoDirection(direction) {
      setIsoDirection(direction);
      hud.publish({ camera: cameraView() });
    },
    setDetail(enabled) {
      if (!bench) detail = enabled;
      hud.publish({ camera: cameraView() });
    },
    turnCamera(quarters) {
      setIsoDirection(turnDirection(handle.isoDirection, quarters));
      hud.publish({ camera: cameraView() });
    },
    lookAtTile,
    // Off under a bench, as overlays are: every recorded figure has them off.
    setMarkers(tiles) {
      if (bench) return;
      const resort = current();
      markerSpots.place(tiles.slice(0, MAX_MARKERS).map((tile) => markerAnchorOf(resort, tile)));
    },
    // Not refused under a bench as the markers are: a bench's fresh profile has them off.
    setStaffPins(shown) {
      staffPinsShown = shown;
    },
    setSigns(shown) {
      signsWanted = shown;
    },
    setSingleKeys(on) {
      singleKeys = on;
    },
    selectAt(tile) {
      const key = current().occupancy.keyAt({ x: tile.tileX, z: tile.tileZ });
      if (key !== undefined) select({ key });
    },
    generate(next) {
      const asked = clampParams(next);
      // A generated plot is given, not bought, so it is always sandbox.
      return lifecycle.regrow(asked, { kind: 'generate', params: asked }, 'sandbox');
    },
    clear(next, mode) {
      const asked = clampParams(next);
      // The seed goes along, so clearing gives a random landscape.
      return lifecycle.regrow(asked, { kind: 'clear', params: asked }, mode);
    },
    openShared(shared) {
      const named = (resort: Resort): void => {
        resort.names = assignNames(
          new Map(shared.names),
          namedPlacesOf(resort.plot.layout.placements),
        );
        relabelVenues(resort);
        identity.name = shared.name;
      };
      const source = { kind: 'saved', world: shared.world } as const;
      return lifecycle.regrow(clampParams(shared.params), source, 'sandbox', named);
    },
    selectTool,
    confirmPlacement: () => build.confirm(),
    dismissPlacement: () => build.dismiss(),
    turnPlacement: (quarters) => build.turn(quarters),
    setTime(time) {
      clock.setTime(time);
      options.onDirty?.();
    },
    setSpeed: clock.setSpeed,
    // Told at once, so the forced button reads as pressed on the click.
    setWeather(weather) {
      clock.setWeather(weather);
      hud.publish({ weather: clock.weather });
    },
    // Refused under a bench, as camera modes are: every recorded draw count has it off.
    setOverlay(kind) {
      if (bench) return;
      overlayKind = kind;
      paintOverlay();
      hud.publish({ stats: statsNow() });
    },
    setHighlights(picks) {
      if (bench) return;
      highlightPicks = picks;
      hud.publish({ ...placeHighlights(), stats: statsNow() });
    },
    selectPerson: (person) => select({ person }),
    selectWorker: (worker) => select({ worker }),
    showSelected: () => lookAtWorker(handle, current(), workerOf(selection.target())),
    sendStaff: (role) => sendToPlace(current(), role, placementKeyOf(selection.target())),
    sendCleanerTo: (tile) => sendToTile(current(), tile),
    clearSelection: () => select(null),
    snapshot: lifecycle.snapshot,
    load: lifecycle.load,
    dispose() {
      running = false;
      lifecycle.dispose();
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener('resize', resize);
      cameraKeys.dispose();
      inspector.dispose();
      build.dispose();
      preparer.dispose();
      rain.dispose();
      fireworks.dispose();
      highlights.dispose();
      current().dispose();
      handle.dispose();
      ownership.dispose();
      // Last: everything above is built over these.
      disposeCatalogue(catalogue);
    },
  };
}
