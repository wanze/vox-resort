import { z } from 'zod';
import { crowdPerBody, crowdSnapshotSchema } from '../../crowd/domain/crowdSnapshot';
import { eventsSnapshotSchema } from '../../events/domain/eventsSnapshot';
import { fitsWorld } from '../../land/domain/landRights';
import { BEACH_PRESETS, HOUSING_STYLES, VARIETIES } from '../../layout/domain/resortConfig';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import { COMPASS_DIRECTIONS } from '../../layout/domain/worldBounds';
import { savedWorldSchema } from '../../resort-prep/domain/savedWorld';
import {
  clockSnapshotSchema,
  resortPerPerson,
  resortPerThought,
  resortSnapshotSchema,
} from '../../sim/domain/resortSnapshot';
import { routerPerPerson, routerSnapshotSchema } from '../../sim/domain/routerSnapshot';
import { staffPool } from '../../sim/domain/staff';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { staffPerWorker, staffRouterSnapshotSchema } from '../../sim/domain/staffRouterSnapshot';
import { THOUGHT_KINDS } from '../../sim/domain/thoughts';

// Bumped by any change to what is saved; an older save is then unreadable, not migrated.
export const SAVE_VERSION = 1;

const count = z.number().int().nonnegative();
const point = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const paramsSchema = z.object({
  tilesX: count,
  tilesZ: count,
  density: z.number(),
  seed: z.number(),
  config: z
    .object({
      parkShare: z.number().exactOptional(),
      housing: z.enum(HOUSING_STYLES).exactOptional(),
      villaShare: z.number().exactOptional(),
      beach: z.enum(BEACH_PRESETS).exactOptional(),
      streetTrees: z.boolean().exactOptional(),
      gatePlazas: z.boolean().exactOptional(),
      variety: z.enum(VARIETIES).exactOptional(),
    })
    .exactOptional(),
  land: z
    .object({
      river: z.boolean().exactOptional(),
      hills: z.boolean().exactOptional(),
      island: z.boolean().exactOptional(),
    })
    .exactOptional(),
}) satisfies z.ZodType<ResortParams>;

const cameraSchema = z.object({
  mode: z.enum(['perspective', 'isometric']),
  isoDirection: z.enum(COMPASS_DIRECTIONS),
  target: point,
  position: point,
  zoom: z.number().positive(),
});

export type CameraSnapshot = z.infer<typeof cameraSchema>;

const gameShape = z.object({
  version: z.literal(SAVE_VERSION),
  world: savedWorldSchema,
  params: paramsSchema,
  // Optional, so a save from before resorts had names still reads; it is named by its seed.
  name: z.string().exactOptional(),
  population: count,
  staffCount: count,
  resort: resortSnapshotSchema,
  router: routerSnapshotSchema,
  staffRouter: staffRouterSnapshotSchema,
  // Beside the routers rather than in the resort, so sim/ needs nothing from events/. A save from
  // before events loads with an empty programme.
  events: eventsSnapshotSchema.exactOptional(),
  crowd: crowdSnapshotSchema,
  staff: crowdSnapshotSchema,
  clock: clockSnapshotSchema,
  camera: cameraSchema,
});

type GameShape = z.infer<typeof gameShape>;

const misfit = (columns: readonly ArrayLike<unknown>[], length: number, what: string) =>
  columns.some((column) => column.length !== length) ? [`${what} not ${length} long`] : [];

// Checked once, here, rather than in each part: only the whole save knows its population.
function misfitsOf(game: GameShape): readonly string[] {
  const { population, staffCount } = game;
  return [
    ...misfit(
      [...resortPerPerson(game.resort), ...routerPerPerson(game.router)],
      population,
      'a guest column',
    ),
    ...misfit(resortPerThought(game.resort), population * THOUGHT_KINDS.length, 'a thought column'),
    ...misfit(crowdPerBody(game.crowd), population, 'a guest body column'),
    ...misfit(game.events ? [game.events.glow] : [], population, 'the event glow'),
    ...misfit(
      [...staffPerWorker(game.staffRouter), ...crowdPerBody(game.staff)],
      staffCount,
      'a staff column',
    ),
    ...(game.resort.guests.count === population ? [] : ['a guest count off the population']),
    // The pool is fixed by the staff caps, and a body is a mesh slot: another size is another game.
    ...(staffCount === staffPool().count ? [] : ['a staff pool of another size']),
    ...(game.resort.zones.length === game.world.tilesX * game.world.tilesZ
      ? []
      : ['a zone grid of another size']),
    ...(!game.world.land || fitsWorld(game.world.land, game.world)
      ? []
      : ['a land grid of another size']),
  ];
}

export const gameSnapshotSchema = gameShape.superRefine((game, context) => {
  for (const message of misfitsOf(game)) context.addIssue({ code: 'custom', message });
});

export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

export const saveMetaSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  resortName: z.string().exactOptional(),
  savedAt: z.number(),
  version: z.number(),
  mode: z.enum(['sandbox', 'tycoon']),
  day: count,
  balance: z.number(),
  stars: z.number(),
  guests: count,
  tilesX: count,
  tilesZ: count,
});

export type SaveMeta = z.infer<typeof saveMetaSchema>;

export function metaOf(
  id: string,
  name: string | null,
  snapshot: GameSnapshot,
  now: number,
): SaveMeta {
  const { ledger, rating, guests } = snapshot.resort;
  return {
    id,
    name,
    ...(snapshot.name === undefined ? {} : { resortName: snapshot.name }),
    savedAt: now,
    version: snapshot.version,
    mode: ledger.mode,
    day: Math.floor(snapshot.clock.ticks / TICKS_PER_DAY),
    balance: ledger.balance,
    stars: rating.stars,
    guests: guests.present.reduce((total, here) => total + here, 0),
    tilesX: snapshot.world.tilesX,
    tilesZ: snapshot.world.tilesZ,
  };
}
