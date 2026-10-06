export type Color = number;

export class VoxelBuilder {
  readonly voxels = new Map<string, Color>();

  set(x: number, y: number, z: number, c: Color): void {
    this.voxels.set(`${x},${y},${z}`, c);
  }

  del(x: number, y: number, z: number): void {
    this.voxels.delete(`${x},${y},${z}`);
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: Color): void {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.set(x, y, z, c);
      }
    }
  }
}

export type ModelCategory =
  | 'grounds'
  | 'lodging'
  | 'amenities'
  | 'leisure'
  | 'people'
  | 'sky'
  | 'sea'
  | 'litter'
  | 'props';

// people, sky, sea, litter and props never show: each lives in its own registry, so no
// OBJECT_TYPES entry carries them and the palette drops the empty shelves.
export const MODEL_CATEGORIES: readonly {
  readonly id: ModelCategory;
  readonly label: string;
}[] = [
  { id: 'grounds', label: 'Grounds' },
  { id: 'lodging', label: 'Lodging' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'leisure', label: 'Leisure' },
  { id: 'people', label: 'People' },
  { id: 'sky', label: 'Sky' },
  { id: 'sea', label: 'Sea' },
  { id: 'litter', label: 'Litter' },
  { id: 'props', label: 'Props' },
];

export interface TileFootprint {
  readonly x: number;
  readonly z: number;
}

// x/z is the column the light hangs in, as a seat's is; y is a height, free to fall between layers.
export interface ModelLight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: Color;
  readonly intensity: number;
  readonly distance: number; // voxels
}

export type PlacementGround = 'beach' | 'shore';

export interface ModelPlacement {
  readonly ground?: PlacementGround;
  readonly perResort?: { readonly min: number; readonly max: number };
}

export type QuarterTurns = 0 | 1 | 2 | 3;

export type SeatPose = 'sit' | 'lie';

// x/z is the column the hips fill and y the first free layer above the seat:
// hips, because a seated or lying figure has its feet on nothing.
export interface ModelSeat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // Where the legs point, the one thing sitting and lying agree on, so a
  // lounger's seat faces the foot end of its mattress.
  readonly facing: QuarterTurns;
  readonly pose?: SeatPose;
  // Staff only: guests are never offered it, and a lifeguard is sent to sit here.
  readonly post?: 'lifeguard';
  // A spectator's seat: the venue's line is drawn here while it waits, never its visitors.
  readonly watches?: true;
}

// Where a visitor is drawn: `watcher` places are for the line, the rest for somebody at work, a
// `staff` place for a cleaner or a mechanic.
// Measured as a seat is, except that a standing spot's y is the layer the feet stand in.
export interface ModelSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: QuarterTurns;
  readonly pose?: SeatPose | 'stand';
  readonly for?: 'visitor' | 'watcher' | 'animator' | 'lifeguard' | 'staff';
  // A player's place in the venue's game, on the half of the court that is theirs.
  readonly game?: GameKind;
  readonly side?: 0 | 1;
  // Into the venue's lanes: the party playing that lane waits here.
  readonly lane?: number;
  // Drawn doing this rather than standing still; a swing hangs from the bar on layer `pivot`, and
  // tag is played over the `yard`'s cells by everybody at a spot sharing it.
  readonly act?: SpotAct;
  readonly pivot?: number;
  readonly yard?: ModelRect;
  // A gym's: run and jump on the spot, lift, or sit up on a mat lying with its legs to `facing`.
  readonly station?: Station;
  // Offered to a child before an adult.
  readonly child?: true;
}

export type SpotAct = 'swing' | 'dig' | 'tag' | 'play' | 'rinse';

export type Station = 'run' | 'jump' | 'lift' | 'mat';

export interface ModelRect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}

// Open floor whose seated visitors get up and dance on it while a show is on, and whose venue's
// standing visitors cheer where they stand; y is the layer the feet stand in.
export interface ModelFloor extends ModelRect {
  readonly y: number;
}

export type GameKind = 'tennis' | 'basketball' | 'volleyball';

