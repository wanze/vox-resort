import { z } from 'zod';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import { PLOT_TILES } from '../../layout/domain/resortGenerator';
import { savedResortName } from '../../naming/domain/resortName';
import { savedWorldSchema, type SavedWorld } from '../../resort-prep/domain/savedWorld';
import { paramsSchema, type GameSnapshot } from '../../saves/domain/snapshot';
import { PHOTO_FOV } from '../../photo/domain/photoView';

// Far past any plot, so a link cannot stand the camera where the far plane loses the resort.
const VIEW_REACH = 1e6;

const coordinate = z.number().min(-VIEW_REACH).max(VIEW_REACH);
const point = z.tuple([coordinate, coordinate, coordinate]);

// A postcard: where the camera stood, and the hour the sky was drawn at.
const postcardViewSchema = z.object({
  position: point,
  target: point,
  fov: z.number().min(PHOTO_FOV.min).max(PHOTO_FOV.max),
  time: z.number().min(0).lt(1),
});

export type PostcardView = z.infer<typeof postcardViewSchema>;

export interface SharedResort {
  readonly world: SavedWorld;
  readonly params: ResortParams;
  readonly name: string;
  readonly names: readonly (readonly [string, string])[];
  readonly view?: PostcardView;
}

export function sharedOf(game: GameSnapshot): SharedResort {
  return {
    world: game.world,
    params: game.params,
    name: savedResortName(game.name, game.params.seed),
    names: game.resort.names,
  };
}

// Capped as the new-game fields are, so a link cannot ask for a plot the game would never grow
// and whose tile grids alone would not fit in memory.
const plotSide = z.number().int().positive().max(PLOT_TILES.max);
const parcels = z.number().int().positive();

export const sharedHeaderSchema = z.object({
  tilesX: plotSide,
  tilesZ: plotSide,
  shore: savedWorldSchema.shape.shore,
  elevation: savedWorldSchema.shape.elevation,
  land: z.object({ parcelsX: parcels, parcelsZ: parcels }).nullable(),
  params: paramsSchema,
  name: z.string(),
  names: z.array(z.tuple([z.string(), z.string()])),
  // Optional, so a link without one is what it always was; a reader from before drops it.
  view: postcardViewSchema.optional(),
});

export type SharedHeader = z.infer<typeof sharedHeaderSchema>;

export interface SharedSummary {
  readonly name: string;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly buildings: number;
}

// Props, paths and rails are not buildings, and would make a small resort sound large.
export function summaryOf(shared: SharedResort): SharedSummary {
  return {
    name: shared.name,
    tilesX: shared.world.tilesX,
    tilesZ: shared.world.tilesZ,
    buildings: shared.world.placements.length,
  };
}
