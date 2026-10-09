import {
  bedsOf,
  binReachOf,
  hireOf,
  objectTypeById,
  objectTypeTop,
  sceneryOf,
  shadeOf,
} from '../../catalog/domain/objectTypes';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import { seatSpotsFor } from '../../crowd/domain/seating';
import { walkNetworkFor, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { EventSite } from '../../events/domain/programme';
import { stagesByPreference } from '../../events/domain/welcome';
import { sandOf, type LaunchSite } from '../../fireworks/domain/launch';
import type { Home } from '../../guests/domain/homes';
import { ownedSpan } from '../../land/domain/landRights';
import type { Placement } from '../../layout/domain/resortLayout';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import type { Shore } from '../../layout/domain/shoreline';
import type { Terrain } from '../../layout/domain/terrain';
import { assignNames, namedPlacesOf, type VenueNames } from '../../naming/domain/venueNames';
import { unreachableOn } from '../../sim/domain/advice';
import { withBeach } from '../../sim/domain/beach';
import { depotsOn, type Depot } from '../../sim/domain/depots';
import { doorsFor } from '../../sim/domain/doors';
import { gatewaysOn, type Gateway } from '../../sim/domain/gateways';
import { binCoverFor, type BinSite } from '../../sim/domain/litter';
import { homesOfLodgings, lodgingsOn, type Lodging } from '../../sim/domain/lodgings';
import { sceneryFieldFor, sceneryItemsOf, type SceneryField } from '../../sim/domain/scenery';
import { shadeMapOf, type ShadeMap } from '../../sim/domain/shade';
import { venuesOn, type Venue } from '../../sim/domain/venues';
import { viewsFor, type Views } from '../../sim/domain/views';

export interface PlotGround {
  readonly plan: ResortPlan;
  readonly shore: Shore | null;
  readonly terrain: Terrain;
}

// Passed in, never read off a Plot: the first build reads layout.*, which a benchmark's tiled
// copies must not be counted from, and a rebuild after an edit reads the plot's lists.
export interface PlotSources {
  readonly placements: readonly Placement[];
  readonly props: readonly Placement[];
  readonly paths: readonly Placement[];
}

export interface PlotFacts {
  readonly network: WalkNetwork;
  readonly paving: NodeIndex;
  readonly names: VenueNames;
  readonly venues: readonly Venue[];
  readonly siteVenues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly gateways: readonly Gateway[];
  readonly depots: readonly Depot[];
  readonly unreachable: ReadonlySet<string>;
  readonly homes: readonly Home[];
  readonly homeOfLodging: Int32Array;
  readonly beachTiles: number;
  readonly launchSites: readonly LaunchSite[];
  readonly scenery: SceneryField;
  readonly views: Views;
  readonly shade: ShadeMap;
  readonly binCover: Uint8Array;
  readonly venueIndex: ReadonlyMap<string, number>;
  readonly siteVenueIndex: ReadonlyMap<string, number>;
  readonly rentalVenues: ReadonlyMap<string, number>;
  readonly stages: readonly EventSite[];
}

function networkOn(ground: PlotGround, sources: PlotSources): WalkNetwork {
  const { plan, shore, terrain } = ground;
  // Props too: the layout stands benches as props, so placements alone have nothing to sit on.
  const standing = [...sources.placements, ...sources.props];
  return walkNetworkFor({
    paved: sources.paths,
    levelOf: (tileX, tileZ) => terrain.levelOf(tileX, tileZ),
    shore,
    tilesX: plan.tilesX,
    span: ownedSpan(plan.land ?? null, plan),
    // Asked of the ground exactly as layoutResort asks, so the crowd walks the deck the layout
    // stood.
    bridged: (tileX, tileZ) =>
      terrain.surfaceOf(tileX, tileZ) === 'water' && !terrain.isSea(tileX, tileZ),
    seats: seatSpotsFor(standing.map(seatSiteOf)),
    // The sand under a sail is walked and lain on: only its posts stand, clear of every pitch.
    obstacles: standing.filter((placement) => !shadeOf(placement.id)),
  });
}

// A lodging is reached by its doors alone, never over the sand, as the router walks guests home.
function strandedOn(
  venues: readonly Venue[],
  lodgings: readonly Lodging[],
  network: WalkNetwork,
  paving: NodeIndex,
): ReadonlySet<string> {
  return new Set([
    ...unreachableOn(venues, (venue) => doorsFor(venue, paving, network)),
    ...unreachableOn(lodgings, (lodging) => doorsFor(lodging, paving)),
  ]);
}

// A stranded lodging houses nobody, or its guests would be checked in to walk all night.
function homesOn(placements: readonly Placement[], stranded: ReadonlySet<string>): Home[] {
  return (
    placements
      .filter((placement) => !stranded.has(placement.key))
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

function placesOn(
  placements: readonly Placement[],
  held: VenueNames,
  network: WalkNetwork,
  paving: NodeIndex,
) {
  const names = assignNames(held, namedPlacesOf(placements));
  const venues = venuesOn(placements, names);
  const lodgings = lodgingsOn(placements);
  const unreachable = strandedOn(venues, lodgings, network, paving);
  const homes = homesOn(placements, unreachable);
  return {
    names,
    venues,
    siteVenues: withBeach(venues, network),
    lodgings,
    gateways: gatewaysOn(placements),
    depots: depotsOn(placements),
    unreachable,
    homes,
    homeOfLodging: homesOfLodgings(lodgings, homes),
  };
}

function fieldsOn(plan: ResortPlan, sources: PlotSources) {
  const { placements, props, paths } = sources;
  return {
    // Props too, since the layout stands trees as either, and paving, since a mosaic dresses a
    // square.
    scenery: sceneryFieldFor(
      sceneryItemsOf([...placements, ...props, ...paths], sceneryOf),
      plan.tilesX,
      plan.tilesZ,
    ),
    shade: shadeMapOf(placements, shadeOf, plan.tilesX),
    binCover: binCoverFor(binsOn([...placements, ...props]), plan.tilesX, plan.tilesZ),
  };
}

const indexByKey = (venues: readonly Venue[]): ReadonlyMap<string, number> =>
  new Map(venues.map((venue, at) => [venue.key, at]));

function indicesOf(venues: readonly Venue[], siteVenues: readonly Venue[]) {
  return {
    venueIndex: indexByKey(venues),
    siteVenueIndex: indexByKey(siteVenues),
    rentalVenues: new Map(
      venues.flatMap((venue, index) => (hireOf(venue.id) ? [[venue.key, index] as const] : [])),
    ),
    stages: stagesByPreference(venues),
  };
}

// From the same list as the scenery, so a sight is always something the scenery counts.
function viewsOn(
  ground: PlotGround,
  sources: PlotSources,
  scenery: SceneryField,
  venues: readonly Venue[],
): Views {
  const { plan, terrain } = ground;
  const standing = [...sources.placements, ...sources.props];
  return viewsFor({
    tilesX: plan.tilesX,
    tilesZ: plan.tilesZ,
    scenery,
    placements: [...standing, ...sources.paths],
    standing,
    strengthOf: sceneryOf,
    labelOf: (id) => objectTypeById(id).label,
    topOf: objectTypeTop,
    levelOf: (tileX, tileZ) => terrain.levelOf(tileX, tileZ),
    isWater: (tileX, tileZ) => terrain.surfaceOf(tileX, tileZ) === 'water',
    isSea: (tileX, tileZ) => terrain.isSea(tileX, tileZ),
    venues,
  });
}

export function plotFactsOf(ground: PlotGround, sources: PlotSources, held: VenueNames): PlotFacts {
  const network = networkOn(ground, sources);
  const paving = nodeIndexFor(network);
  const places = placesOn(sources.placements, held, network, paving);
  const fields = fieldsOn(ground.plan, sources);
  return {
    network,
    paving,
    ...places,
    ...sandOf(network.beach),
    ...fields,
    views: viewsOn(ground, sources, fields.scenery, places.venues),
    ...indicesOf(places.venues, places.siteVenues),
  };
}
