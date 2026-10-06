import { materialKeyFor, voxelIdFor } from '../features/catalog/domain/materials';
import { mosaicKitOf } from '../features/catalog/domain/mosaics';
import {
  allMaterials,
  binReachOf,
  emissiveByModelId,
  waterByModelId,
  windowsByModelId,
  bedsOf,
  familyOf,
  isGateway,
  materialColorsById,
  namesOf,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeTop,
  LITTER_MODELS,
  PAINTED_MODELS,
  PEOPLE_MODELS,
  PROP_MODELS,
  sceneryOf,
  SEA_MODELS,
  signOf,
  SKY_MODELS,
  soundOf,
  STAFF_MODELS,
  TILE_VOXELS,
} from '../features/catalog/domain/objectTypes';
import {
  buildCostOf,
  costToStand,
  DIG_COST,
  landPriceOf,
  nightPriceOf,
  priceOf,
  refundOf,
} from '../features/catalog/domain/prices';
import {
  blobOf,
  casterOf,
  hearthOf,
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
  PEDALO_RENTAL_ID,
  STAIRS_ID,
  STAIRCASE_ID,
  RAMP_FOOT_ID,
  RAMP_HEAD_ID,
} from '../features/layout/domain/resortPlan';
import type { Shore } from '../features/layout/domain/shoreline';
import { beachTilesOf, isBeach, shoreFor } from '../features/layout/domain/shoreline';
import type { Terrain } from '../features/layout/domain/terrain';
import { overlooksDrop, terrainFor } from '../features/layout/domain/terrain';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { clampParams } from '../features/layout/domain/resortGenerator';
import { layoutItemFor } from '../features/build/domain/buildPlan';
import { itemChooser } from '../features/build/domain/stylePick';
import {
  claimingOn,
  everythingOn,
  rentalOf,
  type Plot,
  type PrepRequest,
  type PreparedResort,
  type ResortSource,
} from '../features/resort-prep/domain/prepareResort';
import { savedWorldOf } from '../features/resort-prep/domain/savedWorld';
import { createOwnershipMask } from '../features/land/adapters/ownershipMask';
import {
  buyParcel,
  facesUnowned,
  forSale,
  landViewOf,
  ownedArea,
  ownedBounds,
  ownedSpan,
  ownsTile,
  rightsOf,
  type LandRights,
  type LandView,
  type TileSpan,
} from '../features/land/domain/landRights';
import { widenGame } from '../features/saves/domain/widenGame';
import type { TileRect } from '../features/layout/domain/parkShapes';
import { restoreResort, snapshotResort } from '../features/sim/domain/resortState';
import type { ClockSnapshot } from '../features/sim/domain/resortSnapshot';
import {
  SAVE_VERSION,
  type CameraSnapshot,
  type GameSnapshot,
} from '../features/saves/domain/snapshot';
import { createResortPreparer } from '../features/resort-prep/adapters/resortPreparer';
import {
  isPaving,
  pavedGroundOf,
  raisedProvider,
  wantsStairsOf,
  type PavingRules,
} from '../features/build/domain/paving';
import { type HandrailRules } from '../features/build/domain/handrails';
import type { TerrainRules } from '../features/build/domain/terrainBrush';
import {
  armedBrush,
  armedObject,
  armedLand,
  armedRemove,
  armedZone,
  type BuildTool,
} from '../features/build/domain/buildTool';
import { createTerrainPointer } from '../features/build/adapters/terrainPointer';
import { createLandPointer, type LandPointerOptions } from '../features/build/adapters/landPointer';
import { createZonePointer } from '../features/build/adapters/zonePointer';
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
  followTime,
  TICKS_PER_DAY,
  timeOf,
  wallTimeOf,
  withSpeed,
  withTime,
  type SimClock,
  type SimSpeed,
} from '../features/sim/domain/simClock';
import {
  createNeeds,
  decayNeeds,
  relieve,
  strongestNeed,
  type Needs,
} from '../features/sim/domain/needs';
import {
  ageHappiness,
  createHappiness,
  meanHappiness,
  remember,
  type Happiness,
} from '../features/sim/domain/happiness';
import { arrivalsFor, ratingFor, type Rating } from '../features/sim/domain/rating';
import {
  carryUpkeep,
  cleanliness,
  createUpkeep,
  NEEDS_CLEANING,
  type Upkeep,
} from '../features/sim/domain/upkeep';
import { burnTheSunbathers, hurt, mishap } from '../features/sim/domain/incidents';
import {
  carryBreakdowns,
  createBreakdowns,
  isBroken,
  type Breakdowns,
} from '../features/sim/domain/breakdowns';
import {
  BEACH_LITTER,
  binCoverFor,
  createCarrying,
  createLitter,
  dropAt,
  LITTER_WEIGHT,
  litterAt,
  litterSummary,
  pickUp,
  pruneLitter,
  stepWith,
  type BinSite,
  type Carrying,
  type Litter,
} from '../features/sim/domain/litter';
import { isBedtime, LATE_NIGHT_RELIEF, mix } from '../features/sim/domain/night';
import { isPastTen, nightOf, planNightsOut } from '../features/sim/domain/nightOut';
import { keepReview, reviewFor, type Review } from '../features/sim/domain/reviews';
import {
  countArrivals,
  countDeparture,
  countEvent,
  countReview,
  countWelcomed,
  keepDay,
  noteWelcomeGap,
  reportOf,
  startDay,
  type DayCounts,
  type DayReport,
} from '../features/sim/domain/dayReport';
import {
  createDay,
  createThoughts,
  forgetStay,
  latestOf,
  loudest,
  stayCount,
  surroundingsThought,
  tallyInto,
  think,
  visitThought,
  type ThoughtKind,
  type ThoughtTally,
  type Thoughts,
} from '../features/sim/domain/thoughts';
import {
  sceneryAt,
  sceneryFieldFor,
  sceneryItemsOf,
  sceneryOver,
  type SceneryField,
} from '../features/sim/domain/scenery';
import {
  AUTO_HIRING,
  cheerTheAudience,
  hire,
  onDuty,
  rosterFor,
  rosterOf,
  shiftChange,
  shortOf,
  STAFF_ROLES,
  staffPool,
  unwatched,
  wagesFor,
  workplacesOf,
  type Hiring,
  type Roster,
  type Staff,
  type StaffRole,
} from '../features/sim/domain/staff';
import {
  canAfford,
  closeDay,
  createLedger,
  OPENING_BALANCE,
  record,
  type GameMode,
  type Ledger,
  type Reason,
} from '../features/sim/domain/ledger';
import {
  earn,
  maintenanceFor,
  nightBill,
  takingsOf,
  type VenueTakings,
} from '../features/sim/domain/takings';
import {
  createStaffRouter,
  createStaffTask,
  meanCleanliness,
  SPELLS_PER_LOAD,
  STAFF_TASK_KINDS,
  type Order,
  type OrderRole,
  type StaffRouter,
  type StaffTask,
  type StaffZones,
} from '../features/sim/domain/staffRouter';
import {
  anyZone,
  createZones,
  dealZones,
  NO_ZONE,
  paintZone,
  staffByZone,
  zoneAt,
  workplaceZones,
  zonesIn,
  zonesOf,
  type Zones,
} from '../features/sim/domain/zones';
import {
  arrivalsDueBy,
  CHECK_IN_TICK,
  checkInDue,
  bedsOn,
  runCheckIn,
  wavesDue,
} from '../features/sim/domain/checkIn';
import { gatewaysOn, type Gateway } from '../features/sim/domain/gateways';
import { depotForShift, depotsOn, type Depot } from '../features/sim/domain/depots';
import { createRandom, type Random } from '../features/layout/domain/random';
import { beachVenueFor, isBeach as isTheBeach, withBeach } from '../features/sim/domain/beach';
import {
  isNamed,
  relabelled,
  shelterOf,
  venuesOn,
  type Venue,
} from '../features/sim/domain/venues';
import {
  assignNames,
  namedPlacesOf,
  renameTo,
  type VenueNames,
} from '../features/naming/domain/venueNames';
import {
  homesOfLodgings,
  lodgingFor,
  lodgingsOn,
  type Lodging,
} from '../features/sim/domain/lodgings';
import { occupiedShare } from '../features/sim/domain/night';
import { createRouter, type Router } from '../features/sim/domain/router';
import { partiesOf, partyMixOf } from '../features/events/domain/audience';
import { labelOf as eventLabelOf, type AudienceParty } from '../features/events/domain/catalogue';
import {
  advanceEvents,
  bookedVenues,
  callOffRun,
  createEvents,
  createPartyRuns,
  endRun,
  entertain,
  hostedShows,
  indexParties,
  inviteAudience,
  kindOf as eventKindOf,
  markParty,
  peopleThere,
  runOfVisit,
  showingVenues,
  visitLitter,
  type CallOffStep,
  type EventFacts,
  type EventRun,
  type EventStep,
  type EventsState,
  type PartyRuns,
} from '../features/events/domain/eventRuns';
import { restoreEvents, snapshotEvents } from '../features/events/domain/eventsSnapshot';
import { fadeGlow } from '../features/events/domain/glow';
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
  type EventSite,
  type Occurrence,
  type Programme,
} from '../features/events/domain/programme';
import {
  nextAt,
  type DayForecast,
  type ProgrammeFacts,
} from '../features/events/domain/programmeView';
import { heldAt, stageKeysOf } from '../features/events/domain/sites';
import {
  latecomersFor,
  stageRank,
  stagesByPreference,
  welcomeGapOf,
  withoutBuiltIns,
} from '../features/events/domain/welcome';
import {
  bookingDayKey,
  keenParties,
  showToTell,
  tonightsShow,
} from '../features/events/domain/stayingUp';
import { dayAt } from '../features/events/domain/week';
import { sandOf, watchRoom, type LaunchSite } from '../features/fireworks/domain/launch';
import { fireworksDrought, isFireworksNight } from '../features/fireworks/domain/nights';
import { eventNewsFrom, tonightNewsOf, type EventNews } from '../features/hud/domain/news';
import {
  isOpenIn,
  weatherEffect,
  weatherOn,
  type Weather,
  type WeatherEffect,
} from '../features/sim/domain/weather';
import { djPlays, openAt, openNow } from '../features/sim/domain/hours';
import { flashAt, flashSky } from '../features/weather/domain/lightning';
import {
  createRaindrops,
  isWet,
  MAX_DROPS,
  rainfallFor,
} from '../features/weather/domain/rainfall';
import { buildRainField, type RainField } from '../features/weather/adapters/rainField';
import {
  buildFireworksField,
  type FireworksField,
} from '../features/fireworks/adapters/fireworksField';
import { fireworksSky, type ShowLight } from '../features/fireworks/domain/light';
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
  unreachableOn,
  type Advice,
  type ResortFacts,
} from '../features/sim/domain/advice';
import { demandFor, type Demand } from '../features/sim/domain/demand';
import { doorsFor } from '../features/sim/domain/doors';
import { stepFreeReachOn, type StepFreeReach } from '../features/sim/domain/stepFree';
import { hopsFrom, reachSeedsFor } from '../features/overlays/domain/reach';
import {
  createFootfall,
  fadeFootfall,
  overlayValuesFor,
  sampleFootfall,
  type Footfall,
  type OverlayKind,
} from '../features/overlays/domain/overlays';
import {
  buildOverlayField,
  type OverlayField,
  type OverlayTile,
} from '../features/overlays/adapters/overlayField';
import { nodeIndexFor, type NodeIndex } from '../features/crowd/domain/nearestNode';
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
import type { ScratchLayout } from '../features/voxel-world/domain/modelScratch';
import {
  canopyScratchModelsOf,
  scratchLayoutFor,
} from '../features/voxel-world/domain/modelScratch';
import { furledShareAt } from '../features/rendering/domain/canopyFurl';
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
  ON_SAND,
  putOnPlot,
  restoreCrowd,
  snapshotCrowd,
  takeOffPlot,
  type Crowd,
} from '../features/crowd/domain/crowd';
import {
  crowdOverrideFrom,
  crowdSizeFor,
  crowdSizeForArea,
  crowdSizeForOwned,
} from '../features/crowd/domain/crowdSize';
import {
  BEACH_SURFACE,
  walkNetworkFor,
  type WalkNetwork,
} from '../features/crowd/domain/walkNetwork';
import { seatSpotsFor } from '../features/crowd/domain/seating';
import {
  carryPlaces,
  createCast,
  insideAt,
  keepSeats,
  noteShows,
  recast,
  recastStaff,
  SHOWN,
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
  checkOutParty,
  createGuests,
  fullNameOf,
  homelessCount,
  makeBeds,
  paceOf,
  usesWheelchair,
  presentCount,
  rehome,
  unmadeCount,
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
  placementKeyOf,
  placeView,
  sendOffers,
  staffLine,
  staffView,
  workerOf,
  type Errand,
  type InspectTarget,
  type SelectionView,
  type PlaceView,
  type SendFacts,
} from '../features/inspect/domain/selection';
import type { GuestNeed } from '../../voxel-gen/voxelgen.ts';
import { ADULT_VOXELS, hipHeight } from '../../voxel-gen/people/figure.ts';
import type { BalloonField } from '../features/balloons/adapters/balloonField';
import { buildLitterField, type LitterField } from '../features/litter/adapters/litterField';
import { buildBallField, type BallField } from '../features/choreography/adapters/ballField';
import { piecesFor } from '../features/litter/domain/litterPieces';
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
import { islandBoxesFor } from '../features/sea/domain/islands';
import { berthsOf, createPassengers } from '../features/sea/domain/passengers';
import type {
  Mooring,
  Rental,
  SailingGround,
  SwimAreaOptions,
} from '../features/sea/domain/swimArea';
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
import { startCameraDrift, type CameraDrift } from '../features/rendering/adapters/cameraDrift';
import type { LoadingStep } from '../features/welcome/domain/loading';
import { resortNameFor, savedResortName } from '../features/naming/domain/resortName';
import { createNameplates, type Nameplates } from '../features/naming/adapters/nameplateField';
import { createFpsState, sampleFrame } from '../features/hud/domain/fps';
import { createFrameCostState, sampleFrameCost } from '../features/hud/domain/frameCost';
import type { FrameUpdate } from '../features/hud/adapters/hudOverlay';
import { MAX_MARKERS, type OrderSpot } from '../features/hud/domain/markers';
import {
  MAX_SIGNS,
  signAnchorOf,
  signsShown,
  signSpotsOf,
  type SignSpot,
} from '../features/hud/domain/signs';
import {
  createPinSpot,
  isPinned,
  roofOver,
  staffPinOf,
  tallyStaff,
  type Anchor,
  type Footprint,
  type Roofs,
  type StaffTally,
} from '../features/hud/domain/staffPins';
import {
  pinTitle,
  staffName,
  taskWords,
  type TaskFacts,
} from '../features/inspect/domain/staffWords';
import { SOUND_KINDS } from '../features/sound/domain/bank';
import type { BuildCue } from '../features/sound/domain/cues';
import { hearingRadius, SURF_REACH, type HeardScene } from '../features/sound/domain/hearing';
import {
  gatherSources,
  hearGuests,
  shoreDistance,
  soundSourcesOf,
  type HeardGuests,
  type SoundSources,
} from '../features/sound/domain/sources';
import { Vector3 } from 'three/webgpu';
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

// Four pieces on 128 tiles is already a landfill, and the advice will have said so long before.
const LITTER_PIECES = 512;

// Per kind of ball: courts playing at once beyond this go without one. Fixed, so an edit that
// adds a court needs no new field.
const BALLS_PER_KIND = 16;

const CRAFT_COUNT = 12;

// Capped by the hut: a wider rack would moor boats among the swimmers.
const HIRE_COUNT = 6;

// A pedalo seats two, and goes out full.
const HIRERS_PER_BOAT = 2;

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

const AIM_HEIGHT = hipHeight(ADULT_VOXELS);

// Late afternoon, so day 0 opens in daylight.
const INITIAL_TIME = 0.62;

const LOUDEST_SHOWN = 5;

