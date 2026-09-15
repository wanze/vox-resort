/**
 * Where a guest arrives to reach a venue, and where the line outside it starts.
 *
 * A door is not in the graph. `walkNetwork.ts` knows what is paved and nothing
 * about what is built on it, and a `door` flag on a node would have to be
 * rebuilt every time anything was placed - so the doors are derived here, out of
 * the doors the art declares, the footprint the venue carries and the tile index
 * the reseat already builds.
 *
 * ## The declared door, and nothing else
 *
 * Where the art says where a building is entered, the door node is a walkable
 * node on the tile **that door faces into**: the first tile outside the
 * footprint, straight out from the door along its facing. Not the footprint,
 * and not the ring on the other three sides. A door used to be only a place to
 * arrive, and any side did; it is now where a line of twelve people starts, and
 * a line that starts behind the bakery is a line nobody reads as one.
 *
 * ## The ring, when there is nothing better
 *
 * Every walkable node on the venue's own tiles or on the ring one tile around
 * it. That is the rule for a venue whose art declares no door, and it is also
 * the rule for a venue whose declared doors all face ground nothing has paved -
 * a bakery turned with its shopfront to a lawn. **That fallback is the safety
 * rail and it must stay**: a queue in the wrong place is a blemish, and a
 * building nobody can ever visit is a resort where half of it silently stopped
 * working with nothing in the HUD to say so.
 *
 * Which of the two came back is part of the answer, because the layout wants to
 * know how often the fallback fires. See {@link VenueDoors.declared}.
 *
 * ## A building on the beach is walked up to over the sand
 *
 * Nothing standing on sand is given paving, by design, so a beach shower has no
 * door node at all. What it has instead is a point on the open sand in front of
 * it - {@link VenueDoors.sand} - by the same two rules: the tile a declared door
 * opens onto, and otherwise the open tiles of the ring. `sandRoute.ts` is what
 * gets a guest from the paving to one.
 */

import type { NodeIndex } from '../../crowd/domain/nearestNode';
import { blockedAt } from '../../crowd/domain/sandGrid';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { doorStepTile } from '../../layout/domain/doorStep';
import { terrainAt } from '../../layout/domain/shoreline';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Venue } from './venues';

export interface VenueDoors {
  /**
   * The nodes a guest can arrive at to reach this venue, sorted ascending and
   * without duplicates.
   *
   * Empty is a real answer rather than an error: a bakery in the middle of a
   * lawn is a venue nobody can walk to, and the caller is the one that decides
   * what to do about it. Plan 021's advice panel wants exactly that signal.
   *
   * Sorted because the order of the sources is what breaks a tie in the field
   * built from them - see `flowField.ts` - and a sweep whose answer depended on
   * the order tiles happened to be visited in would not be the same twice.
   */
  readonly nodes: readonly number[];
  /** Whether these are the doors the art declared, or the fallback ring. */
  readonly declared: boolean;
  /**
   * Where a venue standing on the beach band is walked up to, in world voxels;
   * empty for anything else. A beach venue has no door nodes, so this is its
   * only way in.
   *
   * Always the centre of an open beach tile, so a route over the sand can end
   * on it and a line can start on it.
   */
  readonly sand: readonly { readonly x: number; readonly z: number }[];
}

/**
 * What a door is found from: the footprint and the declared doors, and nothing
 * about what the building is for. A lodging has both, and is walked to by the
 * same rule. See `lodgings.ts`.
 */
type DoorFootprint = Pick<Venue, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ' | 'doors'>;

/** What says whether a tile is open sand: the beach band, and what stands on it. */
type SandGround = Pick<WalkNetwork, 'beach' | 'sand'>;

/**
 * The venue's doors as nodes: the declared ones where they reach paving, the ring
 * where not; and, for a venue on the beach, as points on the sand in front of it.
 *
 * `ground` is only read for the second half. Omit it and nothing is on the beach.
 */
