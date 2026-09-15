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
 */

import type { NodeIndex } from '../../crowd/domain/nearestNode';
import { doorStepTile } from '../../layout/domain/doorStep';
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
}

/**
 * What a door is found from: the footprint and the declared doors, and nothing
 * about what the building is for. A lodging has both, and is walked to by the
 * same rule. See `lodgings.ts`.
 */
type DoorFootprint = Pick<Venue, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ' | 'doors'>;

/** The venue's doors as nodes: the declared ones where they reach paving, the ring where not. */
export function doorsFor(venue: DoorFootprint, index: NodeIndex): VenueDoors {
  const found = new Set<number>();
  for (const door of venue.doors) {
    // The same tile the layout turned the building to open onto; see
    // `doorStep.ts`, which both of them ask.
    const tile = doorStepTile(venue, door);
    for (const node of index.at(tile.x, tile.z) ?? []) found.add(node);
  }
  if (found.size > 0) return { nodes: sorted(found), declared: true };
  return { nodes: ringNodes(venue, index), declared: false };
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
