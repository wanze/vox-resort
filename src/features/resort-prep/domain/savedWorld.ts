import { z } from 'zod';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import type { ElevationSpec } from '../../layout/domain/elevation';
import type { Placement } from '../../layout/domain/resortLayout';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import { ROTATIONS } from '../../layout/domain/rotation';
import type { ShoreSpec } from '../../layout/domain/shoreline';
import type { Terrain, TerrainEdit } from '../../layout/domain/terrain';

const KNOWN_IDS: ReadonlySet<string> = new Set(OBJECT_TYPES.map((type) => type.id));

const tile = z.number().int();

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
        level: z.number(),
        inset: z.number(),
        anchor: z.enum(['water', 'plot']).exactOptional(),
        wave: z.number(),
        surface: z.enum(['grass', 'sand']).exactOptional(),
      }),
    )
    .readonly(),
  seed: z.number(),
}) satisfies z.ZodType<ElevationSpec>;

const terrainEditSchema = z.object({
  tileX: tile,
  tileZ: tile,
  level: z.number(),
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

// The terrain's edits, not the plan's: the player's digs are written to the terrain alone.
export function savedWorldOf(plan: ResortPlan, terrain: Terrain, plot: PlacedLists): SavedWorld {
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
  };
}
