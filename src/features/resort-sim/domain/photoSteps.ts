import { ON_SAND, type Pause } from '../../crowd/domain/crowd';
import { framingOf } from '../../photo/domain/framing';
import { isBroken } from '../../sim/domain/breakdowns';
import { countPhoto } from '../../sim/domain/dayReport';
import { remember } from '../../sim/domain/happiness';
import { LITTER_WEIGHT, litterAt } from '../../sim/domain/litter';
import {
  PHOTO_FROM,
  PHOTO_SECONDS,
  mayPhoto,
  notePhoto,
  photoChance,
  photoDraw,
  photoMemory,
} from '../../sim/domain/photos';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { stayCount } from '../../sim/domain/thoughts';
import {
  type Moment,
  type PhotoSubject,
  headingFor,
  momentAt,
  scenicAt,
  subjectAt,
  tilesFrom,
} from '../../sim/domain/views';
import { runningShowOf } from './eventSteps';
import type { SimNow } from './simNow';
import type { SimState } from './simState';
import { hear, sandTileOf } from './visits';

// Before the first frame sets it: nothing is worth a photo yet.
export const NO_MOMENT: Moment = { wet: false, daylight: false, golden: 0, fireworks: false };

// A broken slide two tiles away spoils the picture; one across the square does not.
const BROKEN_REACH = 2;

const BROKEN_NEAR = 0.3;

const MINUTES_PER_DAY = 1440;

export function refreshMoment(resort: SimState, clock: SimNow): void {
  resort.moment = momentAt(clock.tickOfDay, clock.weather, runningShowOf(resort) !== null);
}

// Scans the venues, so only asked once a draw has already passed the scenic chance.
function spoiltAt(resort: SimState, tileX: number, tileZ: number): number {
  const spoilt = LITTER_WEIGHT * litterAt(resort.litter, tileX, tileZ);
  const { venues, breakdowns } = resort;
  for (let venue = 0; venue < venues.length; venue++) {
    const near = tilesFrom(venues[venue]!, tileX, tileZ) <= BROKEN_REACH;
    if (near && isBroken(breakdowns, venue)) return spoilt + BROKEN_NEAR;
  }
  return spoilt;
}

interface Standpoint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// On the sand there is no node, so the body says where they stand.
function standpointOf(resort: SimState, person: number, node: number): Standpoint | undefined {
  const { crowd } = resort.crowd;
  if (node !== ON_SAND) return crowd.network.nodes[node];
  const tile = sandTileOf(resort, person);
  if (tile < 0) return undefined;
  const { tilesX } = resort.litter;
  const { x, y, z } = crowd;
  const at = { x: x[person]!, y: y[person]!, z: z[person]! };
  return { tileX: tile % tilesX, tileZ: Math.floor(tile / tilesX), ...at };
}

// A beach walker is on a visit, so not free; resting there, they are not walking.
const mayStop = (resort: SimState, person: number, node: number): boolean =>
  node === ON_SAND ? resort.router.walksTheSand(person) : resort.router.isFree(person);

// Asked by the crowd at every node every guest reaches, so the cheapest checks go first and a
// miss on the paving allocates nothing. Draws only from a hash, never a stream.
export function photoPause(
  resort: SimState,
  person: number,
  node: number,
  tick: number,
): Pause | null {
  const { views, moment, guests } = resort;
  const at = standpointOf(resort, person, node);
  if (!at || at.tileX < 0 || at.tileX >= views.tilesX || at.tileZ >= views.tilesZ) return null;
  const tile = at.tileZ * views.tilesX + at.tileX;
  const showing = (venue: number) => resort.eventShowing[venue] === 1;
  const scenic = scenicAt(views, tile, moment, showing);
  if (scenic < PHOTO_FROM || !mayPhoto(resort.photos, person, tick)) return null;
  if (guests.present[person] !== 1 || guests.child[person] === 1) return null;
  if (!mayStop(resort, person, node)) return null;
  const draw = photoDraw(person, node, tick);
  if (draw >= photoChance(scenic)) return null;
  if (draw >= photoChance(scenic - spoiltAt(resort, at.tileX, at.tileZ))) return null;
  const subject = subjectAt(views, tile, moment, showing, resort.venues);
  const framing = framingOf(person, node, tick, subject.kind);
  // The guest turns with the frame, so they face what the wall's picture shows.
  const heading =
    headingFor(views, subject, tile, at.x, at.z, resort.crowd.crowd.heading[person]!) +
    framing.headingJitter;
  takePhoto(resort, person, node, tick, subject);
  resort.today = countPhoto(resort.today, {
    key: subject.key,
    subject: subject.label,
    kind: subject.kind,
    x: at.x,
    y: at.y,
    z: at.z,
    heading,
    fov: framing.fov,
    tilt: framing.tilt,
    minute: Math.floor(((tick % TICKS_PER_DAY) / TICKS_PER_DAY) * MINUTES_PER_DAY),
  });
  return { seconds: PHOTO_SECONDS, heading };
}

function takePhoto(
  resort: SimState,
  person: number,
  node: number,
  tick: number,
  subject: PhotoSubject,
): void {
  const { thoughts } = resort;
  const before = stayCount(thoughts, person, 'photo') + stayCount(thoughts, person, 'sunset');
  notePhoto(resort.photos, person, node, tick);
  remember(resort.happiness, person, photoMemory(before));
  if (subject.kind === 'sunset') hear(resort, tick, person, 'sunset', null);
  else hear(resort, tick, person, 'photo', subject.label);
}
