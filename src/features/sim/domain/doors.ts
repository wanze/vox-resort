/**
 * Where a guest arrives to reach a venue.
 *
 * A door is not on the art and is not in the graph. `walkNetwork.ts` knows what
 * is paved and nothing about what is built on it, and a `door` flag on a node
 * would have to be rebuilt every time anything was placed - so the doors are
 * derived here instead, out of the footprint the venue already carries and the
 * tile index the reseat already builds.
 *
 * The rule is deliberately generous: every walkable node on the venue's own
 * tiles or on the ring one tile around it. A building sits on its tiles and the
 * path runs beside it, and either can carry the node somebody actually stands
 * on - a hotel entered from a courtyard tile it covers, a bakery entered off
 * the path along its front. Being too generous costs one extra source on a
 * breadth-first sweep; being too strict is a venue nobody can reach.
 */

import type { NodeIndex } from '../../crowd/domain/nearestNode';
import type { Venue } from './venues';

/**
 * The nodes a guest can arrive at to reach this venue, sorted ascending and
 * without duplicates.
 *
 * Empty is a real answer rather than an error: a bakery in the middle of a lawn
 * is a venue nobody can walk to, and the caller is the one that decides what to
 * do about it. Plan 021's advice panel wants exactly that signal.
 *
 * Sorted because the order of the sources is what breaks a tie in the field
 * built from them - see `flowField.ts` - and a sweep whose answer depended on
 * the order tiles happened to be visited in would not be the same twice.
 */
export function doorNodesFor(venue: Venue, index: NodeIndex): readonly number[] {
  const found = new Set<number>();
  // The footprint and the ring one tile out on all four sides, corners
  // included, which is the two loops run one tile wide of the footprint.
  for (let tileX = venue.tileX - 1; tileX <= venue.tileX + venue.tilesX; tileX++) {
    for (let tileZ = venue.tileZ - 1; tileZ <= venue.tileZ + venue.tilesZ; tileZ++) {
      for (const node of index.at(tileX, tileZ) ?? []) found.add(node);
    }
  }
  return [...found].toSorted((a, b) => a - b);
}