// Its length runs along x, so a net is a column of x and the hoops sit at either end.
export interface ModelCourt {
  // The outer lines, as inclusive voxel columns.
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  // The net's column and the layer of its top, which every ball over it clears.
  readonly net?: { readonly x: number; readonly top: number };
  // Each ring's middle, a point between columns, on the ring's own layer.
  readonly hoops?: readonly { readonly x: number; readonly y: number; readonly z: number }[];
}

// x/z is the doorway's middle so a turn cannot push it over a tile boundary.
// facing is the walk-out direction, declared because a corner door is ambiguous.
export type AreaKind = 'swim' | 'wade';

// Water visitors move about in. x/z/w/d are the wet cells, inside the coping.
export interface ModelArea {
  readonly kind: AreaKind;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  // The ellipse inscribed in the rectangle, as poolWater's round basin is.
  readonly round?: true;
  // The water's top face, in model voxels.
  readonly surface: number;
  // How many visitors it holds; each is a place in declaration order.
  readonly places: number;
  readonly for?: 'child';
  // Laps run the long way; left out, swimmers wander.
  readonly laps?: boolean;
}

// `hang` goes hand over hand along a bar overhead, `drop` lets go of it.
export type LoopPose = 'walk' | 'climb' | 'slide' | 'swim' | 'hang' | 'drop';

// A swim point's y is the water's top face, as an area's surface is; a slide point's is the
// hips', as a seat's; any other the layer the feet stand in.
export interface ModelLoopPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // How the rider moves on to the next point; the last one leads back to the first.
  readonly pose: LoopPose;
}

export interface ModelLoop {
  readonly points: readonly ModelLoopPoint[];
  readonly places: number;
  readonly for?: 'child';
}

export interface ModelPoint {
  readonly x: number;
  readonly z: number;
}

// A hole the venue's visitors play in turn, as columns: the ball rolls along `line`, tee first
// and cup last, bent round whatever stands on the felt.
export interface ModelLane {
  readonly line: readonly ModelPoint[];
  // The layer the players' feet stand in.
  readonly y: number;
  // Holed out, the party walks from the cup by these to the tee of lane `next`.
  readonly walk: readonly ModelPoint[];
  readonly next: number;
}

export type PlaceGroup = 'spots' | 'seats' | 'areas' | 'loops';

export interface ModelDoor {
  readonly x: number;
  readonly z: number;
  readonly facing: QuarterTurns;
}

export type GuestNeed = 'hunger' | 'thirst' | 'energy' | 'fun' | 'hygiene' | 'health';

// The wants. Health is a need but not a want: never drawn, never decayed, and left out here so
// the seeded draws and a guest's contentment stay over the five.
export const GUEST_NEEDS: readonly GuestNeed[] = ['hunger', 'thirst', 'energy', 'fun', 'hygiene'];

export type VenueRole = 'lodging' | 'food' | 'drink' | 'activity' | 'service';

export type Shelter = 'open' | 'covered';

export type SignKind =
  | 'food'
  | 'drink'
  | 'fun'
  | 'service'
  | 'restaurant'
  | 'bakery'
  | 'snack'
  | 'icecream'
  | 'shop'
  | 'coffee'
  | 'bar'
  | 'toilets'
  | 'shower'
  | 'cabins'
  | 'first-aid'
  | 'reception'
  | 'club'
  | 'games'
  | 'gym'
  | 'spa'
  | 'kids'
  | 'playground'
  | 'boats'
  | 'golf'
  | 'pool'
  | 'waterpark'
  | 'tennis'
  | 'basketball'
  | 'volleyball'
  | 'stage'
  | 'nightclub';

export type SoundKind =
  | 'cafe'
  | 'restaurant'
  | 'bar'
  | 'snack'
  | 'shop'
  | 'arcade'
  | 'gym'
  | 'spa'
  | 'pool'
  | 'kids'
  | 'tennis'
  | 'ballcourt'
  | 'minigolf'
  | 'boats'
  | 'reception'
  | 'restrooms'
  | 'fountain'
  | 'torch'
  | 'trees';

export interface NeedRelief {
  readonly need: GuestNeed;
  readonly amount: number;
}

