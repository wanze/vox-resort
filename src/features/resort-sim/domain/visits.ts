import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { priceOf } from '../../catalog/domain/prices';
import { ON_SAND } from '../../crowd/domain/crowd';
import { type EventRun, runOfVisit, visitLitter } from '../../events/domain/eventRuns';
import { heldAt } from '../../events/domain/sites';
import { fullNameOf } from '../../guests/domain/guests';
import { isBeach } from '../../layout/domain/shoreline';
import { isBeach as isTheBeach } from '../../sim/domain/beach';
import { burnTheSunbathers, hurt, mishap } from '../../sim/domain/incidents';
import { record } from '../../sim/domain/ledger';
import {
  BEACH_LITTER,
  LITTER_WEIGHT,
  dropAt,
  litterAt,
  pickUp,
  stepWith,
} from '../../sim/domain/litter';
import { mix } from '../../random/domain/hash';
import { type Review, reviewFor } from '../../sim/domain/reviews';
import { sceneryAt } from '../../sim/domain/scenery';
import { earn } from '../../sim/domain/takings';
import {
  type ThoughtKind,
  surroundingsThought,
  tallyInto,
  think,
  visitThought,
} from '../../sim/domain/thoughts';
import { cleanliness } from '../../sim/domain/upkeep';
import type { Venue } from '../../sim/domain/venues';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import type { SimState } from './simState';

// Off the graph, a guest is on the sand, where only the litter counts: scenery there is not
// fielded, so an unlittered beach reads as it always has.
export function surroundingsOf(resort: SimState, person: number): number {
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
export function sandTileOf(resort: SimState, person: number): number {
  const { x, z } = resort.crowd.crowd;
  const tileX = Math.floor(x[person]! / TILE_VOXELS);
  const tileZ = Math.floor(z[person]! / TILE_VOXELS);
  return isBeach(resort.shore, tileX, tileZ) ? tileZ * resort.litter.tilesX + tileX : -1;
}

function mindedAt(resort: SimState, tileX: number, tileZ: number, scenery: number): number {
  const around = scenery - LITTER_WEIGHT * litterAt(resort.litter, tileX, tileZ);
  return Math.min(1, Math.max(-1, around));
}

export function hear(
  resort: SimState,
  tick: number,
  person: number,
  kind: ThoughtKind,
  subject: string | null,
): void {
  if (think(resort.thoughts, person, kind, subject, tick)) {
    tallyInto(resort.thoughtDay, kind, subject);
  }
}

// A key the list lacks is the router's synthetic beach, which reads as spotless at -1.
export const venueIndexOf = (resort: SimState, key: string): number =>
  resort.venueIndex.get(key) ?? -1;

// After the visit wore it, so the last guest out of a dirty bar is the one who notices.
function judgeVisit(resort: SimState, tick: number, person: number, venue: Venue): void {
  const clean = cleanliness(resort.upkeep, venueIndexOf(resort, venue.key));
  const thought = visitThought(venue.role, clean);
  if (thought) hear(resort, tick, person, thought, venue.label);
}

// A mishap in water somebody is watching is ten times rarer; the beach is watched from a tower.
function riskTheWater(resort: SimState, tick: number, person: number, venue: Venue): void {
  if (venue.bathing !== true) return;
  const index = venueIndexOf(resort, venue.key);
  const { staffRouter } = resort;
  const watched = index >= 0 ? staffRouter.watching(index) : staffRouter.watchingBeach;
  if (!mishap(person, tick, watched)) return;
  hurt(resort.needs, person);
  hear(resort, tick, person, 'hurt', venue.label);
}

export function burnOnTheBeach(resort: SimState, clock: SimNow): void {
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

export function hearSurroundings(resort: SimState, tick: number): void {
  for (let person = 0; person < resort.guests.count; person++) {
    const thought = lookAround(resort, person);
    if (thought) hear(resort, tick, person, thought, null);
  }
}

// Asleep guests are skipped: a bed is not a view.
function lookAround(resort: SimState, person: number): ThoughtKind | null {
  if (resort.guests.present[person] !== 1 || resort.router.isAsleep(person)) return null;
  return surroundingsThought(surroundingsOf(resort, person));
}

// Only members still here and still of this party: a body is reused by later parties.
export function reviewOfParty(resort: SimState, party: number): Review | null {
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

// Runs on every node and every sand leg every guest reaches, so it allocates nothing. At the
// end of a leg the body stands on the waypoint, which is the tile a wrapper falls on.
export function stepLitterAt(resort: SimState, person: number, at: number): void {
  const tile = tileReachedAt(resort, person, at);
  if (tile < 0) return;
  const { litter } = resort;
  const tileX = tile % litter.tilesX;
  const tileZ = Math.floor(tile / litter.tilesX);
  stepWith(litter, resort.carrying, resort.binCover, person, tileX, tileZ);
}

function tileReachedAt(resort: SimState, person: number, at: number): number {
  if (at === ON_SAND) return sandTileOf(resort, person);
  const node = resort.crowd.crowd.network.nodes[at];
  return node ? node.tileZ * resort.litter.tilesX + node.tileX : -1;
}

// A hash with its own multiplier, so it is not the wrapper's draw for the same visit, and never
// the router's stream, whose draws would move every seeded scene after it.
function leaveOnTheBeach(resort: SimState, person: number, tick: number): void {
  if ((mix(person * 40_503 + tick) % 1024) / 1024 >= BEACH_LITTER) return;
  const tile = sandTileOf(resort, person);
  if (tile < 0) return;
  const { litter } = resort;
  dropAt(litter, resort.binCover, tile % litter.tilesX, Math.floor(tile / litter.tilesX));
}

export const runVenueOf = (resort: SimState, run: EventRun): number =>
  heldAt(run.occurrence.site, run.occurrence.kind, resort.siteVenues);

// The event a visit was made to: the party was invited to it there, or the person watched it.
const eventVisitOf = (resort: SimState, person: number, venue: Venue): EventRun | null =>
  runOfVisit(
    resort.events,
    resort.guests.party[person]!,
    person,
    resort.siteVenueIndex.get(venue.key) ?? -1,
    (run) => runVenueOf(resort, run),
  );

// A hash, not the router's stream: a draw from it would move every seeded scene after it.
export function visitMade(resort: SimState, person: number, venue: Venue, tick: number): void {
  const show = eventVisitOf(resort, person, venue);
  const draw = (mix(person * 2_654_435_761 + tick) % 1024) / 1024;
  pickUp(resort.carrying, person, visitLitter(show, venue.litter ?? 0), draw);
  if (isTheBeach(venue)) leaveOnTheBeach(resort, person, tick);
  judgeVisit(resort, tick, person, venue);
  riskTheWater(resort, tick, person, venue);
  // An event is free to see.
  if (!show) payForVisit(resort, venue);
}

function payForVisit(resort: SimState, venue: Venue): void {
  const earned = priceOf(venue.id);
  resort.ledger = record(resort.ledger, 'visit', earned);
  earn(resort.takings, venue.key, earned);
}