const TICKS_PER_HOUR = 60;

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
  readonly beds: { readonly total: number; readonly taken: number; readonly unmade: number };
  readonly asleep: number;
  readonly venues: { readonly inside: number; readonly waiting: number };
  readonly routeFields: number;
  readonly guests: { readonly present: number; readonly capacity: number };
  readonly staff: {
    readonly total: number;
    readonly working: number;
    readonly roster: Roster;
    readonly recommended: Roster;
    readonly hiring: Hiring;
    // Per zone, in zone order: who was dealt there.
    readonly zones: readonly Roster[];
  };
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

export interface VoicesView {
  readonly loudest: readonly ThoughtTally[];
  readonly reviews: readonly Review[];
}

export interface StatusView {
  readonly day: number;
  readonly rating: Rating;
  // Shown under the rating and counted toward none of it: wheelchair guests who cannot get
  // somewhere are unhappy, and that already reaches the stars.
  readonly stepFree: { readonly reached: number; readonly venues: number };
  readonly present: number;
  readonly beds: { readonly total: number; readonly taken: number };
  readonly demand: Demand | null;
  readonly staff: StaffTally;
}

export interface ShowcaseOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onFrame: (update: FrameUpdate) => void;
  readonly onSceneChange?: (stats: ShowcaseStats) => void;
  readonly onToolChange?: (tool: BuildTool | null) => void;
  readonly onCameraChange?: (view: CameraView) => void;
  readonly onSelectionChange?: (selection: SelectionView | null) => void;
  readonly onAdviceChange?: (advice: readonly Advice[], ticks: number) => void;
  // A new game or a load, told before the new resort's first advice.
  readonly onResortReplaced?: () => void;
  // At most once a simulated hour: thoughts are heard per step, and React must not be.
  readonly onThoughtsChange?: (view: VoicesView) => void;
  readonly onStatusChange?: (status: StatusView) => void;
  // Each morning, after the day before is reported, and with whatever history a load brings.
  readonly onHistoryChange?: (history: readonly DayReport[]) => void;
  readonly onWeatherChange?: (weather: Weather) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onNameChange?: (name: string) => void;
  readonly onMoneyChange?: (ledger: Ledger) => void;
  // On every new resort and every parcel bought, as the money is told.
  readonly onLandChange?: (land: LandView) => void;
  readonly onRefused?: (note: BuildNote) => void;
  readonly onBuildNote?: (note: BuildNote) => void;
  // A placement shown on touch and waiting for the player to confirm it, or no longer.
  readonly onPendingChange?: (pending: boolean) => void;
  // Something a save would keep has changed. Not per step: from the places that already tell React.
  readonly onDirty?: () => void;
  readonly onMorning?: () => void;
  // Only for what the player does, never for a load or a settle laying the plot out again.
  readonly onCue?: (cue: BuildCue) => void;
  // At most five times a second of real time, with one scene object reused every time.
  readonly onHear?: (scene: HeardScene) => void;
  // Only for a speed the showcase set itself, as a load does.
  readonly onSpeedChange?: (speed: SimSpeed) => void;
  // Whenever an order is given, taken up or ended, for the markers to flag.
  readonly onOrdersChange?: (orders: readonly OrderSpot[]) => void;
  // Whenever the venues are rebuilt, in the order the signs' anchors were placed.
  readonly onSigns?: (spots: readonly SignSpot[]) => void;
  // An event announced, called off or put off; never told during a load.
  readonly onEventNews?: (news: EventNews) => void;
  // After a booking, an edit, a load, a new resort and every simulated hour.
  readonly onProgrammeChange?: (facts: ProgrammeFacts) => void;
  // Opens behind the welcome screen: the camera drifts, the controls are off and the resort keeps
  // the player's local time, until the first new game.
  readonly welcome?: boolean;
  readonly onLoading?: (step: LoadingStep) => void;
}

export interface CameraView {
  readonly mode: CameraMode;
  readonly direction: CompassDirection;
  readonly detail: boolean;
}

export interface Showcase {
  readonly stats: ShowcaseStats;
  readonly advice: readonly Advice[];
  readonly voices: VoicesView;
  readonly status: StatusView;
  readonly history: readonly DayReport[];
  readonly benchResult: BenchResult | null;
  readonly params: ResortParams;
  readonly name: string;
  readonly cameraView: CameraView;
  readonly open: boolean;
  readonly ledger: Ledger;
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
  selectAt(tile: { readonly tileX: number; readonly tileZ: number }): void;
  generate(params: ResortParams): Promise<void>;
  clear(params: ResortParams, mode: GameMode): Promise<void>;
  selectTool(tool: BuildTool | null): void;
  confirmPlacement(): void;
  dismissPlacement(): void;
  turnPlacement(quarters: number): void;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  setWeather(weather: Weather | null): void;
  setOverlay(kind: OverlayKind | null): void;
  selectPerson(person: number): void;
  selectWorker(worker: number): void;
  // Turns the camera on the inspected member of staff, wherever they have walked to since.
  showSelected(): void;
  // Sends the nearest free worker of the role to the inspected building.
  sendStaff(role: OrderRole): void;
  sendCleanerTo(tile: { readonly tileX: number; readonly tileZ: number }): void;
  clearSelection(): void;
  readonly programme: ProgrammeFacts;
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

interface Resort {
  readonly plot: Plot;
  readonly lighting: Lighting;
  readonly world: InstancedWorld;
  readonly shadows: BlobShadowField;
  // Per resort: its materials are bound to this plot's baked light volume.
  readonly construction: ConstructionField;
  // Per resort for the same reason; lettered by the showcase, which holds the name.
  readonly nameplates: Nameplates;
  readonly crowd: CrowdField;
  // A second crowd: a guest's variant indexes the guest models, and HUD counts are about guests.
  readonly staff: CrowdField;
  // Where visitors are drawn, index-aligned with `venues`. Replaced with them on an edit, which
  // renumbers the network's seats the places point into.
  places: readonly VenuePlaces[];
  cast: Cast;
  staffCast: Cast;
  readonly casting: Casting;
  // Off the rental the sea was built with, which an edit does not move either.
  readonly bathing: SwimAreaOptions;
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
  // Rebuilt rather than updated on an edit: its flow fields are indexed by node, and an edit
  // renumbers nodes.
  readonly staffRouter: StaffRouter;
  readonly staffPool: Staff;
  hiring: Hiring;
  recommended: Roster;
  roster: Roster;
  // Read late by the staff router, so an edit swaps it rather than writing into it.
  duty: Uint8Array;
  // Per tile of the plan, so it survives every edit without being carried; never replaced.
  readonly zones: Zones;
  // Null on a plot that owns all of itself; bought into in place, and saved from here.
  readonly rights: LandRights | null;
  // Dealt afresh by rezone, and read late by the staff router, as the duty is.
  zoneOf: Int8Array;
  venueZones: Int32Array;
  lodgingZones: Int32Array;
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  // Replaced by a load; an edit keeps it, dropping the bookings of a stage pulled down.
  events: EventsState;
  // Per venue, refreshed once a frame, so the staff router's question is an array read.
  eventBooked: Uint8Array;
  eventShowing: Uint8Array;
  // A resident DJ plays while the venue is open: a show with or without an animator. Refreshed
  // with the clock, as the first resort is built before the clock exists.
  djOn: Uint8Array;
  hosted: readonly { readonly venue: number; readonly until: number }[];
  // Per party, the run it is invited to: the router asks per guest per tick.
  invited: PartyRuns;
  // Per party, kept up from noon for tonight's show.
  keen: Uint8Array;
  keenShow: Occurrence | null;
  // Per party, the tick its night out ends, or -1: hashed afresh every hour, so never saved.
  nightOutUntil: Int32Array;
  // Out tonight, but nothing late served them; cleared at check-in.
  readonly homeEarly: Set<number>;
  // Still out at ten, so they wake tired; cleared at check-in.
  readonly nightOwls: Set<number>;
  // Today's runs called off or put off, so nobody is kept up for them; cleared at check-in.
  readonly settled: Set<string>;
  // The lanterns stay on the sand on a fireworks night.
  fireworksNight: boolean;
  // Replaced wholesale on an edit rather than patched, so it cannot drift from what stands.
  venues: readonly Venue[];
  // The venues as the router lists them, the beach last: where an event can be held.
  siteVenues: readonly Venue[];
  // The owned sand, and the points out at sea a show is launched from.
  beachTiles: number;
  launchSites: readonly LaunchSite[];
  // Drawn once per venue and carried by key, so building a second bar never renames the first.
  names: VenueNames;
  lodgings: readonly Lodging[];
  // Homes are sorted by beds, lodgings stand in placement order; rebuilt with both on an edit.
  homeOfLodging: Int32Array;
  gateways: readonly Gateway[];
  depots: readonly Depot[];
  // Dirt is carried across by key when venues are replaced, so paving one tile does not scrub the
  // plot.
  upkeep: Upkeep;
  // Carried by key like the dirt, so paving a tile does not mend a broken slide.
  breakdowns: Breakdowns;
  // Replaced on an edit rather than patched: a moved tree takes its reach with it.
  scenery: SceneryField;
  // Kept across an edit, pruned to what is still paved or open sand: planting a hedge does not
  // sweep the plot.
  readonly litter: Litter;
  // Per node, so replaced empty on an edit, which renumbers nodes.
  footfall: Footfall;
  readonly overlay: OverlayField;
  // Per guest body, never replaced: a wrapper in hand outlasts an edit.
  readonly carrying: Carrying;
  // Per guest body too, and forgotten at check-in, when the body becomes somebody else.
  readonly thoughts: Thoughts;
  // Cleared each morning with the router's counters, so the panel speaks for today.
  readonly thoughtDay: Map<string, ThoughtTally>;
  reviews: readonly Review[];
  // From one check-in to the next, as the books run.
  today: DayCounts;
  history: readonly DayReport[];
  // Replaced on an edit, as the scenery is.
  binCover: Uint8Array;
  unreachable: ReadonlySet<string>;
  rating: Rating;
  // Gates arrivals only: a closed resort still rates and says goodbye to the guests it has.
  open: boolean;
  // Sized once a day by the rating and let in over the waves. A wave nobody could come in is
  // counted as admitted, so its share is not carried into the next one.
  arrivalsPlanned: number;
  arrivalsAdmitted: number;
  // The parties checked in since the last 11:00 check-in, so yesterday's until then, for an event
  // that calls latecomers.
  newcomers: number[];
  // Per resort: two plots must not share a sequence.
  arrivals: Random;
  ledger: Ledger;
  readonly takings: VenueTakings;
  beds: { readonly total: number; readonly taken: number };
  // Rebuilt rather than updated on an edit: its flow fields are indexed by node, and an edit
  // renumbers nodes.
  readonly router: Router;
  readonly balloons: BalloonField;
  readonly litterField: LitterField;
  readonly ballField: BallField;
  readonly flames: FlamesField;
  // The keys of the fires burning, so their flames and light change only when the fires do.
  burning: string;
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
  readonly drawnAs: Cast;
  readonly chair: ModelGeometry | undefined;
}): CrowdField {
  return buildCrowdField({
    crowd: createCrowd({
      network: parts.network,
      count: parts.population,
      variants: parts.people.length,
      variantOf: (i) => parts.guests.variant[i] ?? 0,
      routeOf: parts.routeOf,
      offTheSand: parts.offTheSand,
      paceOf: (i) => paceOf(parts.guests, i),
      roamsBeach: false,
      seed: CROWD_SEED,
    }),
    models: parts.people,
    lightVolume: parts.lightVolume,
    drawnAs: parts.drawnAs,
    ...(parts.chair ? { chair: parts.chair } : {}),
  });
}

