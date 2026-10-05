import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { BeachBand } from '../../crowd/domain/walkNetwork';
import type { TileSpan } from '../../land/domain/landRights';
import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SEA_LEVEL } from '../../rendering/domain/terrainSurface';

// The beach pseudo-venue's capacity is 100 000; it has no door, so the sand sets the room.
const WATCH_PER_TILE = 2;
const WATCH_ROOM_MAX = 360;

const LAUNCH_SITES = 5;
const COLUMNS_PER_SITE = 8;
// Far enough out that a rising shell never seems to leave the sand.
const OFFSHORE_TILES = 8;
const LAUNCH_WIDTH_TILES = 40;

export interface LaunchSite {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function beachRowsAt(shore: Shore, column: number): number {
  const water = waterStartZ(shore, column);
  const from = Math.max(0, water - shore.spec.beach);
  return Math.max(0, Math.min(shore.tilesZ, water) - from);
}

function ownedColumns(shore: Shore, span: TileSpan): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  for (let column = Math.max(0, span.from); column < Math.min(shore.tilesX, span.to); column++) {
    if (beachRowsAt(shore, column) === 0) continue;
    if (from < 0) from = column;
    to = column + 1;
  }
  return from < 0 ? null : { from, to };
}

export function ownedBeachTiles(shore: Shore | null, span: TileSpan): number {
  if (!shore) return 0;
  let tiles = 0;
  for (let column = Math.max(0, span.from); column < Math.min(shore.tilesX, span.to); column++) {
    tiles += beachRowsAt(shore, column);
  }
  return tiles;
}

export function watchRoom(tiles: number): number {
  return Math.min(WATCH_ROOM_MAX, WATCH_PER_TILE * tiles);
}

export interface Sand {
  readonly beachTiles: number;
  readonly launchSites: readonly LaunchSite[];
}

// The walk network's band, so the sand counted is the sand guests can stand on.
export function sandOf(band: BeachBand | null): Sand {
  if (!band) return { beachTiles: 0, launchSites: [] };
  return {
    beachTiles: ownedBeachTiles(band.shore, band.span),
    launchSites: launchSitesFor(band.shore, band.span),
  };
}

// Spread over the middle of the owned beach, so the show is in front of the people watching it.
export function launchSitesFor(shore: Shore | null, span: TileSpan): readonly LaunchSite[] {
  const owned = shore ? ownedColumns(shore, span) : null;
  if (!shore || !owned) return [];
  const width = Math.min(LAUNCH_WIDTH_TILES, owned.to - owned.from);
  const first = owned.from + Math.floor((owned.to - owned.from - width) / 2);
  const count = Math.min(LAUNCH_SITES, Math.max(1, Math.floor(width / COLUMNS_PER_SITE)));
  return Array.from({ length: count }, (_, index) => {
    const column = first + Math.floor(((index + 0.5) * width) / count);
    return {
      x: (column + 0.5) * TILE_VOXELS,
      y: SEA_LEVEL,
      z: (waterEdgeZ(shore, column) + OFFSHORE_TILES) * TILE_VOXELS,
    };
  });
}
