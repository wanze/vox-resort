import { TILE_VOXELS, type SignKind } from '../../../../voxel-gen/voxelgen.ts';
import { rankCommands } from '../../hud/domain/commandSearch';

// Strong enough to stand out on sand, grass and water alike; none is green, which sinks into the
// lawns, and blue and yellow stay apart for every common colour blindness.
export const HIGHLIGHT_COLOURS: readonly number[] = [
  0x1f5fff, 0xff7a00, 0xe0218a, 0x00c8d7, 0xffe11a, 0x8a3ffc,
];

export interface HighlightKind {
  readonly family: string;
  readonly label: string;
  readonly sign: SignKind | null;
}

export interface HighlightType extends HighlightKind {
  readonly count: number;
}

// The colour stays with the pick, so dropping one never repaints the others.
export interface HighlightPick {
  readonly family: string;
  readonly colour: number;
}

export interface HighlightPlaced {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

export interface HighlightBox {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly y: number;
  readonly colour: number;
}

export interface HighlightStrip {
  readonly x: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeZ: number;
}

// Wide enough on screen to read as a dot from the furthest zoom, and never so wide that it covers
// the next building over.
const RING_PX = 6;
const MIN_RING_VOXELS = 2;
const MAX_RING_VOXELS = 2 * TILE_VOXELS;

export function highlightTypesOf(
  placements: readonly HighlightPlaced[],
  kindOf: (id: string) => HighlightKind | null,
): HighlightType[] {
  const counted = new Map<string, { kind: HighlightKind; count: number }>();
  for (const placement of placements) {
    const kind = kindOf(placement.id);
    if (!kind) continue;
    const entry = counted.get(kind.family);
    if (entry) entry.count++;
    else counted.set(kind.family, { kind, count: 1 });
  }
  return [...counted.values()]
    .map(({ kind: { family, label, sign }, count }) => ({ family, label, sign, count }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

// The sign is searched too, so "toilets" finds a block the catalogue calls something else.
export function searchTypes(
  types: readonly HighlightType[],
  query: string,
): readonly HighlightType[] {
  const searchable = types.map((type) => ({
    type,
    label: type.label,
    group: '',
    keywords: `${type.family} ${type.sign ?? 'lodging'}`,
  }));
  return rankCommands(searchable, query).map((each) => each.type);
}

export function canPick(picks: readonly HighlightPick[]): boolean {
  return picks.length < HIGHLIGHT_COLOURS.length;
}

export function toggledPick(picks: readonly HighlightPick[], family: string): HighlightPick[] {
  if (picks.some((pick) => pick.family === family)) {
    return picks.filter((pick) => pick.family !== family);
  }
  const free = HIGHLIGHT_COLOURS.findIndex((_, colour) =>
    picks.every((pick) => pick.colour !== colour),
  );
  if (free < 0) return [...picks];
  return [...picks, { family, colour: free }];
}

// A pick whose last building was pulled down, or that a load left behind, has nothing to show.
export function keptPicks(
  picks: readonly HighlightPick[],
  types: readonly HighlightType[],
): readonly HighlightPick[] {
  const kept = picks.filter((pick) => types.some((type) => type.family === pick.family));
  return kept.length === picks.length ? picks : kept;
}

export function highlightBoxesOf(
  placements: readonly HighlightPlaced[],
  picks: readonly HighlightPick[],
  familyOf: (id: string) => string,
  groundOf: (placement: HighlightPlaced) => number,
): HighlightBox[] {
  if (picks.length === 0) return [];
  const colours = new Map(picks.map((pick) => [pick.family, pick.colour]));
  const boxes: HighlightBox[] = [];
  for (const placement of placements) {
    const colour = colours.get(familyOf(placement.id));
    if (colour === undefined) continue;
    const { tileX, tileZ, tilesX, tilesZ } = placement;
    boxes.push({ tileX, tileZ, tilesX, tilesZ, y: groundOf(placement), colour });
  }
  return boxes;
}

// In half voxels, so a camera settling on a zoom does not rewrite the rings every frame.
export function ringWidthAt(tilePx: number): number {
  const wanted = tilePx > 0 ? (RING_PX * TILE_VOXELS) / tilePx : MAX_RING_VOXELS;
  const clamped = Math.min(MAX_RING_VOXELS, Math.max(MIN_RING_VOXELS, wanted));
  return Math.round(clamped * 2) / 2;
}

// Outside the footprint, so the building never stands on its own ring and hides it.
export function ringStripsOf(box: HighlightBox, width: number): readonly HighlightStrip[] {
  const x0 = box.tileX * TILE_VOXELS;
  const z0 = box.tileZ * TILE_VOXELS;
  const x1 = (box.tileX + box.tilesX) * TILE_VOXELS;
  const z1 = (box.tileZ + box.tilesZ) * TILE_VOXELS;
  const across = x1 - x0 + 2 * width;
  const along = z1 - z0;
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;
  return [
    { x: midX, z: z0 - width / 2, sizeX: across, sizeZ: width },
    { x: midX, z: z1 + width / 2, sizeX: across, sizeZ: width },
    { x: x0 - width / 2, z: midZ, sizeX: width, sizeZ: along },
    { x: x1 + width / 2, z: midZ, sizeX: width, sizeZ: along },
  ];
}