function staffCrowdFor(parts: {
  readonly network: WalkNetwork;
  readonly models: readonly ModelGeometry[];
  readonly lightVolume: BakedLightVolume | null;
  readonly staff: Staff;
  readonly routeOf: (worker: number, at: number) => number;
  readonly drawnAs: Cast;
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
    drawnAs: parts.drawnAs,
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
    span: spanOf(parts.plan),
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
  readonly terrain: Terrain;
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
    // Nobody is at the hut before the first recast, which sets the real allowance.
    hireAllowed: 0,
    ground,
    radii: SEA_RADII,
    piers: pierBoxesFor(shore, parts.paved),
    // Off the terrain as it stands when the resort is built: an island raised later is sailed
    // round from the next load.
    islands: islandBoxesFor(parts.terrain),
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

// A party no lodging could take starts away, but createCrowd deals every body onto the paving.
function keepAwayOffThePlot(guests: Guests, crowd: Crowd): void {
  for (let person = 0; person < crowd.count; person++) {
    if (guests.present[person] === 1) continue;
    takeOffPlot(crowd, person, crowd.x[person]!, crowd.y[person]!, crowd.z[person]!);
  }
}

// A load or a settle restores whoever is here, so the bodies a settle adds start away.
const startsAway = (building: boolean, saved: number | undefined): boolean =>
  building || saved !== undefined;

// The plan's land, which is the live rights as they stood at the last settle.
const spanOf = (plan: ResortPlan): TileSpan => ownedSpan(plan.land ?? null, plan);

// The live rights, not the plan's: a path laid on land bought since the last settle gets litter too.
const litterWindowOf = (resort: Pick<Resort, 'rights' | 'plan'>): TileRect | undefined =>
  resort.rights ? ownedBounds(resort.rights, resort.plan) : undefined;

const liveRightsOf = (plan: ResortPlan): LandRights | null =>
  plan.land ? rightsOf(plan.land) : null;

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
  const guests = createGuests({
    count: population,
    homes: homesOn(plot.layout.placements),
    variants: parts.people.length,
    childVariant: CHILD_VARIANT,
    seed: GUEST_SEED,
    away: startsAway(building, parts.population),
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
  const names = assignNames(new Map(), namedPlacesOf(plot.layout.placements));
  const venues = venuesOn(plot.layout.placements, names);
  const lodgings = lodgingsOn(plot.layout.placements);
  const gateways = gatewaysOn(plot.layout.placements);
  const depots = depotsOn(plot.layout.placements);
  const places = placesFor(venues, byKey(plot.layout.placements), network);
  const bathing = {
    shore,
    rental: rentalOf(shore, plot.layout.placements),
    span: spanOf(plan),
  };
  const cast = createCast(population, places, { sand: network.sand, swim: bathing });
  const unreachable = strandedOn(venues, network);
  const upkeep = createUpkeep(venues.length);
  const breakdowns = createBreakdowns(venues.length);
  // Off the layout's lists, as the network is, props too since the layout stands trees as either,
  // and paving, since a mosaic dresses a square.
  const scenery = sceneryFieldFor(
    sceneryItemsOf(
      [...plot.layout.placements, ...plot.layout.props, ...plot.layout.paths],
      sceneryOf,
    ),
    plan.tilesX,
    plan.tilesZ,
  );
  const litter = createLitter(plan.tilesX, plan.tilesZ);
  const overlay = buildOverlayField();
  const carrying = createCarrying(population);
  const binCover = binCoverFor(
    binsOn([...plot.layout.placements, ...plot.layout.props]),
    plan.tilesX,
    plan.tilesZ,
  );
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
      const party = guests.party[person]!;
      // Before check-out, which clears who was here.
      const review = reviewOfParty(resort, party);
      if (review) {
        resort.reviews = keepReview(resort.reviews, review);
        resort.today = countReview(resort.today, review.stars);
      }
      const left = checkOutParty(guests, party, true);
      resort.today = countDeparture(resort.today, left.length);
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
    breakdowns: () => resort.breakdowns,
    // A hash, not the router's stream: a draw from it would move every seeded scene after it.
    onVisited: (person, venue) => visitMade(resort, person, venue, parts.ticks()),
    onThought: (person, kind, subject) => hear(resort, parts.ticks(), person, kind, subject),
    upLate: (party) =>
      resort.invited.end[party]! >= 0 ||
      resort.keen[party] === 1 ||
      isOutTonight(resort, party, parts.ticks()),
    // An invited or keen party is the event's, and chooses as it always did.
    outLate: (party) =>
      isOutTonight(resort, party, parts.ticks()) &&
      isBedtime(party, parts.tickOfDay()) &&
      resort.invited.end[party]! < 0 &&
      resort.keen[party] !== 1,
    onNightOver: (party) => resort.homeEarly.add(party),
    eventStay: (person, venue) => {
      const party = guests.party[person]!;
      return resort.invited.venue[party] === venue ? resort.invited.end[party]! : -1;
    },
    onWoke: (person) => {
      const party = guests.party[person]!;
      if (resort.events.tired.has(party) || resort.nightOwls.has(party)) {
        relieve(needs, person, LATE_NIGHT_RELIEF);
      }
    },
    seed: DWELL_SEED,
  });
  const crowd = crowdFor({
    network,
    people: parts.people,
    lightVolume: lighting.volume,
    guests,
    population,
    routeOf: (person, at) => {
      stepLitterAt(resort, person, at);
      return router.step(person, at);
    },
    offTheSand: (person) => router.offTheSand(person),
    drawnAs: cast,
    chair: parts.props.find((model) => model.id === WHEELCHAIR_ID),
  });
  crowdField = crowd;
  keepAwayOffThePlot(guests, crowd.crowd);
  // The pool is meshed once per resort; the roster follows the plot, putting bodies on and off it.
  const employed = staffPool();
  const recommended = rosterFor(workplacesOf(venues, network.posts, lodgings));
  const roster = rosterOf(AUTO_HIRING, recommended);
  const duty = onDuty(employed, roster);
  const staffCast = createCast(employed.count, places);
  let staffField: CrowdField | null = null;
  // Getters, so the router reads the latest deal without an object built per question.
  const staffZones: StaffZones = {
    get zoneOf() {
      return resort.zoneOf;
    },
    get venueZones() {
      return resort.venueZones;
    },
    get lodgingZones() {
      return resort.lodgingZones;
    },
    tileZone: (tileX, tileZ) => zoneAt(resort.zones, tileX, tileZ),
  };
  // Built once: the guests and the lodging map are read through the resort, which a load and an
  // edit replace.
  const housekeeping = {
    unmadeAt: (lodging: number) => resort.guests.unmade[resort.homeOfLodging[lodging] ?? -1] ?? 0,
    make: (lodging: number, most: number) => {
      makeBeds(resort.guests, resort.homeOfLodging[lodging] ?? -1, most);
    },
  };
  const staffRouter = createStaffRouter({
    staff: employed,
    venues,
    network,
    upkeep: () => resort.upkeep,
    breakdowns: () => resort.breakdowns,
    crowd: () => staffField!.crowd,
    weather: parts.weather,
    tickOfDay: parts.tickOfDay,
    duty: () => resort.duty,
    litter: () => resort.litter,
    litterWindow: () => litterWindowOf(resort),
    // Asked only when a show or a watch is picked, so the lookup by key costs nothing per tick.
    occupants: (venue) => resort.router.occupancyOf(resort.venues[venue]!.key)?.inside ?? 0,
    zones: () => staffZones,
    lodgings,
    beds: () => housekeeping,
    depots,
    supplyNode: () => resort.router.arrivalNode,
    onClockedOff: (worker) => {
      const workers = staffField!.crowd;
      takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
    },
    booked: (venue) => resort.eventBooked[venue] === 1,
    hosting: () => resort.hosted,
    seed: STAFF_SEED,
  });
  const staff = staffCrowdFor({
    network,
    models: parts.staff,
    lightVolume: lighting.volume,
    staff: employed,
    routeOf: (worker, at) => staffRouter.step(worker, at),
    drawnAs: staffCast,
  });
  staffField = staff;
  const workers = staff.crowd;
  for (let worker = 0; worker < employed.count; worker++) {
    if (duty[worker] === 1) continue;
    takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
  }
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
  const sea = seaFor({
    shore,
    terrain,
    paved: plot.layout.paths,
    placements: plot.layout.placements,
    moorings,
    sea: parts.sea,
    people: parts.people,
    lightVolume: lighting.volume,
  });

  const events = createEvents(population);
  events.programme = withBuiltIns(
    events.programme,
    BUILT_INS,
    stageKeysOf(venues),
    stageRank(venues),
  );

  const resort: Resort = {
    plan,
    plot,
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
      venueOf: (person) => router.venueIndexOf(person),
      isWaiting: (person) => router.isWaitingAt(person),
      queuePlace: (person) => router.queuePlaceOf(person),
      isAsleep: (person) => router.isAsleep(person),
      isPresent: (person) => guests.present[person] === 1,
      isChild: (person) => guests.child[person] === 1,
      partyOf: (person) => guests.party[person]!,
      inChair: (person) => usesWheelchair(guests, person),
      bathing: {
        restingUntil: (person) => router.restingUntil(person),
        // A getter: relocate replaces the crowd.
        get crowd() {
          return resort.crowd.crowd;
        },
      },
    },
    bathing,
    drawnAt: {
      x: new Float32Array(population),
      y: new Float32Array(population),
      z: new Float32Array(population),
    },
    staffDrawnAt: {
      x: new Float32Array(employed.count),
      y: new Float32Array(employed.count),
      z: new Float32Array(employed.count),
    },
    staffRouter,
    staffPool: employed,
    hiring: AUTO_HIRING,
    recommended,
    roster,
    duty,
    zones: createZones(plan.tilesX, plan.tilesZ),
    rights: liveRightsOf(plan),
    zoneOf: new Int8Array(employed.count).fill(NO_ZONE),
    venueZones: new Int32Array(venues.length),
    lodgingZones: new Int32Array(lodgings.length),
    guests,
    needs,
    happiness,
    events,
    eventBooked: new Uint8Array(venues.length),
    eventShowing: new Uint8Array(venues.length),
    djOn: new Uint8Array(venues.length),
    hosted: NO_HOSTED,
    invited: createPartyRuns(guests.parties.length),
    keen: new Uint8Array(guests.parties.length),
    keenShow: null,
    nightOutUntil: new Int32Array(guests.parties.length).fill(-1),
    homeEarly: new Set(),
    nightOwls: new Set(),
    settled: new Set(),
    fireworksNight: false,
    venues,
    siteVenues: withBeach(venues, network),
    ...sandOf(network.beach),
    names,
    lodgings,
    homeOfLodging: homesOfLodgings(lodgings, guests.homes),
    gateways,
    depots,
    upkeep,
    breakdowns,
    scenery,
    litter,
    footfall: createFootfall(network.nodes.length),
    overlay,
    carrying,
    thoughts: createThoughts(population),
    thoughtDay: createDay(),
    reviews: [],
    // Every resort is built on a clock restarted at day 0, and a load restores its own counts.
    today: startDay(0),
    history: [],
    binCover,
    unreachable,
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    // A plot with no paving is a building site; a generated one is a resort already running,
    // and the benchmark must see it running.
    open: !building,
    arrivalsPlanned: 0,
    arrivalsAdmitted: 0,
    newcomers: [],
    beds: { total: beds.beds, taken: beds.taken },
    router,
    arrivals,
    ledger: createLedger('sandbox', OPENING_BALANCE.sandbox),
    takings: new Map(),
    balloons,
    litterField,
    ballField,
    flames,
    burning: '',
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
      nameplates.dispose();
      crowd.dispose();
      staff.dispose();
      balloons.dispose();
      litterField.dispose();
      ballField.dispose();
      flames.dispose();
      overlay.dispose();
      sea.dispose();
      lighting.volume?.dispose();
    },
  };
  rezone(resort);
  recastAll(resort);
  return resort;
}

const byKey = (placements: readonly Placement[]): ReadonlyMap<string, Placement> =>
  new Map(placements.map((placement) => [placement.key, placement]));

const rentalIndices = new WeakMap<readonly Venue[], number>();

// The first hut, as rentalOf picks it for the berths. Built once per venue list, as venueIndexOf is.
function rentalVenueOf(venues: readonly Venue[]): number {
  let index = rentalIndices.get(venues);
  if (index === undefined) {
    index = venues.findIndex((venue) => familyOf(venue.id) === PEDALO_RENTAL_ID);
    rentalIndices.set(venues, index);
  }
  return index;
}

// Drawn only: the visit is the router's, and the boats keep the crowd's time. A hut pulled down
// keeps its boats in, since the sea is not rebuilt on an edit.
function allowHire(resort: Resort): void {
  const rental = rentalVenueOf(resort.venues);
  const hirers = rental >= 0 ? insideAt(resort.cast, rental) : 0;
  resort.sea.allowHire(Math.min(HIRE_COUNT, Math.ceil(hirers / HIRERS_PER_BOAT)));
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
  const standing = new Map(resort.venues.map((venue, at) => [venue.key, at]));
  carryPlaces(was, resort.cast, (venue) => standing.get(wasStanding[venue]?.key ?? '') ?? -1);
  resort.staffCast = createCast(resort.staffPool.count, resort.places);
  recastAll(resort);
  resort.crowd.drawAs(resort.cast);
  resort.staff.drawAs(resort.staffCast);
}