export interface ModelVenue {
  readonly role: VenueRole;
  // The sign the app hangs over the door; left out, the role's own sign is shown.
  readonly sign?: SignKind;
  // Suggestions the game draws a venue's name from, in no order; left out, the venue goes by
  // its type until the player names it.
  readonly names?: readonly string[];
  readonly satisfies?: readonly NeedRelief[];
  readonly capacity: number;
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  // Per visit, or per guest-night at a lodging.
  readonly price?: number;
  readonly beds?: number;
  // Optional on purpose: a venue without doors is entered from any walkable
  // tile touching it, so a new model works before it is measured.
  readonly doors?: readonly ModelDoor[];
  // Defaults to 'covered': a venue wrongly left open in a storm carries on,
  // one wrongly shut goes dark.
  readonly shelter?: Shelter;
  // Minutes of the day; closes before opens runs past midnight. Left out, it never shuts.
  readonly hours?: { readonly opens: number; readonly closes: number };
  // Arriving guests check in here before anything else.
  readonly receives?: boolean;
  // The chance, 0 to 1, that a visit sends somebody off holding something to throw away.
  readonly litter?: number;
  // An animator can put a show on here.
  readonly stage?: boolean;
  // Music plays whenever it is open: its visitors dance and cheer with or without an animator.
  readonly dj?: true;
  // Guests swim here, so somebody should be watching.
  readonly bathing?: boolean;
  // Visits between breakdowns, on average; absent, it never breaks.
  readonly reliability?: number;
  // In declaration order, the order visitors fill them in.
  readonly spots?: readonly ModelSpot[];
  readonly areas?: readonly ModelArea[];
  readonly loops?: readonly ModelLoop[];
  readonly lanes?: readonly ModelLane[];
  readonly floor?: ModelFloor;
  // Which kind of place visitors fill first; left out, spots, seats, areas, loops.
  readonly order?: readonly PlaceGroup[];
  // The prop a game here is played with, and the layer it is struck at.
  readonly ball?: { readonly model: string; readonly y: number };
  readonly court?: ModelCourt;
}

// Where the app letters the resort's name: a board facing +z or -z, letters standing in the
// layer in front of `surface`. Blank in the art, since the name is the player's.
export interface ModelNameplate {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly faces: readonly { readonly surface: number; readonly outward: 1 | -1 }[];
  readonly ink: Color;
}

export interface ModelDepot {
  readonly doors: readonly ModelDoor[];
}

export type MosaicSide = 'n' | 'e' | 's' | 'w';

export interface ModelMosaic {
  readonly style: string;
  readonly borders: readonly MosaicSide[];
}

export interface VoxelModelSource {
  readonly id: string;
  readonly label: string;
  readonly category: ModelCategory;
  readonly tiles: TileFootprint;
  readonly groundDecides?: boolean;
  // Not a venue: a gate in the venue list would have guests queueing at it.
  readonly gateway?: boolean;
  // Staff only: shifts start here and cleaners restock here. Not a venue, so no guest goes in.
  readonly depot?: ModelDepot;
  // 0 to 1: how much nicer this makes the tiles around it. The reach is the simulation's,
  // so a model states only how strong it is.
  readonly scenery?: number;
  // What the app plays near it; silent when absent. A variant sounds like its original, so only
  // originals declare it.
  readonly sound?: SoundKind;
  // Derived from the model's size in prices.ts when omitted; declare it only where that is wrong.
  readonly cost?: number;
  // Tiles a guest holding litter will look for this; 0 is not a bin.
  readonly binReach?: number;
  // The sides a mosaic piece borders when laid unturned, north being z = 0: the app picks a piece
  // and its turn by which of its neighbours are another style.
  readonly mosaic?: ModelMosaic;
  readonly emissive?: readonly Color[];
  readonly water?: readonly Color[];
  // Declared rather than inferred from the palette: lanterns and shelters are
  // glass too but have no room behind them.
  readonly windows?: readonly Color[];
  // Painted apart from the model and meshed on their own, so hiding one leaves no hole in what it
  // touches: open while guests are up, furled at bedtime and in the rain.
  readonly canopy?: {
    readonly open: (builder: VoxelBuilder) => void;
    readonly furled: (builder: VoxelBuilder) => void;
  };
  readonly lights?: readonly ModelLight[];
  readonly seats?: readonly ModelSeat[];
  readonly placement?: ModelPlacement;
  readonly venue?: ModelVenue;
  readonly nameplate?: ModelNameplate;
  // One voxel's edge in world voxels, for art painted finer than the world; the mesher grows or
  // shrinks it back, so width, height and depth stay in the model's own voxels.
  readonly scale?: number;
  readonly build: (builder: VoxelBuilder) => void;
}

