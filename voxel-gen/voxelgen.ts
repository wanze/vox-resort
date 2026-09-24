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
  | 'litter';

// people, sky, sea and litter never show: each lives in its own registry, so no
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
];

export interface TileFootprint {
  readonly x: number;
  readonly z: number;
}

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
}

// x/z is the doorway's middle so a turn cannot push it over a tile boundary.
// facing is the walk-out direction, declared because a corner door is ambiguous.
export interface ModelDoor {
  readonly x: number;
  readonly z: number;
  readonly facing: QuarterTurns;
}

export type GuestNeed = 'hunger' | 'thirst' | 'energy' | 'fun' | 'hygiene';

export type VenueRole = 'lodging' | 'food' | 'drink' | 'activity' | 'service';

export type Shelter = 'open' | 'covered';

export interface NeedRelief {
  readonly need: GuestNeed;
  readonly amount: number;
}

export interface ModelVenue {
  readonly role: VenueRole;
  readonly satisfies?: readonly NeedRelief[];
  readonly capacity: number;
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  readonly beds?: number;
  // Optional on purpose: a venue without doors is entered from any walkable
  // tile touching it, so a new model works before it is measured.
  readonly doors?: readonly ModelDoor[];
  // Defaults to 'covered': a venue wrongly left open in a storm carries on,
  // one wrongly shut goes dark.
  readonly shelter?: Shelter;
  // Arriving guests check in here before anything else.
  readonly receives?: boolean;
  // The chance, 0 to 1, that a visit sends somebody off holding something to throw away.
  readonly litter?: number;
}

export interface VoxelModelSource {
  readonly id: string;
  readonly label: string;
  readonly category: ModelCategory;
  readonly tiles: TileFootprint;
  readonly groundDecides?: boolean;
  // Not a venue: a gate in the venue list would have guests queueing at it.
  readonly gateway?: boolean;
  // 0 to 1: how much nicer this makes the tiles around it. The reach is the simulation's,
  // so a model states only how strong it is.
  readonly scenery?: number;
  // Tiles a guest holding litter will look for this; 0 is not a bin.
  readonly binReach?: number;
  readonly emissive?: readonly Color[];
  readonly water?: readonly Color[];
  // Declared rather than inferred from the palette: lanterns and shelters are
  // glass too but have no room behind them.
  readonly windows?: readonly Color[];
  readonly lights?: readonly ModelLight[];
  readonly seats?: readonly ModelSeat[];
  readonly placement?: ModelPlacement;
  readonly venue?: ModelVenue;
  readonly build: (builder: VoxelBuilder) => void;
}

export interface PaintedVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: Color;
}

export interface VoxelModel {
  readonly id: string;
  readonly label: string;
  readonly category: ModelCategory;
  readonly tiles: TileFootprint;
  readonly groundDecides: boolean;
  readonly gateway: boolean;
  readonly scenery: number;
  readonly binReach: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly voxels: readonly PaintedVoxel[];
  readonly emissive: readonly Color[];
  readonly water: readonly Color[];
  readonly windows: readonly Color[];
  readonly lights: readonly ModelLight[];
  readonly seats: readonly (ModelSeat & { readonly pose: SeatPose })[];
  readonly placement: ModelPlacement;
  readonly venue: ModelVenue | null;
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

export function buildModel(source: VoxelModelSource): VoxelModel {
  const builder = new VoxelBuilder();
  source.build(builder);
  if (builder.voxels.size === 0) throw new Error(`Model "${source.id}" painted no voxels`);

  const painted: PaintedVoxel[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [key, color] of builder.voxels) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    painted.push({ x, y, z, color });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const voxels = painted
    .map((voxel) => ({
      x: voxel.x - minX,
      y: voxel.y - minY,
      z: voxel.z - minZ,
      color: voxel.color,
    }))
    .toSorted((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

  return {
    id: source.id,
    label: source.label,
    category: source.category,
    tiles: source.tiles,
    groundDecides: source.groundDecides ?? false,
    gateway: source.gateway ?? false,
    scenery: source.scenery ?? 0,
    binReach: source.binReach ?? 0,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    depth: maxZ - minZ + 1,
    voxels,
    emissive: [...new Set(source.emissive ?? [])],
    water: [...new Set(source.water ?? [])],
    windows: [...new Set(source.windows ?? [])],
    lights: (source.lights ?? []).map((light) => ({
      x: light.x - minX,
      y: light.y - minY,
      z: light.z - minZ,
      color: light.color,
      intensity: light.intensity,
      distance: light.distance,
    })),
    seats: (source.seats ?? []).map((seat) => ({
      x: seat.x - minX,
      y: seat.y - minY,
      z: seat.z - minZ,
      facing: seat.facing,
      pose: seat.pose ?? 'sit',
    })),
    placement: source.placement ?? {},
    venue: source.venue ?? null,
  };
}
