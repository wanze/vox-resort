import { z } from 'zod';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import type { LandGrid } from '../../land/domain/landRights';
import type { ElevationSpec } from '../../layout/domain/elevation';
import type { Placement } from '../../layout/domain/resortLayout';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import { ROTATIONS } from '../../layout/domain/rotation';
import type { ShoreSpec } from '../../layout/domain/shoreline';
import { MAX_TERRAIN_LEVEL, type Terrain, type TerrainEdit } from '../../layout/domain/terrain';

const KNOWN_IDS: ReadonlySet<string> = new Set(OBJECT_TYPES.map((type) => type.id));

const tile = z.number().int();
const level = z.number().int().min(0).max(MAX_TERRAIN_LEVEL);

// A terrace steps one level from the one before: this is up to the ceiling and back down.
const MOST_TERRACES = 2 * MAX_TERRAIN_LEVEL;

// Every field, not the id and tile: a key cannot always be derived, and a rail sits off its tile.
const placementSchema = z.object({
  key: z.string(),
  id: z.string(),
  tileX: tile,
  tileZ: tile,
  tilesX: tile,
  tilesZ: tile,
  rotation: z.literal(ROTATIONS),
  x: z.number(),
  z: z.number(),
  y: z.number(),
  width: z.number(),
  depth: z.number(),
}) satisfies z.ZodType<Placement>;

const shoreSchema = z.object({
  inset: z.number(),
  beach: z.number(),
  wave: z.number(),
  seed: z.number(),
}) satisfies z.ZodType<ShoreSpec>;

const elevationSchema = z.object({
  terraces: z
    .array(
      z.object({
        level,
        inset: z.number(),
        anchor: z.enum(['water', 'plot']).exactOptional(),
        wave: z.number(),
        surface: z.enum(['grass', 'sand']).exactOptional(),
      }),
    )
    .max(MOST_TERRACES)
    .readonly(),
  seed: z.number(),
}) satisfies z.ZodType<ElevationSpec>;

const landSchema = z.object({
  parcelsX: tile.positive(),
  parcelsZ: tile.positive(),
  owned: z.instanceof(Uint8Array),
}) satisfies z.ZodType<LandGrid>;

const terrainEditSchema = z.object({
  tileX: tile,
  tileZ: tile,
  level,
  surface: z.enum(['grass', 'sand', 'water']),
}) satisfies z.ZodType<TerrainEdit>;

export const savedWorldSchema = z
  .object({
    tilesX: tile.positive(),
    tilesZ: tile.positive(),
    shore: shoreSchema.nullable(),
    elevation: elevationSchema.nullable(),
    terrain: z.array(terrainEditSchema),
    placements: z.array(placementSchema),
    props: z.array(placementSchema),
    paths: z.array(placementSchema),
    rails: z.array(placementSchema),
    // Absent from a save made before land was sold, which owns its whole plot.
    land: landSchema.exactOptional(),
  })
  .superRefine((world, context) => {
    const lists = [world.placements, world.props, world.paths, world.rails];
    const unknown = lists.flat().find((placement) => !KNOWN_IDS.has(placement.id));
    if (unknown) context.addIssue({ code: 'custom', message: `No object is called ${unknown.id}` });
  });

export type SavedWorld = z.infer<typeof savedWorldSchema>;

interface PlacedLists {
  readonly placements: readonly Placement[];
  readonly props: readonly Placement[];
  readonly paths: readonly Placement[];
  readonly rails: readonly Placement[];
}

const copied = (list: readonly Placement[]): Placement[] =>
  list.map((placement) => ({ ...placement }));

// The terrain's edits, not the plan's: the player's digs are written to the terrain alone. The
// same goes for the land, which is bought on the live rights.
export function savedWorldOf(
  plan: ResortPlan,
  terrain: Terrain,
  plot: PlacedLists,
  land: LandGrid | null,
): SavedWorld {
  return {
    tilesX: plan.tilesX,
    tilesZ: plan.tilesZ,
    shore: plan.shore ?? null,
    elevation: plan.elevation ?? null,
    terrain: terrain.edits.map((edit) => ({ ...edit })),
    placements: copied(plot.placements),
    props: copied(plot.props),
    paths: copied(plot.paths),
    rails: copied(plot.rails),
    ...(land ? { land: { ...land, owned: land.owned.slice() } } : {}),
  };
}

// Nothing outside the layout reads a plan's plots, streets or plazas, so they are left empty.
export function planOfWorld(world: SavedWorld): ResortPlan {
  return {
    tilesX: world.tilesX,
    tilesZ: world.tilesZ,
    plots: [],
    nodes: [],
    edges: [],
    plazas: [],
    ...(world.shore ? { shore: world.shore } : {}),
    ...(world.elevation ? { elevation: world.elevation } : {}),
    terrain: world.terrain,
    ...(world.land ? { land: world.land } : {}),
  };
}