export interface PaintedVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: Color;
}

export interface ModelCanopy {
  readonly open: readonly PaintedVoxel[];
  readonly furled: readonly PaintedVoxel[];
}

export interface VoxelModel {
  readonly id: string;
  readonly label: string;
  readonly category: ModelCategory;
  readonly tiles: TileFootprint;
  readonly groundDecides: boolean;
  readonly gateway: boolean;
  readonly depot: ModelDepot | null;
  readonly scenery: number;
  readonly sound: SoundKind | null;
  readonly cost: number | null;
  readonly binReach: number;
  readonly mosaic: ModelMosaic | null;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly voxels: readonly PaintedVoxel[];
  readonly emissive: readonly Color[];
  readonly water: readonly Color[];
  readonly windows: readonly Color[];
  readonly canopy: ModelCanopy | null;
  readonly lights: readonly ModelLight[];
  readonly seats: readonly (ModelSeat & { readonly pose: SeatPose })[];
  readonly placement: ModelPlacement;
  readonly venue: ModelVenue | null;
  readonly nameplate: ModelNameplate | null;
  readonly scale?: number;
}

export const TILE_VOXELS = 16;

// The stair model is authored to climb exactly this far across one tile.
export const LEVEL_VOXELS = 8;

// path.ts and boardwalk.ts fill their lowest two layers; stairs.ts starts one
// tread above that, which is what makes a flight meet the paving.
export const PAVING_VOXELS = 2;

// Paving plus a metre, so a span over flush inland water reads as a bridge; a
// full level would make a humpback over a two-tile river.
export const BRIDGE_VOXELS = 6;

export function defineModel(source: VoxelModelSource): VoxelModelSource {
  return source;
}

function seatFrom(
  seat: ModelSeat,
  minX: number,
  minY: number,
  minZ: number,
): ModelSeat & { readonly pose: SeatPose } {
  const placed = {
    x: seat.x - minX,
    y: seat.y - minY,
    z: seat.z - minZ,
    facing: seat.facing,
    pose: seat.pose ?? 'sit',
  };
  return {
    ...placed,
    ...(seat.post ? { post: seat.post } : {}),
    ...(seat.watches ? { watches: seat.watches } : {}),
  };
}

// Moved with the voxels as the seats are, or a model painted off the origin draws its visitors
// off its floor.
function venueFrom(venue: ModelVenue, minX: number, minY: number, minZ: number): ModelVenue {
  const moved = <T extends { readonly x: number; readonly z: number }>(at: T): T => ({
    ...at,
    x: at.x - minX,
    z: at.z - minZ,
  });
  return {
    ...venue,
    ...(venue.spots
      ? {
          spots: venue.spots.map((spot) => ({
            ...moved(spot),
            y: spot.y - minY,
            ...(spot.pivot === undefined ? {} : { pivot: spot.pivot - minY }),
            ...(spot.yard ? { yard: moved(spot.yard) } : {}),
          })),
        }
      : {}),
    ...(venue.areas
      ? { areas: venue.areas.map((area) => ({ ...moved(area), surface: area.surface - minY })) }
      : {}),
    ...(venue.loops
      ? {
          loops: venue.loops.map((loop) => ({
            ...loop,
            points: loop.points.map((point) => ({ ...moved(point), y: point.y - minY })),
          })),
        }
      : {}),
    ...(venue.lanes
      ? {
          lanes: venue.lanes.map((lane) => ({
            ...lane,
            y: lane.y - minY,
            line: lane.line.map(moved),
            walk: lane.walk.map(moved),
          })),
        }
      : {}),
    ...(venue.floor ? { floor: { ...moved(venue.floor), y: venue.floor.y - minY } } : {}),
    ...(venue.ball ? { ball: { ...venue.ball, y: venue.ball.y - minY } } : {}),
    ...(venue.court ? { court: courtFrom(venue.court, minX, minY, minZ) } : {}),
  };
}