interface ResortSlot {
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
  readonly scratch: ScratchLayout;
  readonly catalogue: MeshedCatalogue;
  readonly startup: StartupCost;
  readonly weather: Weather;
  readonly rain: RainField;
  readonly fireworks: FireworksField;
}): ShowcaseStats {
  const { handle, scratch, catalogue, rain, fireworks } = parts;
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
      fireworks.drawCalls,
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
      fireworks.triangleCount,
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

// Off the graph, a guest is on the sand, where only the litter counts: scenery there is not
// fielded, so an unlittered beach reads as it always has.
function surroundingsOf(resort: Resort, person: number): number {
  const { node, network } = resort.crowd.crowd;
  const at = network.nodes[node[person] ?? -1];
  if (at) {
    return mindedAt(resort, at.tileX, at.tileZ, sceneryAt(resort.scenery, at.tileX, at.tileZ));
  }
  const tile = sandTileOf(resort, person);
  const { tilesX } = resort.litter;
  return tile < 0 ? 0 : mindedAt(resort, tile % tilesX, Math.floor(tile / tilesX), 0);
}

// The litter grid's index of the beach tile under the body, or -1 off the beach.
function sandTileOf(resort: Resort, person: number): number {
  const { x, z } = resort.crowd.crowd;
  const tileX = Math.floor(x[person]! / TILE_VOXELS);
  const tileZ = Math.floor(z[person]! / TILE_VOXELS);
  return isBeach(resort.shore, tileX, tileZ) ? tileZ * resort.litter.tilesX + tileX : -1;
}

function mindedAt(resort: Resort, tileX: number, tileZ: number, scenery: number): number {
  const around = scenery - LITTER_WEIGHT * litterAt(resort.litter, tileX, tileZ);
  return Math.min(1, Math.max(-1, around));
}

function hear(
  resort: Resort,
  tick: number,
  person: number,
  kind: ThoughtKind,
  subject: string | null,
): void {
  if (think(resort.thoughts, person, kind, subject, tick)) {
    tallyInto(resort.thoughtDay, kind, subject);
  }
}

// Built once per venue list, which an edit replaces whole, so a visit costs no scan.
const venueIndices = new WeakMap<readonly Venue[], ReadonlyMap<string, number>>();

// A key the list lacks is the router's synthetic beach, which reads as spotless at -1.
function venueIndexOf(venues: readonly Venue[], key: string): number {
  let index = venueIndices.get(venues);
  if (!index) {
    index = new Map(venues.map((venue, at) => [venue.key, at]));
    venueIndices.set(venues, index);
  }
  return index.get(key) ?? -1;
}

// After the visit wore it, so the last guest out of a dirty bar is the one who notices.
function judgeVisit(resort: Resort, tick: number, person: number, venue: Venue): void {
  const clean = cleanliness(resort.upkeep, venueIndexOf(resort.venues, venue.key));
  const thought = visitThought(venue.role, clean);
  if (thought) hear(resort, tick, person, thought, venue.label);
}

// A mishap in water somebody is watching is ten times rarer; the beach is watched from a tower.
function riskTheWater(resort: Resort, tick: number, person: number, venue: Venue): void {
  if (venue.bathing !== true) return;
  const index = venueIndexOf(resort.venues, venue.key);
  const { staffRouter } = resort;
  const watched = index >= 0 ? staffRouter.watching(index) : staffRouter.watchingBeach;
  if (!mishap(person, tick, watched)) return;
  hurt(resort.needs, person);
  hear(resort, tick, person, 'hurt', venue.label);
}

function burnOnTheBeach(resort: Resort, clock: Clock): void {
  if (clock.weather !== 'heatwave') return;
  const { router } = resort;
  burnTheSunbathers(
    resort.needs,
    resort.guests.present,
    (person) => router.isSunbathing(person),
    Math.floor(clock.ticks / TICKS_PER_HOUR),
    (person) => hear(resort, clock.ticks, person, 'hurt', null),
  );
}

function hearSurroundings(resort: Resort, tick: number): void {
  for (let person = 0; person < resort.guests.count; person++) {
    const thought = lookAround(resort, person);
    if (thought) hear(resort, tick, person, thought, null);
  }
}

// Asleep guests are skipped: a bed is not a view.
function lookAround(resort: Resort, person: number): ThoughtKind | null {
  if (resort.guests.present[person] !== 1 || resort.router.isAsleep(person)) return null;
  return surroundingsThought(surroundingsOf(resort, person));
}

// Only members still here and still of this party: a body is reused by later parties.
function reviewOfParty(resort: Resort, party: number): Review | null {
  const { guests, happiness } = resort;
  const { kind, family, members: listed } = guests.parties[party]!;
  const members = listed.filter(
    (member) => guests.present[member] === 1 && guests.party[member] === party,
  );
  const spokesperson = members.find((member) => guests.child[member] !== 1) ?? members[0];
  if (spokesperson === undefined) return null;
  return reviewFor({
    thoughts: resort.thoughts,
    members,
    spokesperson,
    party,
    family,
    partyKind: kind,
    name: fullNameOf(guests, spokesperson),
    nights: guests.nights[spokesperson]!,
    happiness: (member) => happiness.stay[member] ?? 0,
  });
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

// The checkInDue arithmetic over an hour: twelve ticks in a frame must not step over one.
const hourTurned = (from: number, to: number): boolean =>
  Math.floor(to / TICKS_PER_HOUR) > Math.floor((from - 1) / TICKS_PER_HOUR);

// Runs on every node and every sand leg every guest reaches, so it allocates nothing. At the
// end of a leg the body stands on the waypoint, which is the tile a wrapper falls on.
function stepLitterAt(resort: Resort, person: number, at: number): void {
  const tile = tileReachedAt(resort, person, at);
  if (tile < 0) return;
  const { litter } = resort;
  const tileX = tile % litter.tilesX;
  const tileZ = Math.floor(tile / litter.tilesX);
  stepWith(litter, resort.carrying, resort.binCover, person, tileX, tileZ);
}

function tileReachedAt(resort: Resort, person: number, at: number): number {
  if (at === ON_SAND) return sandTileOf(resort, person);
  const node = resort.crowd.crowd.network.nodes[at];
  return node ? node.tileZ * resort.litter.tilesX + node.tileX : -1;
}

// A hash with its own multiplier, so it is not the wrapper's draw for the same visit, and never
// the router's stream, whose draws would move every seeded scene after it.
function leaveOnTheBeach(resort: Resort, person: number, tick: number): void {
  if ((mix(person * 40_503 + tick) % 1024) / 1024 >= BEACH_LITTER) return;
  const tile = sandTileOf(resort, person);
  if (tile < 0) return;
  const { litter } = resort;
  dropAt(litter, resort.binCover, tile % litter.tilesX, Math.floor(tile / litter.tilesX));
}

interface DrawnLitter {
  readonly litter: Litter | null;
  readonly version: number;
}

const pavingIndices = new WeakMap<WalkNetwork, NodeIndex>();

function pavingIndexOf(network: WalkNetwork): NodeIndex {
  let index = pavingIndices.get(network);
  if (!index) {
    index = nodeIndexFor(network);
    pavingIndices.set(network, index);
  }
  return index;
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

function binsOn(placements: readonly Placement[]): BinSite[] {
  const bins: BinSite[] = [];
  for (const placement of placements) {
    const reach = binReachOf(placement.id);
    if (reach <= 0) continue;
    const { tileX, tileZ, tilesX, tilesZ } = placement;
    bins.push({ tileX, tileZ, tilesX, tilesZ, reach });
  }
  return bins;
}

interface TileAt {
  readonly tileX: number;
  readonly tileZ: number;
}

// The shore never moves with an edit, so a resort sweeps its sand once.
const beachTileLists = new WeakMap<Shore, readonly TileAt[]>();

function beachTilesFor(shore: Shore | null): readonly TileAt[] {
  if (!shore) return [];
  let tiles = beachTileLists.get(shore);
  if (!tiles) {
    tiles = beachTilesOf(shore).map(({ x, z }) => ({ tileX: x, tileZ: z }));
    beachTileLists.set(shore, tiles);
  }
  return tiles;
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

const NO_HOSTED: readonly { readonly venue: number; readonly until: number }[] = [];

const runVenueOf = (resort: Resort, run: EventRun): number =>
  heldAt(run.occurrence.site, run.occurrence.kind, resort.siteVenues);

function relabelVenues(resort: Resort): void {
  resort.venues = relabelled(resort.venues, resort.names);
  resort.siteVenues = withBeach(resort.venues, resort.crowd.crowd.network);
  resort.router.relabel(resort.venues);
}

const beachIndexOf = (resort: Resort): number =>
  resort.siteVenues.length > resort.venues.length ? resort.venues.length : -1;

// The event a visit was made to: the party was invited to it there, or the person watched it.
const eventVisitOf = (resort: Resort, person: number, venue: Venue): EventRun | null =>
  runOfVisit(
    resort.events,
    resort.guests.party[person]!,
    person,
    venueIndexOf(resort.siteVenues, venue.key),
    (run) => runVenueOf(resort, run),
  );

// A hash, not the router's stream: a draw from it would move every seeded scene after it.
function visitMade(resort: Resort, person: number, venue: Venue, tick: number): void {
  const show = eventVisitOf(resort, person, venue);
  const draw = (mix(person * 2_654_435_761 + tick) % 1024) / 1024;
  pickUp(resort.carrying, person, visitLitter(show, venue.litter ?? 0), draw);
  if (isTheBeach(venue)) leaveOnTheBeach(resort, person, tick);
  judgeVisit(resort, tick, person, venue);
  riskTheWater(resort, tick, person, venue);
  // An event is free to see.
  if (!show) payForVisit(resort, venue);
}

function payForVisit(resort: Resort, venue: Venue): void {
  const earned = priceOf(venue.id);
  resort.ledger = record(resort.ledger, 'visit', earned);
  earn(resort.takings, venue.key, earned);
}

// Today's weather is the clock's, which may be pinned; a pinned weather holds every day ahead too.
function weatherOnDay(clock: Clock, day: number): Weather {
  if (day === clock.day) return clock.weather;
  return clock.forcedWeather ?? weatherOn(day, WEATHER_SEED);
}

function eventFactsOf(resort: Resort, clock: Clock): EventFacts {
  const venues = resort.siteVenues;
  return {
    mode: resort.ledger.mode,
    weatherOn: (day) => weatherOnDay(clock, day),
    hasSite: (site, kind) => heldAt(site, kind, venues) >= 0,
    // The router's own door rule, so an event is called off exactly when its stage is shut.
    siteOpen: (site, weather, kind) => {
      const venue = venues[heldAt(site, kind, venues)];
      return venue !== undefined && isOpenIn(shelterOf(venue), weatherEffect(weather));
    },
    hostOnDuty: resort.roster.animator > 0,
    canPay: (fee) => canAfford(resort.ledger, fee),
    stages: preferredStages(resort.venues),
  };
}

// Keyed by the list itself, which an edit replaces wholesale, so it is sorted once per edit.
const STAGE_PREFERENCE = new WeakMap<readonly Venue[], readonly EventSite[]>();

function preferredStages(venues: readonly Venue[]): readonly EventSite[] {
  let stages = STAGE_PREFERENCE.get(venues);
  if (!stages) {
    stages = stagesByPreference(venues);
    STAGE_PREFERENCE.set(venues, stages);
  }
  return stages;
}

function refreshEventVenues(resort: Resort, now: number): void {
  const { events, venues } = resort;
  if (resort.eventBooked.length !== venues.length) {
    resort.eventBooked = new Uint8Array(venues.length);
    resort.eventShowing = new Uint8Array(venues.length);
  }
  bookedVenues(events.runs, events.programme, venues, now, resort.eventBooked);
  showingVenues(events.runs, venues, resort.eventShowing);
  resort.hosted = events.runs.length === 0 ? NO_HOSTED : hostedShows(events.runs, venues);
}

function urgencyBesidesFun(resort: Resort, person: number): number {
  const want = strongestNeed(resort.needs, resort.guests, person);
  return want && want.need !== 'fun' ? want.urgency : 0;
}

function freePartiesOf(resort: Resort): () => readonly AudienceParty[] {
  let free: readonly AudienceParty[] | null = null;
  return () =>
    (free ??= partiesOf(
      resort.guests,
      (person) => resort.router.isFree(person),
      (person) => urgencyBesidesFun(resort, person),
    ));
}

// A party resting on the sand is free to watch from where it lies.
function freeOnTheSandOf(resort: Resort): () => readonly AudienceParty[] {
  const { router } = resort;
  return () =>
    partiesOf(
      resort.guests,
      (person) => router.isFree(person) || router.stayOf(person) === 'resting',
      (person) => urgencyBesidesFun(resort, person),
    );
}

function stageRoomOf(resort: Resort, venue: number): number {
  const declared = resort.siteVenues[venue]!;
  const there = resort.router.occupancyOf(declared.key) ?? { inside: 0, waiting: 0 };
  return declared.capacity - there.inside - there.waiting;
}

// The sand's own room on the beach, whose capacity has no door to count at.
function roomAt(resort: Resort, run: EventRun, venue: number): number {
  if (venue !== beachIndexOf(resort)) return stageRoomOf(resort, venue);
  const there = (person: number): boolean => resort.router.venueIndexOf(person) === venue;
  return watchRoom(resort.beachTiles) - peopleThere(run, resort.guests, there);
}

// On the index before the router is asked, so a party invited where it lies is told the end.
function inviteParty(resort: Resort, run: EventRun, person: number, venue: number): boolean {
  const party = resort.guests.party[person]!;
  markParty(resort.invited, party, run.occurrence.end, venue);
  if (resort.router.invite(person, venue)) return true;
  markParty(resort.invited, party, -1, -1);
  return false;
}

function inviteTo(resort: Resort, run: EventRun, free: () => readonly AudienceParty[]): void {
  const venue = runVenueOf(resort, run);
  if (!resort.siteVenues[venue]) return;
  const { router } = resort;
  inviteAudience(resort.events, run, {
    guests: resort.guests,
    room: roomAt(resort, run, venue),
    free: venue === beachIndexOf(resort) ? freeOnTheSandOf(resort) : free,
    isThere: (person) => router.venueIndexOf(person) === venue,
    invite: (person) => inviteParty(resort, run, person, venue),
  });
}

// Not only twice: a keen party reaching the sand after the start would lie down on a pitch of its
// own, so the sand is asked again on every tick until the end, while there is room.
function topUpTheSand(resort: Resort): void {
  const beach = beachIndexOf(resort);
  if (beach < 0) return;
  for (const run of resort.events.runs) {
    if (runVenueOf(resort, run) === beach) inviteTo(resort, run, freeOnTheSandOf(resort));
  }
}

function refreshInvited(resort: Resort): void {
  const parties = resort.guests.parties.length;
  if (resort.invited.end.length < parties) resort.invited = createPartyRuns(parties);
  indexParties(resort.events.runs, (run) => runVenueOf(resort, run), resort.invited);
}

// Hourly, at check-in, on a booking and on a load: the keen are those tonight's show will invite.
function refreshKeen(resort: Resort, clock: Clock): void {
  const { programme } = resort.events;
  const facts = eventFactsOf(resort, clock);
  resort.keenShow = tonightsShow({
    programme,
    now: clock.ticks,
    open: (site, kind) => facts.siteOpen(site, clock.weather, kind),
    settled: resort.settled,
  });
  resort.fireworksNight = isFireworksNight(programme, clock.day);
  resort.keen = keenParties(resort.guests, resort.keenShow, resort.keen);
}

function refreshDj(resort: Resort, clock: Clock): void {
  const { venues } = resort;
  if (resort.djOn.length !== venues.length) resort.djOn = new Uint8Array(venues.length);
  const effect = weatherEffect(clock.weather);
  for (const [index, venue] of venues.entries()) {
    const broken = isBroken(resort.breakdowns, index);
    resort.djOn[index] = Number(djPlays(venue, effect, clock.tickOfDay, broken));
  }
}

const isOutTonight = (resort: Resort, party: number, now: number): boolean =>
  (resort.nightOutUntil[party] ?? -1) > now && !resort.homeEarly.has(party);

// Last orders: a venue that is shut by then is no reason to stay out.
const LATE_CHECK = 23 * TICKS_PER_HOUR;

function lateVenueTonight(resort: Resort, clock: Clock): boolean {
  const effect = weatherEffect(clock.weather);
  return resort.venues.some(
    (venue, index) =>
      venue.hours !== undefined &&
      !resort.unreachable.has(venue.key) &&
      !isBroken(resort.breakdowns, index) &&
      openNow(venue, effect, LATE_CHECK),
  );
}

function refreshNightOut(resort: Resort, clock: Clock): void {
  const { parties, child } = resort.guests;
  if (resort.nightOutUntil.length < parties.length) {
    resort.nightOutUntil = new Int32Array(parties.length);
  }
  if (lateVenueTonight(resort, clock)) {
    planNightsOut(parties, child, nightOf(clock.ticks), resort.nightOutUntil);
  } else resort.nightOutUntil.fill(-1);
}

const isOutAndUp = (resort: Resort, party: number, now: number): boolean =>
  isOutTonight(resort, party, now) &&
  resort.guests.parties[party]!.members.some(
    (member) => resort.guests.present[member] === 1 && !resort.router.isAsleep(member),
  );

// Hourly: whoever is still out and awake past ten wakes the worse for it.
function markNightOwls(resort: Resort, clock: Clock): void {
  if (!isPastTen(clock.tickOfDay)) return;
  for (let party = 0; party < resort.guests.parties.length; party++) {
    if (isOutAndUp(resort, party, clock.ticks)) resort.nightOwls.add(party);
  }
}

// The keen go to bed with the show over, whether or not they were ever invited.
function sendTheKeenToBed(resort: Resort, now: number): void {
  if (!resort.keenShow || now < resort.keenShow.end) return;
  resort.keen.fill(0);
  resort.keenShow = null;
}

function endEvent(resort: Resort, run: EventRun, now: number): void {
  const kind = eventKindOf(run.occurrence);
  const ended = endRun(
    resort.events,
    run,
    resort.guests,
    (person) => stayCount(resort.thoughts, person, kind.praise),
    (person, amount) => remember(resort.happiness, person, amount),
  );
  const label = eventLabelOf(kind, run.occurrence.tier);
  for (const person of ended.people) hear(resort, now, person, kind.praise, label);
  resort.today = countEvent(resort.today, ended.tally);
  if (kind.id === 'welcome' && ended.tally.held > 0) {
    resort.today = countWelcomed(resort.today, ended.tally.audience);
  }
}

// Its stage gone only when no stage stands: one pulled down mid-meeting leaves others to use.
function noteWelcomeCalledOff(resort: Resort, step: CallOffStep): void {
  const gone = step.reason === 'no-site' && stageKeysOf(resort.venues).length === 0;
  resort.today = noteWelcomeGap(resort.today, gone ? 'no-stage' : 'called-off');
}

// A built-in left with no stage is the advice's to tell: it would be called off every day.
const quietCallOff = (step: CallOffStep): boolean =>
  step.reason === 'no-site' && eventKindOf(step.occurrence).builtIn === true;

function callOffEvent(resort: Resort, step: CallOffStep, now: number): void {
  const kind = eventKindOf(step.occurrence);
  const label = eventLabelOf(kind, step.occurrence.tier);
  resort.settled.add(bookingDayKey(step.occurrence));
  if (kind.id === 'welcome') noteWelcomeCalledOff(resort, step);
  if (quietCallOff(step)) return;
  resort.ledger = record(resort.ledger, 'events', step.refund);
  const called = callOffRun(step, resort.guests);
  for (const person of called.people) hear(resort, now, person, 'called-off', label);
  resort.today = countEvent(resort.today, called.tally);
}

type StepOf<Kind extends EventStep['kind']> = Extract<EventStep, { readonly kind: Kind }>;

interface StepContext {
  readonly resort: Resort;
  readonly now: number;
  readonly free: () => readonly AudienceParty[];
}

// What each step does to the resort. The rockets are not drawn from here but from the runs, so a
// load or a dragged clock plays the same show.
const EVENT_STEPS: {
  readonly [kind in EventStep['kind']]: (step: StepOf<kind>, context: StepContext) => void;
} = {
  announce: (step, { resort, free }) => inviteTo(resort, step.run, free),
  start: (step, { resort, free }) => {
    resort.ledger = record(resort.ledger, 'events', -step.fee);
    inviteTo(resort, step.run, free);
  },
  end: (step, { resort, now }) => endEvent(resort, step.run, now),
  'call-off': (step, { resort, now }) => callOffEvent(resort, step, now),
  postpone: (step, { resort }) => {
    resort.settled.add(bookingDayKey(step.occurrence));
    resort.today = countEvent(resort.today, { held: 0, audience: 0, called: 0, postponed: 1 });
  },
};

const settles = (step: EventStep): boolean => step.kind === 'call-off' || step.kind === 'postpone';

function applyEventSteps(resort: Resort, steps: readonly EventStep[], now: number): void {
  const context: StepContext = { resort, now, free: freePartiesOf(resort) };
  for (const step of steps) {
    (EVENT_STEPS[step.kind] as (step: EventStep, context: StepContext) => void)(step, context);
  }
}

// Every frame, as a party comes off the desk free at no particular moment.
function callLatecomers(resort: Resort, now: number): void {
  if (resort.newcomers.length === 0) return;
  for (const run of resort.events.runs) {
    const kind = eventKindOf(run.occurrence);
    if (kind.latecomers !== true) continue;
    inviteTo(resort, run, () =>
      latecomersFor({
        run,
        kind,
        newcomers: resort.newcomers,
        guests: resort.guests,
        isFree: (person) => resort.router.isFree(person),
        urgency: (person) => urgencyBesidesFun(resort, person),
        now,
      }),
    );
  }
}

// After the routers' ticks: the invitations and the end of a show act on where everybody now is.
function runEvents(
  resort: Resort,
  clock: Clock,
  ticks: number,
  heard: (steps: readonly EventStep[]) => void,
): void {
  const { events } = resort;
  const now = clock.ticks;
  const advance = advanceEvents(events, now - ticks + 1, now, eventFactsOf(resort, clock));
  events.programme = advance.programme;
  events.runs = advance.runs;
  applyEventSteps(resort, advance.steps, now);
  callLatecomers(resort, now);
  topUpTheSand(resort);
  refreshInvited(resort);
  if (advance.steps.some(settles)) refreshKeen(resort, clock);
  sendTheKeenToBed(resort, now);
  if (advance.steps.length > 0) heard(advance.steps);
  refreshEventVenues(resort, now);
  const hours = ticks / TICKS_PER_HOUR;
  const { router } = resort;
  const beach = beachIndexOf(resort);
  // On the sand only once settled: somebody still walking out is not yet watching.
  entertain(
    events,
    resort.needs,
    resort.guests,
    (person, venue) =>
      router.venueIndexOf(person) === venue &&
      !router.isWaitingAt(person) &&
      (venue !== beach || router.stayOf(person) === 'resting'),
    (run) => runVenueOf(resort, run),
    hours,
  );
  fadeGlow(events.glow, hours);
}

const WEEK_TICKS = 7 * TICKS_PER_DAY;

const runningShowOf = (resort: Resort): EventRun | null =>
  resort.events.runs.find(
    (run) => run.phase === 'running' && eventKindOf(run.occurrence).id === 'fireworks',
  ) ?? null;

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
  const seconds = (bench.warmupFrames + bench.measureFrames) * MAX_STEP;
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

function runTicks(
  resort: Resort,
  clock: Clock,
  ticks: number,
  lastShare: number | null,
  morning: () => void,
  hourly: () => void,
  heardEvents: (steps: readonly EventStep[]) => void,
): number {
  decayNeeds(resort.needs, resort.guests, ticks, weatherEffect(clock.weather), (person) =>
    resort.router.isAsleep(person),
  );
  // One tick at a time: a place freed on the first tick must let somebody in on the first.
  for (let tick = ticks; tick > 0; tick--) {
    resort.router.tick(clock.ticks - tick + 1);
    // Same tick as the guests', so a venue cleaned on the first tick is clean for whoever decides
    // next.
    resort.staffRouter.tick(clock.ticks - tick + 1);
  }
  // Once a frame, not once a tick: the inner loop is the router's, and a frame's sample is plenty.
  sampleFootfall(
    resort.footfall,
    resort.crowd.crowd.node,
    resort.guests.present,
    resort.happiness.level,
  );
  runEvents(resort, clock, ticks, heardEvents);
  // After the ticks, so a guest is charged for the line they were actually in.
  const { glow } = resort.events;
  ageHappiness(
    resort.happiness,
    resort.needs,
    resort.guests,
    (person) => resort.router.isWaitingAt(person),
    ticks,
    (person) => surroundingsOf(resort, person),
    (person) => glow[person]!,
  );
  // Over the whole run of ticks: twelve ticks in a frame must not step over the check-in hour.
  if (checkInDue(clock.ticks - ticks + 1, clock.ticks)) {
    payTheBills(resort);
    rateTheDay(resort);
    closeTheDay(resort, clock.day);
    runDay(resort, clock.day);
    resort.settled.clear();
    refreshKeen(resort, clock);
    refreshNightOut(resort, clock);
    // After the coaches and before the counters are wiped, which the advice reads.
    morning();
    resort.router.forgetTheDay();
    resort.thoughtDay.clear();
    fadeFootfall(resort.footfall);
  }
  // After the morning's wipe, so the first hour of a day is heard in that day.
  if (hourTurned(clock.ticks - ticks + 1, clock.ticks)) {
    hearSurroundings(resort, clock.ticks);
    burnOnTheBeach(resort, clock);
    refreshKeen(resort, clock);
    refreshNightOut(resort, clock);
    markNightOwls(resort, clock);
    hourly();
  }
  admitLaterWaves(resort, clock, ticks);
  refreshDj(resort, clock);
  // A booked event cheers its own audience, so a show on the same stage does not cheer them twice.
  cheerTheAudience(resort.needs, resort.guests.present, {
    performing: (venue) =>
      (resort.staffRouter.performingAt(venue) || resort.djOn[venue] === 1) &&
      resort.eventShowing[venue] !== 1,
    venueOf: (person) => resort.router.venueIndexOf(person),
    waiting: (person) => resort.router.isWaitingAt(person),
    venues: resort.venues.length,
    hours: ticks / TICKS_PER_HOUR,
  });
  return lightRooms(resort, lastShare);
}

// Stood at the node first, or a body dealt on an empty plot walks in from the origin.
function enterAt(crowd: Crowd, i: number, node: number): void {
  const at = crowd.network.nodes[node];
  if (at) holdAt(crowd, i, at.x, at.y, at.z, crowd.heading[i] ?? 0);
  putOnPlot(crowd, i, node);
}

// After the relocate, so the arrival node is on the graph the staff crowd now walks. Rezoned
// before anybody clocks on, so a zoned worker starts at a depot in their zone.
function staffTheResort(resort: Resort): void {
  const { recommended, roster, duty } = rosterNow(resort);
  const workers = resort.staff.crowd;
  const shift = shiftChange(duty, workers.offPlot);
  resort.recommended = recommended;
  resort.roster = roster;
  resort.duty = duty;
  rezone(resort);
  for (const worker of shift.leaving) resort.staffRouter.clockOff(worker);
  // No paving yet: they are owed their shift at the next edit that lays some.
  if (workers.network.edges.length === 0) return;
  const entries = clockOnNodes(resort, shift.starting);
  for (const [turn, worker] of shift.starting.entries()) {
    enterAt(workers, worker, entries[turn]!);
    resort.staffRouter.clockOn(worker);
  }
}

// With no staff house, at the entrance; with no entrance either, at node 0: anywhere on the
// paving beats waiting for a gate.
function clockOnNodes(resort: Resort, starting: readonly number[]): readonly number[] {
  const network = resort.staff.crowd.network;
  const index = pavingIndexOf(network);
  const doors = resort.depots
    .map((depot) => ({ depot, node: doorsFor(depot, index).nodes[0] ?? -1 }))
    .filter((door) => door.node >= 0);
  const depotZones = zonesOfPlaces(
    resort.zones,
    doors.map((door) => door.depot),
    network,
  );
  const arrival = Math.max(0, resort.router.arrivalNode);
  return starting.map((worker, turn) => {
    const depot = depotForShift(turn, resort.zoneOf[worker] ?? NO_ZONE, depotZones);
    return depot < 0 ? arrival : doors[depot]!.node;
  });
}

// A zone holds a workplace for a role wherever that role's task choice could send somebody, so
// nobody is dealt to a zone with no work for them. Cleaners sweep paving and sand and make up
// rooms, so those count too.
function rezone(resort: Resort): void {
  const { zones, venues, lodgings } = resort;
  if (!anyZone(zones)) {
    resort.venueZones = new Int32Array(venues.length);
    resort.lodgingZones = new Int32Array(lodgings.length);
    resort.zoneOf = new Int8Array(resort.staffPool.count).fill(NO_ZONE);
    return;
  }
  const network = resort.staff.crowd.network;
  resort.venueZones = zonesOfPlaces(zones, venues, network);
  resort.lodgingZones = zonesOfPlaces(zones, lodgings, network);
  const held = workplaceZones(zones, venues, resort.venueZones, {
    paved: network.nodes,
    towers: network.posts.map((seat) => tileUnder(network.seats[seat]!)),
    beach: beachTilesFor(resort.shore),
  });
  held.cleaner = resort.lodgingZones.reduce((mask, each) => mask | each, held.cleaner);
  const roles = resort.staffPool.role.map((role) => STAFF_ROLES.indexOf(role));
  resort.zoneOf = dealZones(
    roles,
    resort.duty,
    STAFF_ROLES.map((role) => zonesIn(held[role])),
  );
}

function zonesOfPlaces(
  zones: Zones,
  places: readonly (Venue | Lodging | Depot)[],
  network: WalkNetwork,
): Int32Array {
  const index = pavingIndexOf(network);
  return Int32Array.from(places, (place) =>
    zonesOf(
      zones,
      place,
      doorsFor(place, index).nodes.map((node) => network.nodes[node]!),
    ),
  );
}

const tileUnder = (spot: { readonly x: number; readonly z: number }) => ({
  tileX: Math.floor(spot.x / TILE_VOXELS),
  tileZ: Math.floor(spot.z / TILE_VOXELS),
});

// Shared with a load, which sets the duty without a shift change: the saved staff crowd already
// has everyone where the save left them.
function rosterNow(resort: Resort): {
  readonly recommended: Roster;
  readonly roster: Roster;
  readonly duty: Uint8Array;
} {
  const recommended = rosterFor(
    workplacesOf(resort.venues, resort.staff.crowd.network.posts, resort.lodgings),
  );
  const roster = rosterOf(resort.hiring, recommended);
  return { recommended, roster, duty: onDuty(resort.staffPool, roster) };
}

function strandedOn(venues: readonly Venue[], network: WalkNetwork): ReadonlySet<string> {
  const index = nodeIndexFor(network);
  return unreachableOn(venues, (venue) => doorsFor(venue, index, network));
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

// The beach last, as the guests' router lists it.
function unwatchedOn(resort: Resort): ReadonlySet<string> {
  const { staffRouter, venues } = resort;
  const { network } = resort.crowd.crowd;
  const beach = beachVenueFor(network);
  const water = beach ? [...venues, beach] : venues;
  const watching = (venue: number): boolean =>
    venue < venues.length ? staffRouter.watching(venue) : staffRouter.watchingBeach;
  return unwatched(water, watching, network.posts.length);
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
    unwatched: unwatchedOn(resort),
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

// Before the morning coach, so a day in the books runs from one check-in to the next.
function payTheBills(resort: Resort): void {
  const { plot } = resort;
  const standing = [...plot.placements, ...plot.props].map((placement) =>
    buildCostOf(placement.id),
  );
  const billed = record(resort.ledger, 'wages', -wagesFor(resort.roster));
  resort.ledger = closeDay(record(billed, 'maintenance', -maintenanceFor(standing)));
  resort.takings.clear();
  // Into the new day, so a lodging's takings show the morning's rent until the next one.
  const rent = nightBill(resort.guests, (home) => nightlyRate(resort, home), resort.takings);
  resort.ledger = record(resort.ledger, 'night', rent);
}

function nightlyRate(resort: Resort, home: number): number {
  const { id, key } = resort.guests.homes[home]!;
  const lodging = resort.lodgings[lodgingFor(resort.lodgings, key)];
  return lodging ? nightPriceOf(id, sceneryOver(resort.scenery, lodging)) : priceOf(id);
}

function rateTheDay(resort: Resort): void {
  const beds = bedCount(resort.guests);
  resort.rating = ratingFor({
    happiness: meanHappiness(resort.happiness, resort.guests),
    present: presentCount(resort.guests),
    housed: beds.taken,
    cleanliness: meanCleanliness(resort.upkeep, resort.venues.length),
  });
}

// Before the morning coach, which counts towards the new day. The first check-in of a resort
// built that morning closes a period nobody played, so it only restarts the counts.
function closeTheDay(resort: Resort, day: number): void {
  if (resort.today.from !== day) {
    noteMissedWelcome(resort);
    const report = reportOf({
      counts: resort.today,
      rating: resort.rating,
      present: presentCount(resort.guests),
      beds: resort.beds,
      ledger: resort.ledger,
      thoughts: resort.thoughtDay,
    });
    resort.history = keepDay(resort.history, report);
  }
  resort.today = startDay(day);
}

// A day with no welcome run or called off had no stage for it, or had it switched off.
function noteMissedWelcome(resort: Resort): void {
  if (resort.today.arrived === 0 || resort.today.welcome !== undefined) return;
  const gap = welcomeGapOf({
    programme: resort.events.programme,
    stages: stageKeysOf(resort.venues).length,
    held: false,
    called: false,
  });
  if (gap) resort.today = noteWelcomeGap(resort.today, gap);
}

function partiesArrivedOn(guests: Guests, day: number): number[] {
  const parties = new Set<number>();
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1 && guests.arrivedOn[person] === day) {
      parties.add(guests.party[person]!);
    }
  }
  return [...parties];
}

function noteArrivedParties(resort: Resort, arrived: readonly number[]): void {
  const known = new Set(resort.newcomers);
  for (const person of arrived) {
    const party = resort.guests.party[person]!;
    if (!known.has(party)) resort.newcomers.push(party);
    known.add(party);
  }
}

// The rating comes first, so the morning coach is sized by the resort the current guests
// experienced.
function runDay(resort: Resort, day: number): void {
  // Everybody kept up late has woken by now.
  resort.events.tired.clear();
  resort.homeEarly.clear();
  resort.nightOwls.clear();
  resort.newcomers = [];
  resort.arrivalsPlanned = arrivalsFor(resort.rating, bedsOn(resort.guests));
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
  for (const person of arrived) {
    // The body was somebody else's, and so was whatever it was holding and thinking.
    resort.carrying.nodes[person] = 0;
    forgetStay(resort.thoughts, person);
    resort.events.glow[person] = 0;
    resort.router.admit(person, resort.router.arrivalNode);
  }
  noteArrivedParties(resort, arrived);
  resort.arrivalsAdmitted += arrived.length;
  resort.today = countArrivals(resort.today, arrived.length);
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
  // Real seconds, as the lightning flashes by, so the thunder follows the same strikes.
  readonly running: number;
  // `pace` slows the simulated time alone, for a show on screen; the lightning keeps real time.
  advance(elapsedSeconds: number, pace?: number): number;
  follow(time: number, elapsedSeconds: number): number;
  restart(time: number): void;
  relight(): void;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  // Kept on the clock, not in weather.ts, so weatherOn stays pure; saved with the clock.
  setWeather(weather: Weather | null): void;
  snapshot(): ClockSnapshot;
  restore(saved: ClockSnapshot): void;
}

// Each a number, so a still frame is told apart from a changed one without a branch per input.
const sameSkyInputs = (a: readonly number[], b: readonly number[] | null): boolean =>
  b !== null && a.every((value, index) => value === b[index]);

function createClock(
  handle: SceneHandle,
  resort: () => Resort,
  startTime: number,
  glow: () => ShowLight,
): Clock {
  let clock: SimClock = createSimClock(0, startTime);
  let time = timeOf(clock);
  let forced: Weather | null = null;
  const weatherNow = (): Weather => forced ?? weatherOn(dayOf(clock), WEATHER_SEED);
  const overcastNow = (): number => weatherEffect(weatherNow()).overcast;
  // Real seconds, not simulated: the clock opens paused and a storm must still flash.
  let running = 0;
  const flashNow = (): number => (weatherNow() === 'storm' ? flashAt(running) : 0);
  let sky = flashSky(overcastSky(skyStateFor(time), overcastNow()), flashNow());
  let applied: readonly number[] | null = null;

  const apply = (): void => {
    time = timeOf(clock);
    const overcast = overcastNow();
    const flash = flashNow();
    const lit = glow();
    // Overcast, flash and glow are in the guard too: the weather turns at midnight even while
    // paused, and a flash or a burst lasts under a second.
    const inputs = [time, overcast, flash, lit.strength, lit.color];
    if (sameSkyInputs(inputs, applied)) return;
    sky = fireworksSky(flashSky(overcastSky(skyStateFor(time), overcast), flash), lit);
    handle.applySky(sky);
    resort().lighting.volume?.setLampFactor(sky.lampFactor);
    resort().world.setLampFactor(sky.lampFactor);
    resort().world.setFurledShare(furledShareAt(time));
    resort().world.setWet(isWet(weatherNow()));
    resort().shadows.applySky(sky);
    // The pools use the sea's shader, so they need the sky too.
    resort().world.setSky(sky.skyColor);
    applied = inputs;
  };
  apply();

  const relight = (): void => {
    // A new resort's volume and blobs start at zero whatever the time of day.
    applied = null;
    apply();
    // Otherwise its windows open on the previous plot's sleeping share.
    lightRooms(resort(), null);
  };

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
    get running() {
      return running;
    },
    relight,
    advance(elapsedSeconds, pace = 1) {
      running += elapsedSeconds;
      const advanced = advanceClock(clock, elapsedSeconds * pace);
      clock = advanced.clock;
      apply();
      return advanced.ticks;
    },
    follow(next, elapsedSeconds) {
      running += elapsedSeconds;
      const followed = followTime(clock, next);
      clock = followed.clock;
      apply();
      return followed.ticks;
    },
    restart(next) {
      clock = withSpeed(createSimClock(0, next), clock.speed);
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
    snapshot() {
      return { ticks: clock.ticks, speed: clock.speed, carry: clock.carry, forced };
    },
    restore(saved) {
      clock = { ticks: saved.ticks, speed: saved.speed, carry: saved.carry };
      forced = saved.forced;
      relight();
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
  readonly fireworks: FireworksField;
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

// By family: a Street Lamp B filed by its own id would be looked for among the buildings,
// and a bulldozed one would linger in the props.
function listFor(plot: Plot, id: string): Placement[] {
  return plot[listOf(familyOf(id))];
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
  // Raises every open site at once, so what is saved is what stands.
  finishAll(): void;
  // Carried over a settle, whose rebuild stands everything in the plot as finished.
  openSites(): readonly ConstructionSite[];
  reopen(open: readonly ConstructionSite[]): void;
  readonly ground: PickGround;
  placementOf(key: string): Placement | undefined;
  // For the placement a finger left waiting, with whichever of objects or land is armed.
  confirm(): void;
  dismiss(): void;
  turn(quarters: number): void;
  dispose(): void;
}

interface Purse {
  canAfford(amount: number): boolean;
  spend(reason: Reason, amount: number): void;
  refund(amount: number): void;
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
  // Only for a tile whose zone changed, so a drag over painted tiles deals nobody afresh.
  readonly onZonesChange: () => void;
  readonly onCancel: () => void;
  readonly onLift: (placement: Placement) => void;
  readonly money: Purse;
  readonly onRefused: (refusal: Refusal) => void;
  readonly onFallback: (fellBack: boolean) => void;
  readonly onPending: (pending: boolean) => void;
  readonly land: Pick<LandPointerOptions, 'canBuy' | 'onBuy'>;
  readonly onCue: (cue: BuildCue) => void;
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
  const pavingIds: ReadonlySet<string> = new Set(pavingItems.map((item) => item.id));
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
    staircase: pavingItem(STAIRCASE_ID),
    rampFoot: pavingItem(RAMP_FOOT_ID),
    rampHead: pavingItem(RAMP_HEAD_ID),
    flagstones: pavingItem(PATH_ID),
    mosaic: mosaicKitOf(pavingItems),
  };

  // Standing rails come from the rail index: rails are not in occupancy, and scanning the plot per
  // edit is too slow on a drag.
  const owns = (tileX: number, tileZ: number): boolean => {
    const { rights, plan } = resort();
    return ownsTile(rights, plan, tileX, tileZ);
  };
  const ownsFootprint = (placement: Placement): boolean =>
    footprintTiles(placement).every((tile) => owns(tile.x, tile.z));
  // Placing only: buying the land in front of a gate later is allowed, and it then stands inland.
  const fitsEdge = (placement: Placement): boolean => {
    const { rights, plan } = resort();
    return rights === null || !isGateway(placement.id) || facesUnowned(rights, placement, plan);
  };

  const handrails: HandrailRules = {
    pavedWith,
    levelOf: ground.levelOf,
    isWater: paving.isWater,
    isSpan: raisedProvider(paving),
    wantsStairs: wantsStairsOf(paving),
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

  // Only the armed tool's stroke ever lends it, and only while a finger holds its anchor.
  const lendFinger = (taken: boolean): void => handle.takeFinger(taken);

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
  const standPaid = (placement: Placement, due: number, lifted?: Placement): void => {
    const { plot, construction } = resort();
    if (lifted) lift(lifted);
    // Claimed first: if the tiles are gone the scene must not gain an object the index does not
    // know.
    occupancy.claim(placement, placement.key);
    parts.money.spend('build', due);
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

  // Refused before anything moves: a tile left unpaved re-lays no neighbour. Uncued for the
  // bulldozer's, which re-lays what a removal leaves behind.
  const standing =
    (cued: boolean) =>
    (placement: Placement, lifted?: Placement): void => {
      const due = costToStand(placement.id, lifted !== undefined);
      if (!parts.money.canAfford(due)) return parts.onRefused({ kind: 'money', id: placement.id });
      standPaid(placement, due, lifted);
      if (cued) parts.onCue(pavingIds.has(placement.id) ? 'pave' : 'place');
    };
  const stand = standing(true);

  // Land first: a footprint off the edge says so, rather than complaining about the gate's facing.
  const blocked = (placement: Placement): void => {
    if (!ownsFootprint(placement)) parts.onRefused({ kind: 'land' });
    else if (!fitsEdge(placement)) parts.onRefused({ kind: 'gate' });
  };

  const pointer = createBuildPointer({
    canvas,
    // Read per pick: the isometric view puts a different camera on screen.
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('object'),
    takeFinger: lendFinger,
    ghost,
    occupancy,
    ground,
    paving,
    handrails,
    owns: (tile) => owns(tile.x, tile.z),
    fits: fitsEdge,
    onPlace: stand,
    onRepave(placement, lifted) {
      const due = buildCostOf(placement.id);
      if (!parts.money.canAfford(due)) return parts.onRefused({ kind: 'money', id: placement.id });
      // Asked before standPaid lifts it, which cancels the site, as the bulldozer does.
      const stillBuilding = sites.some((site) => site.placement.key === lifted.key);
      standPaid(placement, due, lifted);
      parts.money.refund(refundOf(lifted.id, stillBuilding));
      parts.onCue('pave');
    },
    onBlocked: blocked,
    onRails: changeRails,
    onCancel,
    onFallback: parts.onFallback,
    onPending: parts.onPending,
  });

  const terrainRules: TerrainRules = {
    get terrain() {
      return resort().terrain;
    },
    isClear: (tileX, tileZ) => occupancy.keyAt({ x: tileX, z: tileZ }) === undefined,
    owns,
  };

  const spade = createTerrainPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('terrain'),
    takeFinger: lendFinger,
    ghost,
    ground,
    rules: terrainRules,
    handrails,
    onRails: changeRails,
    onDig(tile, next) {
      if (!parts.money.canAfford(DIG_COST)) {
        parts.onRefused({ kind: 'money', id: null });
        return;
      }
      resort().terrain.set(tile.x, tile.z, next);
      parts.money.spend('dig', DIG_COST);
      parts.onCue('dig');
      // Separate from onChange: the HUD counts are unchanged, but the terrain meshes must be
      // rebuilt.
      parts.onGroundChange();
    },
    onCancel,
  });

  // Free: a zone is paint on the plan, not a change to the ground.
  const zoneBrush = createZonePointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('zone'),
    takeFinger: lendFinger,
    ghost,
    ground,
    onPaint(tile, zone) {
      if (paintZone(resort().zones, tile.x, tile.z, zone, owns)) parts.onZonesChange();
    },
    onCancel,
  });

  const surveyor = createLandPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('land'),
    takeFinger: lendFinger,
    ghost,
    ground,
    ...parts.land,
    onCancel,
    onPending: parts.onPending,
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
    takeFinger: lendFinger,
    ghost,
    occupancy,
    ground,
    paving,
    handrails,
    placementOf,
    onDemolish(placement) {
      // Asked before lift, which cancels the site.
      const stillBuilding = sites.some((site) => site.placement.key === placement.key);
      lift(placement);
      parts.money.refund(refundOf(placement.id, stillBuilding));
      if (reshapesGround(placement)) parts.onGroundChange();
      onChange();
      parts.onCue('demolish');
    },
    onPlace: standing(false),
    onRails: changeRails,
    onCancel,
  });

  let armedFamily: string | null = null;

  return {
    select(tool) {
      // Every pointer is told every time, so the order cannot matter.
      const family = armedObject(tool);
      const chooser = itemChooser(tool, Math.random);
      if (chooser && family === armedFamily) pointer.restyle(chooser);
      else pointer.select(chooser);
      armedFamily = family;
      spade.select(armedBrush(tool));
      zoneBrush.select(armedZone(tool));
      bulldozer.select(armedRemove(tool));
      surveyor.select(armedLand(tool));
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
      if (tick.finished.length === 0) return;
      onChange();
      parts.onCue('built');
    },
    abandon() {
      sites = [];
    },
    finishAll() {
      const open = sites;
      for (const site of open) {
        cancelSite(site.placement.key);
        raise(site.placement);
      }
      if (open.length > 0) onChange();
    },
    openSites: () => sites,
    // The inverse of raise, then the site drawn as it was.
    reopen(open) {
      const { world, lighting, shadows } = resort();
      for (const site of open) {
        world.remove(site.placement.key);
        lighting.unlight(site.placement);
        lighting.unshade(site.placement);
        shadows.remove(site.placement.key);
      }
      sites = open;
      redrawSites();
    },
    ground,
    placementOf,
    // Both are told: only the armed one holds a placement, and an idle stroke ignores it.
    confirm() {
      pointer.confirm();
      surveyor.confirm();
    },
    dismiss() {
      pointer.dismiss();
      surveyor.dismiss();
    },
    turn: (quarters) => pointer.turn(quarters),
    dispose() {
      pointer.dispose();
      spade.dispose();
      zoneBrush.dispose();
      bulldozer.dispose();
      surveyor.dispose();
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
        copy?.canopy?.dispose();
      }
    }
  }
}

export interface BuildNote {
  readonly title: string;
  readonly message: string;
}

// Long enough for a strip of parcels bought one click at a time to settle once.
const SETTLE_DELAY_MS = 2_000;

const STAIRS_FALLBACK: BuildNote = {
  title: 'Stairs here',
  message: 'A ramp needs two straight tiles below the step.',
};

// A null id is the ground.
type Refusal =
  | { kind: 'money'; id: string | null }
  | { kind: 'parcel'; price: number }
  | { kind: 'land' }
  | { kind: 'gate' };

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

// A benchmark gets the authored plan: runs only compare if the scene is the same.
function startingSource(bench: BenchConfig | null, params: ResortParams): ResortSource {
  return bench ? { kind: 'authored' } : { kind: 'generate', params };
}

function prepRequestFor(source: ResortSource, bench: BenchConfig | null): PrepRequest {
  if (!bench) return { source, repeat: 1, view: null };
  return {
    source,
    repeat: bench.repeat,
    view: bench.view,
    ...(bench.styles ? { styles: bench.styles } : {}),
    ...(bench.mosaic ? { mosaic: true } : {}),
  };
}

function crowdStep(bench: boolean, walking: boolean, elapsed: number): number {
  if (bench) return MAX_STEP;
  return walking ? elapsed : 0;
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

function cameraOf(handle: SceneHandle): CameraSnapshot {
  const { position, zoom } = handle.camera;
  const { target } = handle.controls;
  return {
    mode: handle.cameraMode,
    isoDirection: handle.isoDirection,
    target: { x: target.x, y: target.y, z: target.z },
    position: { x: position.x, y: position.y, z: position.z },
    zoom,
  };
}

// Mode and direction first, as each re-stands the camera; the saved position then wins.
function restoreCamera(handle: SceneHandle, camera: CameraSnapshot): void {
  handle.setIsoDirection(camera.isoDirection);
  handle.setCameraMode(camera.mode);
  handle.lookAt(camera.target);
  handle.camera.position.set(camera.position.x, camera.position.y, camera.position.z);
  handle.camera.zoom = camera.zoom;
  handle.camera.updateProjectionMatrix();
  handle.controls.update();
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

const groundUnder = (
  resort: Resort,
  place: { readonly tileX: number; readonly tileZ: number },
): number => levelHeight(resort.terrain.levelOf(place.tileX, place.tileZ));

const LITTER_MARKER_LIFT = 8;

const projected = new Vector3();

// z beyond 1 is behind the camera, or past its far plane.
const inViewport = (point: Vector3): boolean =>
  point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;

// Preallocated, and the same view handed to every frame: the overlay reads it in place. A NaN
// anchor projects to NaN, which is never in the viewport, so its button stays hidden.
function createMarkerSpots(capacity: number) {
  const anchors = new Float32Array(capacity * 3);
  const view = { count: 0, spots: new Float32Array(capacity * 3) };
  const anchor = (index: number, point: Anchor): void => {
    anchors[index * 3] = point.x;
    anchors[index * 3 + 1] = point.y;
    anchors[index * 3 + 2] = point.z;
  };
  return {
    view: view as FrameUpdate['markers'],
    place(points: readonly Anchor[]): void {
      view.count = Math.min(points.length, capacity);
      for (let index = 0; index < view.count; index++) anchor(index, points[index]!);
    },
    anchor,
    showing(count: number): void {
      view.count = Math.min(count, capacity);
    },
    // In CSS pixels, which is what the overlay positions its buttons in.
    project(camera: SceneHandle['camera'], width: number, height: number): void {
      for (let index = 0; index < view.count; index++) {
        const at = index * 3;
        projected.set(anchors[at]!, anchors[at + 1]!, anchors[at + 2]!).project(camera);
        view.spots[at] = ((projected.x + 1) / 2) * width;
        view.spots[at + 1] = ((1 - projected.y) / 2) * height;
        view.spots[at + 2] = Number(inViewport(projected));
      }
    },
  };
}

interface RoofsFor {
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly depots: readonly Depot[];
  readonly roofs: Roofs;
}

const heightOf = (id: string | undefined): number =>
  id === undefined ? 0 : objectTypeById(id).model.height;

// A depot carries no model id, so its height is read off the placement it stands for.
function roofsNow(resort: Resort): Roofs {
  const { venues, lodgings, depots, plot } = resort;
  const over = (place: Footprint, id: string | undefined): Anchor =>
    roofOver(place, groundUnder(resort, place), heightOf(id));
  const placed = byKey(plot.placements);
  return {
    venues: venues.map((venue) => (shelterOf(venue) === 'covered' ? over(venue, venue.id) : null)),
    lodgings: lodgings.map((lodging) => over(lodging, lodging.id)),
    depots: depots.map((depot) => over(depot, placed.get(depot.key)?.id)),
  };
}

// Both axes, as either one looks end on from some camera.
function tilePxAt(camera: SceneHandle['camera'], at: Vector3, width: number, height: number) {
  projected.copy(at).project(camera);
  const x = projected.x;
  const y = projected.y;
  projected.set(at.x + TILE_VOXELS, at.y, at.z).project(camera);
  const alongX = Math.hypot((projected.x - x) * width, (projected.y - y) * height);
  projected.set(at.x, at.y, at.z + TILE_VOXELS).project(camera);
  const alongZ = Math.hypot((projected.x - x) * width, (projected.y - y) * height);
  return Math.max(alongX, alongZ) / 2;
}

interface ViewSize {
  readonly width: number;
  readonly height: number;
}

// Measured at the camera's target rather than per sign, so the signs come and go together.
function createSignSpots() {
  const spots = createMarkerSpots(MAX_SIGNS);
  let placed = 0;
  let shown = false;
  return {
    view: spots.view,
    place(points: readonly Anchor[]): void {
      spots.place(points);
      placed = spots.view.count;
    },
    project(camera: SceneHandle['camera'], target: Vector3, wanted: boolean, size: ViewSize) {
      const { width, height } = size;
      shown = wanted && placed > 0 && signsShown(tilePxAt(camera, target, width, height), shown);
      if (!shown) return spots.showing(0);
      spots.showing(placed);
      spots.project(camera, width, height);
    },
  };
}

const HEAR_MS = 200;

interface HearingParts {
  readonly handle: SceneHandle;
  readonly resort: () => Resort;
  readonly clock: Clock;
  readonly view: ViewSize;
  readonly fireworks: FireworksField;
  readonly onHear: (scene: HeardScene) => void;
}

// A fire pit crackles only while its bonfire burns, not whenever it could take guests.
function heardOpen(resort: Resort, venue: number, effect: WeatherEffect, tickOfDay: number) {
  const declared = resort.venues[venue]!;
  if (declared.hearth === true) return resort.eventShowing[venue] === 1;
  return openNow(declared, effect, tickOfDay);
}

// The sources are listed again whenever the venues are replaced, which every new resort, settle
// and reanchor does; scanning thousands of placements at 5 Hz would not be.
function createHearing({ handle, resort, clock, view, fireworks, onHear }: HearingParts) {
  const scene: HeardScene = {
    tilePx: 0,
    targetX: 0,
    targetZ: 0,
    night: 0,
    weather: clock.weather,
    stormSeconds: 0,
    show: null,
    showSeconds: 0,
    shore: Infinity,
    awake: 1,
    guests: 0,
    children: 0,
    swimmers: 0,
    near: new Float32Array(SOUND_KINDS.length),
    open: new Float32Array(SOUND_KINDS.length),
  };
  const guests: HeardGuests = { guests: 0, children: 0, swimmers: 0 };
  let sources: SoundSources | null = null;
  let listedFor: readonly Venue[] | null = null;
  let heardAt = -Infinity;

  const sourcesOf = (now: Resort): SoundSources => {
    if (sources === null || listedFor !== now.venues) {
      sources = soundSourcesOf([...now.plot.placements, ...now.plot.paths], soundOf, now.venues);
      listedFor = now.venues;
    }
    return sources;
  };

  return (timeMs: number): void => {
    if (timeMs - heardAt < HEAR_MS) return;
    heardAt = timeMs;
    const now = resort();
    const target = handle.controls.target;
    const effect = weatherEffect(clock.weather);
    scene.tilePx = tilePxAt(handle.camera, target, view.width, view.height);
    const listener = {
      x: target.x / TILE_VOXELS,
      z: target.z / TILE_VOXELS,
      radius: hearingRadius(scene.tilePx),
    };
    scene.targetX = listener.x;
    scene.targetZ = listener.z;
    scene.night = skyStateFor(clock.time).lampFactor;
    scene.weather = clock.weather;
    scene.stormSeconds = clock.running;
    // Only what is still to launch: a show stopped mid-air is not heard bursting on.
    scene.show = fireworks.playing ? fireworks.show : null;
    scene.showSeconds = fireworks.playhead;
    scene.shore = shoreDistance(now.shore, listener.x, listener.z, SURF_REACH);
    const { crowd } = now.crowd;
    const { cast } = now;
    const heard = {
      count: Math.min(crowd.count, now.guests.count),
      x: crowd.x,
      z: crowd.z,
      shown: cast.shown,
      placedX: cast.x,
      placedZ: cast.z,
      offPlot: crowd.offPlot,
      present: now.guests.present,
      child: now.guests.child,
      isAsleep: (person: number) => now.router.isAsleep(person),
    };
    hearGuests(heard, now.shore, listener, guests);
    Object.assign(scene, guests);
    const present = presentCount(now.guests);
    scene.awake = present > 0 ? 1 - Math.min(present, now.router.asleepCount) / present : 1;
    const isOpen = (venue: number): boolean => heardOpen(now, venue, effect, clock.tickOfDay);
    gatherSources(sourcesOf(now), listener, isOpen, scene.near, scene.open);
    onHear(scene);
  };
}

// Pinned per worker: slot i is worker i, so a button's role never changes under it.
function createStaffPinner(capacity: number) {
  const spots = createMarkerSpots(capacity);
  const inside = new Uint8Array(capacity);
  const titles = Array.from({ length: capacity }, () => '');
  // What each title was worded from, so a title is only built again when the task changes.
  const worded = new Float64Array(capacity).fill(-1);
  const task = createStaffTask();
  const spot = createPinSpot();
  const drawn = { x: 0, y: 0, z: 0 };
  let cached: RoofsFor | null = null;

  const roofsOf = (resort: Resort): Roofs => {
    if (cached === null || !roofsStand(cached, resort)) {
      const { venues, lodgings, depots } = resort;
      cached = { venues, lodgings, depots, roofs: roofsNow(resort) };
      // The indices a title was worded from name other buildings now.
      worded.fill(-1);
    }
    return cached.roofs;
  };

  const retitle = (resort: Resort, worker: number): void => {
    const key = titleKey(task);
    if (worded[worker] === key) return;
    worded[worker] = key;
    const words = taskWords(taskFactsOf(resort, worker, task));
    titles[worker] = pinTitle(staffName(resort.staffPool.role, worker), words);
  };

  const pin = (resort: Resort, worker: number, roofs: Roofs): void => {
    resort.staffRouter.taskOf(worker, task);
    const pinned = staffPinOf(task, writeDrawn(resort, worker, drawn), roofs, spot);
    spots.anchor(worker, pinned ? spot : NOWHERE);
    inside[worker] = Number(spot.inside);
    if (pinned) retitle(resort, worker);
  };

  const pinEach = (resort: Resort, count: number, shown: boolean, selected: number | null) => {
    const roofs = roofsOf(resort);
    for (let worker = 0; worker < count; worker++) {
      if (isPinned(worker, shown, selected)) pin(resort, worker, roofs);
      else spots.anchor(worker, NOWHERE);
    }
  };

  return {
    view: Object.assign(spots.view, { inside, titles }) as FrameUpdate['staff'],
    pin(resort: Resort, shown: boolean, selected: number | null): void {
      const count = shown || selected !== null ? Math.min(capacity, resort.staffPool.count) : 0;
      if (count > 0) pinEach(resort, count, shown, selected);
      spots.showing(count);
    },
    project: spots.project,
  };
}

const roofsStand = (cached: RoofsFor, resort: Resort): boolean =>
  cached.venues === resort.venues &&
  cached.lodgings === resort.lodgings &&
  cached.depots === resort.depots;

const titleKey = (task: StaffTask): number => {
  const kind =
    STAFF_TASK_KINDS.indexOf(task.kind) * 4 + Number(task.working) * 2 + Number(task.ordered);
  return (kind * TITLE_SPAN + task.venue + 1) * TITLE_SPAN + task.lodging + 1;
};

const labelOf = (list: readonly { readonly label: string }[], index: number): string | null =>
  list[index]?.label ?? null;

function taskFactsOf(resort: Resort, worker: number, task: StaffTask): TaskFacts {
  const venue = resort.venues[task.venue];
  return {
    kind: task.kind,
    working: task.working,
    role: resort.staffPool.role[worker]!,
    venue: venue?.label ?? null,
    lodging: labelOf(resort.lodgings, task.lodging),
    ordered: task.ordered,
    named: venue !== undefined && isNamed(venue),
  };
}

const isAway = (resort: Resort, worker: number): boolean =>
  resort.staff.crowd.offPlot[worker] === 1 || resort.staffCast.shown[worker] === SHOWN.hidden;

// Where the worker is drawn, the cast's place or the crowd's; NaN for anybody not on the plot.
function writeDrawn(resort: Resort, worker: number, into: { x: number; y: number; z: number }) {
  if (isAway(resort, worker)) return Object.assign(into, NOWHERE);
  const { staffCast } = resort;
  const from = staffCast.shown[worker] === SHOWN.placed ? staffCast : resort.staff.crowd;
  into.x = from.x[worker]!;
  into.y = from.y[worker]!;
  into.z = from.z[worker]!;
  return into;
}

function lookAtWorker(handle: SceneHandle, resort: Resort, worker: number | null): void {
  if (worker === null) return;
  const at = writeDrawn(resort, worker, { x: 0, y: 0, z: 0 });
  if (!Number.isNaN(at.x)) handle.lookAt(at);
}

function sendToPlace(resort: Resort, role: OrderRole, key: string | null): void {
  const venue = key === null ? -1 : venueIndexOf(resort.venues, key);
  if (venue >= 0) resort.staffRouter.order(role, { venue });
}

function sendToTile(resort: Resort, at: { readonly tileX: number; readonly tileZ: number }) {
  resort.staffRouter.order('cleaner', { tile: at.tileZ * resort.litter.tilesX + at.tileX });
}

// A venue goes by its name, which the type's label in the view gives way to.
const withNaming = (view: PlaceView, venue: Venue | undefined): PlaceView =>
  venue === undefined
    ? view
    : {
        ...view,
        label: venue.label,
        naming: {
          kind: venue.kind ?? venue.label,
          named: isNamed(venue),
          suggested: namesOf(venue.id).length > 0,
        },
      };

// Only a stage has a programme to show.
const withProgramme = (resort: Resort, view: PlaceView, venue: number, now: number): PlaceView =>
  resort.venues[venue]?.stage === true
    ? { ...view, programme: { next: nextAt(resort.events.programme, view.key, now) } }
    : view;

// Only a venue can be sent to; a fixture or a lodging has nothing for a mechanic or a cleaner.
const withSends = (resort: Resort, view: PlaceView, venue: number): PlaceView =>
  venue < 0 ? view : { ...view, send: sendOffers(sendFactsOf(resort, venue)) };

const onDutyAs = (resort: Resort, role: StaffRole): number =>
  resort.staffPool.role.filter((each, worker) => each === role && resort.duty[worker] === 1).length;

function sendFactsOf(resort: Resort, venue: number): SendFacts {
  const sent = (role: OrderRole): boolean =>
    resort.staffRouter.ordersOf().some((order) => order.role === role && order.venue === venue);
  return {
    broken: isBroken(resort.breakdowns, venue),
    dirty: cleanliness(resort.upkeep, venue) < NEEDS_CLEANING,
    onDuty: { mechanic: onDutyAs(resort, 'mechanic'), cleaner: onDutyAs(resort, 'cleaner') },
    sent: { mechanic: sent('mechanic'), cleaner: sent('cleaner') },
  };
}

// Where advice and markers name it: a venue by its origin tile.
function orderSpotsOf(resort: Resort, orders: readonly Order[]): readonly OrderSpot[] {
  const { tilesX } = resort.litter;
  return orders.flatMap((order) => {
    const venue = resort.venues[order.venue];
    if (venue) return [{ role: order.role, tileX: venue.tileX, tileZ: venue.tileZ }];
    if (order.tile < 0) return [];
    return [
      { role: order.role, tileX: order.tile % tilesX, tileZ: Math.floor(order.tile / tilesX) },
    ];
  });
}

const shiftChanged = (view: SelectionView | null, working: boolean): boolean =>
  view?.kind === 'staff' && view.onDuty !== working;

const NOWHERE: Anchor = { x: Number.NaN, y: Number.NaN, z: Number.NaN };

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

// Wider than any plot's venue or lodging list, so a title key never runs one into the next.
const TITLE_SPAN = 1 << 16;

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
  let name = resortNameFor(params.seed);
  const [catalogue, first] = await Promise.all([
    meshModels(scratch, bench).then(loaded('models', options.onLoading)),
    preparer
      .prepare(prepRequestFor(startingSource(bench, params), bench))
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
    trackTimestamp: true,
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

  // Its own step for the same reason as the weather's. A bench plays only the show it asks for.
  const advanceFireworks = (elapsedSeconds: number): void => {
    if (bench) playBenchShow(current(), fireworks, bench);
    else syncFireworks(current(), fireworks, clock.ticks);
    const step = bench ? MAX_STEP : elapsedSeconds;
    fireworks.advance(step);
    current().flames.advance(step);
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

  const openIsometric = (): void => {
    if (drift === null) return;
    setCameraMode('isometric');
    options.onCameraChange?.(cameraView());
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
      if (drift) return;
      setCameraMode(mode);
      options.onCameraChange?.(cameraView());
    },
    onTurn: (quarters) => {
      if (drift) return;
      setIsoDirection(turnDirection(handle.isoDirection, quarters));
      options.onCameraChange?.(cameraView());
    },
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
    scratch,
    catalogue,
    startup,
    mountStarted,
    weather: () => clock.weather,
    rain,
    fireworks,
  });

  // A flag rather than a rebuild per spadeful: the rebuild is coalesced to one per frame.
  let ground = false;

  // Told once a frame: a placement costs a scan and a React render, and a drag places one per move.
  let counted = false;

  // Deferred until the pointer is still for REANCHOR_DELAY_MS, so a whole stroke costs one rebuild.
  let walkStaleAt: number | null = null;

  // Told once a frame: a drag spends once per tile.
  let spent = false;

  const tellMoney = (): void => options.onMoneyChange?.(current().ledger);

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

  // Bumped by anything a settle's prepared world would miss, so a settle overtaken by an edit is
  // thrown away rather than undoing it.
  let edits = 0;

  // Never under a bench, whose runs place nothing a player did.
  const cue = (played: BuildCue): void => {
    if (!bench) options.onCue?.(played);
  };

  const landPrice = (): number => landPriceOf(current().ledger.mode);
  const tellLand = (): void => options.onLandChange?.(landViewOf(current().rights, landPrice()));

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
      edits++;
      scheduleSettle();
      tellLand();
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
      walkStaleAt = performance.now();
      edits++;
      letter();
      options.onDirty?.();
    },
    onGroundChange: () => {
      ground = true;
      edits++;
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
      if (namesPlacement(selected, placement.key)) select(null);
    },
    money,
    onRefused: refused,
    onFallback: fallback,
    onPending: (pending) => options.onPendingChange?.(pending),
    land,
    onCue: cue,
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
      name,
    );
  };
  letter();

  // Off under a bench, as the markers are. Told again whenever the venues are rebuilt, so the
  // HUD's buttons and the anchors line up.
  const placeSigns = (): void => {
    if (bench) return;
    const resort = current();
    const spots = signSpotsOf(resort.venues, signOf);
    const venues = new Map(resort.venues.map((venue) => [venue.key, venue]));
    const anchorOf = (spot: SignSpot): Anchor => {
      const venue = venues.get(spot.key)!;
      return signAnchorOf(venue, groundUnder(resort, venue), objectTypeById(venue.id).model.height);
    };
    signSpots.place(spots.map(anchorOf));
    options.onSigns?.(spots);
  };
  placeSigns();

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

  // The index, not the view: the view is rebuilt on a new day or an edit, and the live line needs
  // the index.
  let selected: InspectTarget = null;
  let selectedOn = clock.day;

  const guestAt = (person: number): SelectionView => {
    const { guests, needs, happiness, venues, crowd, thoughts, cast } = current();
    // Where they are drawn; somebody hidden indoors is where the crowd holds them, in the venue.
    const drawn = cast.shown[person] === SHOWN.placed ? cast : crowd.crowd;
    const at = { x: drawn.x[person] ?? 0, z: drawn.z[person] ?? 0 };
    const thought = latestOf(thoughts, person);
    return guestView(guests, needs, happiness, venues, person, clock.day, at, thought, thoughts);
  };

  const workerAt = (worker: number): SelectionView | null => {
    const { staffPool: pool, zoneOf, duty } = current();
    if (worker < 0 || worker >= pool.count) return null;
    return staffView(pool.role, worker, zoneOf[worker] ?? NO_ZONE, duty[worker] === 1);
  };

  const somebodyAt = (target: { readonly person: number } | { readonly worker: number }) =>
    'person' in target ? guestAt(target.person) : workerAt(target.worker);

  const viewOf = (target: InspectTarget): SelectionView | null => {
    if (!target) return null;
    if (!('key' in target)) return somebodyAt(target);
    const placement = build.placementOf(target.key);
    if (!placement) return null;
    const resort = current();
    const { guests, router } = resort;
    // By key: the venue list is the router's numbering; -1 reads as spotless.
    const venue = resort.venues.findIndex((candidate) => candidate.key === placement.key);
    const view = placeView(
      placement,
      objectTypeById(placement.id).label,
      guests,
      router.occupancyOf(placement.key),
      sceneryOver(resort.scenery, placement),
      cleanliness(resort.upkeep, venue),
      takingsOf(resort.takings, placement.key),
      resort.staffRouter.watching(venue),
      isBroken(resort.breakdowns, venue),
    );
    const offered = withProgramme(resort, withSends(resort, view, venue), venue, clock.ticks);
    return withNaming(offered, resort.venues[venue]);
  };

  // Kept to tell when a worker's shift has changed under their open panel.
  let selectedView: SelectionView | null = null;

  const select = (target: InspectTarget): void => {
    const view = viewOf(target);
    selected = view ? target : null;
    selectedView = view;
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

  let toldOrders: readonly Order[] | null = null;

  // The panel of a building an order names says who is on the way, so it is worded again.
  const tellOrders = (): void => {
    const resort = current();
    const orders = resort.staffRouter.ordersOf();
    if (orders === toldOrders) return;
    toldOrders = orders;
    options.onOrdersChange?.(orderSpotsOf(resort, orders));
    rewordPlace();
  };

  const rewordPlace = (): void => {
    if (placementKeyOf(selected) !== null) select(selected);
  };

  const workerTask = createStaffTask();
  const workerAtNow = { x: 0, y: 0, z: 0 };

  const workerLine = (worker: number): string => {
    const resort = current();
    if (shiftChanged(selectedView, resort.duty[worker] === 1)) select(selected);
    const task = resort.staffRouter.taskOf(worker, workerTask);
    const at = writeDrawn(resort, worker, workerAtNow);
    return staffLine(taskFactsOf(resort, worker, task), task.load, SPELLS_PER_LOAD, at);
  };

  const inspectLine = (): string | null => {
    if (selected !== null && clock.day !== selectedOn) select(selected);
    const worker = workerOf(selected);
    return worker === null ? guestLine() : workerLine(worker);
  };

  const guestLine = (): string | null => {
    const person = personOf(selected);
    if (person === null) return null;
    const { crowd, needs, guests } = current();
    return activityLine(crowd.crowd, needs, guests, person, errandFor(person));
  };

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
  });

  let dayAdvice: readonly Advice[] = [];
  let demandNow: Demand | null = null;

  // One facts build for both, so the bars and the advice describe the same moment.
  const adviceAndDemand = (): readonly Advice[] => {
    const facts = factsNow(current(), clock.weather, clock.ticks);
    demandNow = demandFor(facts);
    return adviceFor(facts);
  };

  const advise = (): void => {
    dayAdvice = adviceAndDemand();
    options.onAdviceChange?.(dayAdvice, clock.ticks);
  };

  const adviseHourly = (): void => {
    options.onAdviceChange?.(refreshedWithin(dayAdvice, adviceAndDemand()), clock.ticks);
  };

  const speak = (): void => options.onThoughtsChange?.(voicesOf(current()));

  const report = (): void => options.onStatusChange?.(statusOf(current(), clock, demandNow));

  const tellHistory = (): void => options.onHistoryChange?.(current().history);

  const tellProgramme = (): void => options.onProgrammeChange?.(programmeFactsOf(current(), clock));

  const heardEvents = (steps: readonly EventStep[]): void => {
    for (const news of eventNewsFrom(steps, current().siteVenues, clock.weather)) {
      options.onEventNews?.(news);
    }
    // A fee or a refund may have moved the money, and a show put off moved the programme.
    spent = true;
    tellProgramme();
    options.onDirty?.();
  };

  // A booking moves no money, but it does change the advice and what a save holds.
  const programmeChanged = (programme: Programme): void => {
    const resort = current();
    resort.events.programme = programme;
    refreshEventVenues(resort, clock.ticks);
    refreshKeen(resort, clock);
    refreshNightOut(resort, clock);
    tellProgramme();
    // A stage open in the inspector says what is on next there.
    select(selected);
    options.onAdviceChange?.(refreshedWithin(dayAdvice, adviceAndDemand()), clock.ticks);
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

  const hourly = (): void => {
    adviseHourly();
    speak();
    report();
    tellMoney();
    tellProgramme();
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
    advise();
    report();
    tellHistory();
    tellMoney();
    options.onDirty?.();
    options.onMorning?.();
  };

  const rebuilt = (): void => {
    clock.relight();
    paintOverlay();
    onSceneChange?.(statsNow());
    advise();
    speak();
    report();
    tellHistory();
    tellMoney();
    tellLand();
    tellProgramme();
  };

  let requested = 0;

  // Told at once, so a save that fails to restore still leaves the next advice a baseline.
  const replaceResort = (prepared: PreparedResort, population?: number): Resort => {
    const resort = slot.replace(prepared, population);
    fireworks.clear();
    ownership.update(resort.rights, resort.plan);
    options.onResortReplaced?.();
    return resort;
  };

  // An answer overtaken by a later request is dropped rather than flashed on screen.
  const regrow = async (
    asked: ResortParams,
    source: ResortSource,
    mode: GameMode,
  ): Promise<void> => {
    cancelSettle();
    const request = ++requested;
    const prepared = await preparer.prepare(prepRequestFor(source, bench));
    if (request !== requested || !running) return;
    params = asked;
    build.abandon();
    // The person index and the placement key both name something on the old plot.
    select(null);
    walkStaleAt = null;
    replaceResort(prepared);
    current().ledger = createLedger(mode, OPENING_BALANCE[mode]);
    openIsometric();
    drift = null;
    handle.controls.enabled = true;
    clock.restart(INITIAL_TIME);
    letter();
    placeSigns();
    rebuilt();
    options.onOpenChange?.(current().open);
  };

  const snapshot = (): GameSnapshot => {
    build.finishAll();
    return gameNow();
  };

  // Without raising the open sites, which a settle carries over still going up.
  const gameNow = (): GameSnapshot => {
    if (walkStaleAt !== null) reanchor();
    return gameOf(current());
  };

  const gameOf = (resort: Resort): GameSnapshot => {
    return {
      version: SAVE_VERSION,
      world: savedWorldOf(resort.plan, resort.terrain, resort.plot, resort.rights),
      params,
      name,
      population: resort.guests.count,
      staffCount: resort.staffPool.count,
      resort: snapshotResort(resort),
      router: resort.router.snapshot(),
      staffRouter: resort.staffRouter.snapshot(),
      events: snapshotEvents(resort.events),
      crowd: snapshotCrowd(resort.crowd.crowd),
      staff: snapshotCrowd(resort.staff.crowd),
      clock: clock.snapshot(),
      camera: cameraOf(handle),
    };
  };

  // Everything React shows is told again: the HUD still holds the game that was replaced.
  const announceLoaded = (resort: Resort): void => {
    letter();
    placeSigns();
    options.onNameChange?.(name);
    rebuilt();
    options.onOpenChange?.(resort.open);
    options.onCameraChange?.(cameraView());
  };

  // Every module in the order its readers expect: the guests before the routers that read them
  // and the routers before the crowds they steer.
  const restoreGame = (resort: Resort, saved: GameSnapshot): void => {
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
  };

  // Mirrors regrow.
  const load = async (saved: GameSnapshot): Promise<void> => {
    cancelSettle();
    const request = ++requested;
    const prepared = await preparer.prepare(
      prepRequestFor({ kind: 'saved', world: saved.world }, bench),
    );
    if (request !== requested || !running) return;
    build.abandon();
    select(null);
    walkStaleAt = null;
    const resort = replaceResort(prepared, saved.population);
    restoreGame(resort, saved);
    clock.setSpeed('paused');
    drift = null;
    handle.controls.enabled = true;
    // After the replace, whose reframe has put the camera back where a new plot is looked at from.
    restoreCamera(handle, saved.camera);
    params = saved.params;
    name = savedResortName(saved.name, saved.params.seed);
    announceLoaded(resort);
    options.onSpeedChange?.('paused');
  };

  // Putting the land tool away settles at once rather than leaving the player to wait for it.
  const landToolChanged = (was: boolean, now: boolean): void => {
    ownership.showForSale(now);
    if (was && !now && settleTimer !== null) void settle();
  };

  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let settling = false;

  const cancelSettle = (): void => {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = null;
  };

  const scheduleSettle = (): void => {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => void settle(), SETTLE_DELAY_MS);
  };

  // A rebuild that keeps the game, so the lighting, the beach and the guests catch up with the land
  // bought. The world is prepared first and the game taken after, so nothing played meanwhile is lost.
  // A load or a new game since the settle began has the last word.
  const stillCurrent = (request: number, before: Resort): boolean =>
    request === requested && current() === before && running;

  // One at a time: a purchase made while one prepares moves `edits`, and that one reschedules.
  const settle = async (): Promise<void> => {
    cancelSettle();
    if (settling) return;
    settling = true;
    const started = edits;
    // Not bumped: a settle must never drop a load or a new game, only be dropped by one.
    const request = requested;
    const before = current();
    const world = savedWorldOf(before.plan, before.terrain, before.plot, before.rights);
    const prepared = await preparer
      .prepare(prepRequestFor({ kind: 'saved', world }, bench))
      .finally(() => {
        settling = false;
      });
    if (!stillCurrent(request, before)) return;
    if (edits === started) settleOnto(prepared);
    else scheduleSettle();
  };

  const settleOnto = (prepared: PreparedResort): void => {
    const replaceStarted = performance.now();
    const saved = gameNow();
    const camera = cameraOf(handle);
    const sites = build.openSites();
    const population = Math.max(
      saved.population,
      populationOf(prepared.plan, prepared.plot, undefined),
    );
    build.abandon();
    select(null);
    walkStaleAt = null;
    const resort = replaceResort(prepared, population);
    restoreGame(resort, population > saved.population ? widenGame(saved, gameOf(resort)) : saved);
    build.reopen(sites);
    restoreCamera(handle, camera);
    announceLoaded(resort);
    console.info(
      `Settled the land in ${prepared.prepMs} ms on the worker and ${Math.round(performance.now() - replaceStarted)} ms here, for ${population} guests`,
    );
  };

  // The walk graph and everything indexed by its nodes, rebuilt from the plot's lists after an
  // edit. A snapshot runs it too, so what is saved never pairs new lists with the old graph.
  const reanchor = (): void => {
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
    resort.names = assignNames(resort.names, namedPlacesOf(plot.placements));
    resort.venues = venuesOn(plot.placements, resort.names);
    resort.lodgings = lodgingsOn(plot.placements);
    resort.gateways = gatewaysOn(plot.placements);
    resort.depots = depotsOn(plot.placements);
    // Before the router's rebuild, whose findHomes maps the new home indices.
    rehome(resort.guests, homesOn(plot.placements));
    resort.homeOfLodging = homesOfLodgings(resort.lodgings, resort.guests.homes);
    const beds = bedCount(resort.guests);
    resort.beds = { total: beds.beds, taken: beds.taken };
    // By key: surviving venues keep their dirt, and new ones start clean.
    resort.upkeep = carryUpkeep(resort.upkeep, wasStanding, resort.venues);
    resort.breakdowns = carryBreakdowns(resort.breakdowns, wasStanding, resort.venues);
    resort.scenery = sceneryFieldFor(
      sceneryItemsOf([...plot.placements, ...plot.props, ...plot.paths], sceneryOf),
      plan.tilesX,
      plan.tilesZ,
    );
    resort.binCover = binCoverFor(
      binsOn([...plot.placements, ...plot.props]),
      plan.tilesX,
      plan.tilesZ,
    );
    const paving = nodeIndexFor(network);
    // Sand under a building just placed would never be swept.
    pruneLitter(
      resort.litter,
      (x, z) =>
        paving.at(x, z) !== undefined ||
        (isBeach(shore, x, z) && resort.occupancy.keyAt({ x, z }) === undefined),
    );
    resort.unreachable = strandedOn(resort.venues, network);
    resort.siteVenues = withBeach(resort.venues, network);
    Object.assign(resort, sandOf(network.beach));
    keepProgrammeStanding(resort, wasStanding);
    refreshInvited(resort);
    refreshEventVenues(resort, clock.ticks);
    resort.router.rebuild(resort.venues, resort.lodgings, resort.gateways, network);
    resort.staffRouter.rebuild(resort.venues, network, resort.lodgings, resort.depots);
    crowd.relocate(network, (person) => resort.router.holds(person));
    resort.staff.relocate(network);
    staffTheResort(resort);
    recastAfterEdit(resort, network, wasStanding);
    resort.footfall = createFootfall(network.nodes.length);
    paintOverlay();
    letter();
    placeSigns();
    // Said now rather than tomorrow; the day's counters are left alone.
    advise();
    speak();
    report();
    tellProgramme();
  };

  const recorder = bench
    ? createBenchRecorder({
        bench,
        handle,
        stats: statsNow,
        litLamps: () => clock.litLamps,
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
    options.onLoading?.('scene');
  };

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
    if (spent) {
      tellMoney();
      spent = false;
    }
    // Guarded so a bench that ever places something does not rebuild mid-run.
    if (walkStaleAt !== null && !bench && timeMs - walkStaleAt >= REANCHOR_DELAY_MS) reanchor();

    const elapsed = lastTimeMs === null ? 0 : (timeMs - lastTimeMs) / 1000;
    lastTimeMs = timeMs;
    // Fixed step under a benchmark: a frame-delta clock puts the scene elsewhere on the same frame
    // of two runs.
    const pace = showPaceOf(current(), fireworks, clock);
    const ticks = stepClock(clock, drift !== null, bench ? MAX_STEP : elapsed, pace);
    // Capped, so a backgrounded tab does not run a week of decay in one frame.
    if (ticks > 0) {
      lastShare = runTicks(current(), clock, ticks, lastShare, morning, hourly, heardEvents);
      recastAll(current());
      lightTheFires(current());
    }
    // Pinned to real time under a bench so runs replay; the crowd still walks though the bench
    // clock is paused. Outside one, handing over zero time is what stops a paused crowd;
    // crowdScaleFor is 1 while paused.
    const walked = crowdStep(bench !== null, drift !== null || clock.speed !== 'paused', elapsed);
    keepSeats(current().cast, current().casting, current().crowd.crowd.seatBy);
    const crowdScale = bench ? 1 : crowdScaleFor(clock.speed);
    // Before the crowd writes its instances, which draw the cast where perform left it.
    actSeconds = advanceActs(actSeconds, walked, crowdScale);
    perform(current().cast, actSeconds);
    performAtSea(current().cast, actSeconds, clock.ticks);
    performOnSand(current().cast, actSeconds, clock.ticks);
    performWork(current().staffCast, current().cast, actSeconds);
    current().ballField.write(current().cast.played);
    current().crowd.advance(walked, crowdScale);
    current().staff.advance(walked, crowdScale);
    current().balloons.advance(bench ? MAX_STEP : elapsed, lanternsOf(current(), clock));
    advanceFireworks(elapsed);
    drawnLitter = drawLitter(current(), drawnLitter);
    current().sea.advance(bench ? MAX_STEP : elapsed, walked * crowdScale);
    advanceWeather(elapsed);
    build.advance(bench ? MAX_STEP : elapsed);
    moveCamera(elapsed);
    listen(timeMs);
    chooseDetail();
    const renderStarted = performance.now();
    handle.renderer.render(handle.scene, handle.camera);
    // WebGPU records and submits here; the GPU works afterwards.
    const frameEnded = performance.now();
    tellDrawn();
    frameCost = sampleFrameCost(frameCost, timeMs, frameEnded - frameStarted);
    // Resolving drains the query pool, so once a frame gives one reading a frame.
    void handle.renderer.resolveTimestampsAsync().then((duration) => {
      if (typeof duration !== 'number' || duration <= 0) return;
      gpuMs = duration;
      recorder?.recordGpu(duration);
    });

    const sample = sampleFrame(fpsState, timeMs);
    fpsState = sample.state;

    signSpots.project(handle.camera, handle.controls.target, signsWanted, viewSize);
    markerSpots.project(handle.camera, viewSize.width, viewSize.height);
    staffPins.pin(current(), staffPinsShown, workerOf(selected));
    tellOrders();
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
      inspect: inspectLine(),
      markers: markerSpots.view,
      staff: staffPins.view,
      signs: signSpots.view,
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
    // Also fills the demand, so the status read after it at mount has bars.
    get advice() {
      return adviceAndDemand();
    },
    get voices() {
      return voicesOf(current());
    },
    get status() {
      return statusOf(current(), clock, demandNow);
    },
    get history() {
      return current().history;
    },
    get params() {
      return params;
    },
    get name() {
      return name;
    },
    get cameraView() {
      return cameraView();
    },
    get open() {
      return current().open;
    },
    get ledger() {
      return current().ledger;
    },
    setOpen(open) {
      const resort = current();
      if (resort.open === open) return;
      resort.open = open;
      options.onOpenChange?.(open);
      options.onDirty?.();
      advise();
    },
    rename(next) {
      if (next === name) return;
      name = next;
      letter();
      options.onNameChange?.(name);
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
      select(selected);
      placeSigns();
      advise();
      options.onDirty?.();
    },
    setHiring(role, count) {
      const resort = current();
      resort.hiring = hire(resort.hiring, role, count);
      staffTheResort(resort);
      options.onDirty?.();
      onSceneChange?.(statsNow());
      advise();
      tellProgramme();
    },
    get programme() {
      return programmeFactsOf(current(), clock);
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
    setCameraMode,
    setIsoDirection,
    setDetail(enabled) {
      if (bench) return;
      detail = enabled;
    },
    turnCamera: (quarters) => setIsoDirection(turnDirection(handle.isoDirection, quarters)),
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
    selectAt(tile) {
      const key = current().occupancy.keyAt({ x: tile.tileX, z: tile.tileZ });
      if (key !== undefined) select({ key });
    },
    generate(next) {
      const asked = clampParams(next);
      // A generated plot is given, not bought, so it is always sandbox.
      return regrow(asked, { kind: 'generate', params: asked }, 'sandbox');
    },
    clear(next, mode) {
      const asked = clampParams(next);
      // The seed goes along, so clearing gives a random landscape.
      return regrow(asked, { kind: 'clear', params: asked }, mode);
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
    setWeather: clock.setWeather,
    // Refused under a bench, as camera modes are: every recorded draw count has it off.
    setOverlay(kind) {
      if (bench) return;
      overlayKind = kind;
      paintOverlay();
      onSceneChange?.(statsNow());
    },
    selectPerson: (person) => select({ person }),
    selectWorker: (worker) => select({ worker }),
    showSelected: () => lookAtWorker(handle, current(), workerOf(selected)),
    sendStaff: (role) => sendToPlace(current(), role, placementKeyOf(selected)),
    sendCleanerTo: (tile) => sendToTile(current(), tile),
    clearSelection: () => select(null),
    snapshot,
    load,
    dispose() {
      running = false;
      cancelSettle();
      handle.renderer.setAnimationLoop(null);
      globalThis.removeEventListener('resize', resize);
      cameraKeys.dispose();
      inspector.dispose();
      build.dispose();
      preparer.dispose();
      rain.dispose();
      fireworks.dispose();
      current().dispose();
      handle.dispose();
      ownership.dispose();
      // Last: everything above is built over these.
      disposeCatalogue(catalogue);
    },
  };
}