export function doorsFor(
  venue: DoorFootprint,
  index: NodeIndex,
  ground: SandGround | null = null,
): VenueDoors {
  const sand = sandDoorsFor(venue, ground);
  const found = new Set<number>();
  for (const door of venue.doors) {
    // The same tile the layout turned the building to open onto; see
    // `doorStep.ts`, which both of them ask.
    const tile = doorStepTile(venue, door);
    for (const node of index.at(tile.x, tile.z) ?? []) found.add(node);
  }
  if (found.size > 0) return { nodes: sorted(found), declared: true, sand };
  return { nodes: ringNodes(venue, index), declared: false, sand };
}

/**
 * The footprint and the ring one tile out on all four sides, corners included,
 * which is the two loops run one tile wide of the footprint.
 *
 * Deliberately generous. A building sits on its tiles and the path runs beside
 * it, and either can carry the node somebody actually stands on - a hotel
 * entered from a courtyard tile it covers, a bakery entered off the path along
 * its front.
 */
function ringNodes(venue: DoorFootprint, index: NodeIndex): readonly number[] {
  const found = new Set<number>();
  for (let tileX = venue.tileX - 1; tileX <= venue.tileX + venue.tilesX; tileX++) {
    for (let tileZ = venue.tileZ - 1; tileZ <= venue.tileZ + venue.tilesZ; tileZ++) {
      for (const node of index.at(tileX, tileZ) ?? []) found.add(node);
    }
  }
  return sorted(found);
}

const sorted = (nodes: ReadonlySet<number>): readonly number[] =>
  [...nodes].toSorted((a, b) => a - b);

/**
 * The open sand a venue on the beach is walked up to: in front of each declared
 * door, or where none of those is open, every open tile of the ring.
 *
 * "On the beach" is the venue's anchor tile being beach band, which is what the
 * generator stood it on. A venue on a sand terrace behind the band is not: the
 * band is the only sand anybody walks, and a route could not reach it.
 *
 * A tile whose centre something stands on is passed over rather than walked
 * into - a lounger laid right in front of the shower - which is the same
 * generous fallback the ring is for the paving.
 */
function sandDoorsFor(
  venue: DoorFootprint,
  ground: SandGround | null,
): readonly { readonly x: number; readonly z: number }[] {
  const shore = ground?.beach?.shore ?? null;
  if (!ground || terrainAt(shore, venue.tileX, venue.tileZ) !== 'beach') return [];
  const open = (tile: { readonly x: number; readonly z: number }): boolean =>
    terrainAt(shore, tile.x, tile.z) === 'beach' &&
    !(ground.sand && blockedAt(ground.sand, centre(tile.x), centre(tile.z)));

  const declared = uniqueTiles(venue.doors.map((door) => doorStepTile(venue, door))).filter(open);
  const tiles = declared.length > 0 ? declared : ringTiles(venue).filter(open);
  return tiles.map((tile) => ({ x: centre(tile.x), z: centre(tile.z) }));
}

/** The ring one tile out round a footprint, without the footprint itself. */
function ringTiles(venue: DoorFootprint): { readonly x: number; readonly z: number }[] {
  const tiles: { x: number; z: number }[] = [];
  for (let x = venue.tileX - 1; x <= venue.tileX + venue.tilesX; x++) {
    for (let z = venue.tileZ - 1; z <= venue.tileZ + venue.tilesZ; z++) {
      const inside =
        x >= venue.tileX &&
        x < venue.tileX + venue.tilesX &&
        z >= venue.tileZ &&
        z < venue.tileZ + venue.tilesZ;
      if (!inside) tiles.push({ x, z });
    }
  }
  return tiles;
}

/** Each tile once, in the order first named: two doors can open onto one tile. */
function uniqueTiles(
  tiles: readonly { readonly x: number; readonly z: number }[],
): { readonly x: number; readonly z: number }[] {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    const key = `${tile.x},${tile.z}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const centre = (tile: number): number => (tile + 0.5) * TILE_VOXELS;