function courtFrom(court: ModelCourt, minX: number, minY: number, minZ: number): ModelCourt {
  return {
    x0: court.x0 - minX,
    x1: court.x1 - minX,
    z0: court.z0 - minZ,
    z1: court.z1 - minZ,
    ...(court.net ? { net: { x: court.net.x - minX, top: court.net.top - minY } } : {}),
    ...(court.hoops
      ? {
          hoops: court.hoops.map((hoop) => ({
            x: hoop.x - minX,
            y: hoop.y - minY,
            z: hoop.z - minZ,
          })),
        }
      : {}),
  };
}

function nameplateFrom(
  plate: ModelNameplate | undefined,
  minX: number,
  minY: number,
  minZ: number,
): ModelNameplate | null {
  if (!plate) return null;
  return {
    x0: plate.x0 - minX,
    x1: plate.x1 - minX,
    y0: plate.y0 - minY,
    y1: plate.y1 - minY,
    faces: plate.faces.map((face) => ({ ...face, surface: face.surface - minZ })),
    ink: plate.ink,
  };
}

function defaultsOf(source: VoxelModelSource) {
  return {
    groundDecides: source.groundDecides ?? false,
    gateway: source.gateway ?? false,
    depot: source.depot ?? null,
    scenery: source.scenery ?? 0,
    sound: source.sound ?? null,
    cost: source.cost ?? null,
    binReach: source.binReach ?? 0,
    mosaic: source.mosaic ?? null,
  };
}

const paintedBy = (build: (builder: VoxelBuilder) => void): PaintedVoxel[] => {
  const builder = new VoxelBuilder();
  build(builder);
  return [...builder.voxels].map(([key, color]) => {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    return { x, y, z, color };
  });
};

export function buildModel(source: VoxelModelSource): VoxelModel {
  const painted = paintedBy(source.build);
  if (painted.length === 0) throw new Error(`Model "${source.id}" painted no voxels`);
  const open = source.canopy ? paintedBy(source.canopy.open) : [];
  const furled = source.canopy ? paintedBy(source.canopy.furled) : [];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const { x, y, z } of [...painted, ...open, ...furled]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const shifted = (voxels: readonly PaintedVoxel[]): PaintedVoxel[] =>
    voxels
      .map((voxel) => ({
        x: voxel.x - minX,
        y: voxel.y - minY,
        z: voxel.z - minZ,
        color: voxel.color,
      }))
      .toSorted((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const voxels = shifted(painted);

  return withScale(source, {
    id: source.id,
    label: source.label,
    category: source.category,
    tiles: source.tiles,
    ...defaultsOf(source),
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    depth: maxZ - minZ + 1,
    voxels,
    emissive: [...new Set(source.emissive ?? [])],
    water: [...new Set(source.water ?? [])],
    windows: [...new Set(source.windows ?? [])],
    canopy: source.canopy ? { open: shifted(open), furled: shifted(furled) } : null,
    lights: (source.lights ?? []).map((light) => ({
      x: light.x - minX,
      y: light.y - minY,
      z: light.z - minZ,
      color: light.color,
      intensity: light.intensity,
      distance: light.distance,
    })),
    seats: (source.seats ?? []).map((seat) => seatFrom(seat, minX, minY, minZ)),
    placement: source.placement ?? {},
    venue: source.venue ? venueFrom(source.venue, minX, minY, minZ) : null,
    nameplate: nameplateFrom(source.nameplate, minX, minY, minZ),
  });
}

const withScale = (source: VoxelModelSource, model: VoxelModel): VoxelModel =>
  source.scale === undefined ? model : { ...model, scale: source.scale };

// As it stands by day; the furled canopy is only ever drawn in its place.
export const dayVoxelsOf = (
  model: Pick<VoxelModel, 'voxels'> & { readonly canopy?: ModelCanopy | null },
): readonly PaintedVoxel[] =>
  model.canopy ? [...model.voxels, ...model.canopy.open] : model.voxels;

export const allVoxelsOf = (model: VoxelModel): readonly PaintedVoxel[] =>
  model.canopy ? [...model.voxels, ...model.canopy.open, ...model.canopy.furled] : model.voxels;
