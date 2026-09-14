/**
 * The two kinds of district the generator lays out by design rather than by
 * drawing: a block of houses, and a park.
 *
 * Both are pure geometry over a district rectangle — the tiles between four
 * streets — and both are laid out **symmetrically**, which is the whole reason
 * they are not left to the row fill in `resortGenerator.ts`. A street of houses
 * reads as a street because the houses are the same distance apart and the same
 * distance back from the road; a park reads as a park because its paths meet at
 * its middle. A seeded scatter gets neither.
 *
 * Nothing here knows what a house or a tree *is*: a block is laid out for a
 * footprint, and a park hands back tiles. The generator decides what stands on
 * them, and checks each one against what is already there.
 */

import type { Rotation } from './rotation';
import { tileKey, type Tile } from './resortLayout';
import {
  blobTiles,
  mirrorRun,
  NO_WOBBLE,
  plantGrid,
  rectTiles,
  runTiles,
  tableSpots,
  type ParkRun,
  type ParkTree,
  type TableSpot,
  type TileRect,
  type Wobble,
} from './parkShapes';

export type { TileRect } from './parkShapes';

/**
 * What a lot of a block is for: one of the block's houses, the grander house
 * mixed in among them (a villa among houses), or the shop at the end of its
 * street.
 */
export type LotRole = 'house' | 'accent' | 'shop';

/**
 * One lot of a block: the slot an object stands in, anchored at its north-west
 * tile and facing the street its row fronts. An accent's lot is as wide and as
 * deep as the larger of the two footprints; see {@link lotAnchor}.
 */
export interface BlockLot {
  readonly tileX: number;
  readonly tileZ: number;
  readonly rotation: Rotation;
  readonly role: LotRole;
  readonly width: number;
  readonly depth: number;
}

export interface HousingBlock {
  readonly lots: readonly BlockLot[];
  /** The row each lane between two back-to-back pairs of rows runs along. */
  readonly lanes: readonly number[];
}

/** A footprint in tiles, unturned. */
interface Footprint {
  readonly x: number;
  readonly z: number;
}

/** What else a block mixes in among its houses. */
export interface BlockOptions {
  /** A grander house, and the share of the lots it takes, spread symmetrically. */
  readonly accent?: { readonly footprint: Footprint; readonly share: number };
  /** Whether the ends of the block's streets are kept for a shop. */
  readonly shops?: boolean;
}

/**
 * Rows of grass kept between a block and the street around it: a front garden,
 * and the tile each house's short path to the street is laid across.
 */
const FRONT_GARDEN = 1;

/** Columns of grass between two houses in a row. */
const HOUSE_GAP = 1;

/**
 * Rows between the backs of one pair of rows and the fronts of the next: a
 * garden row, the lane, and another garden row.
 */
const LANE_ROWS = 3;

/**
 * The fewest lots a row needs before its ends are given to shops: a block of
 * two houses with a shop at each end is a parade of shops.
 */
const SHOPS_FROM = 3;

/** How many of a row's places a density keeps: an odd count, so it centres. */
function keptOf(places: number, density: number): number {
  if (places <= 0) return 0;
  const wanted = Math.max(1, Math.round(places * density));
  // The same parity as the row, so the gap either side of the kept run is even.
  if ((places - wanted) % 2 === 0) return wanted;
  return wanted > 1 ? wanted - 1 : wanted + 1;
}

/**
 * Which of a row's places are accents: the two ends, and every so many places
 * in from each end after them, so the pattern is its own mirror image. A row of
 * two has its western end, so it is a house and a villa rather than two villas;
 * a row of one has none.
 */
function accentPattern(count: number, share: number): boolean[] {
  const stride = Math.max(2, Math.round(1 / share));
  return Array.from({ length: count }, (_, index) => {
    if (share <= 0 || count < 2) return false;
    if (count === 2) return index === 0;
    return Math.min(index, count - 1 - index) % stride === 0;
  });
}

/**
 * Lays a district out as a block of houses, or null when not even one fits.
 *
 * Rows of houses stand back to back in pairs — the northern row facing the
 * street or lane to its north, the southern row facing south — with a lane
 * between one pair and the next, so every house fronts a street. Rows and
 * columns are centred in the district, and a density below one takes houses
 * off both ends of every row alike, so a thinner block is still symmetric.
 *
 * An accent takes the same places in every row, so the villas of a block stand
 * one behind the other at its corners; when the district is too narrow for them
 * the block is laid out without. The shops take the ends of the streets: the
 * western end of the row north of each lane and the eastern end of the row
 * south of it, or of the block's first and last rows where it has no lane.
 */
export function housingBlock(
  rect: TileRect,
  footprint: Footprint,
  density: number,
  options: BlockOptions = {},
): HousingBlock | null {
  const accented = options.accent ? layBlock(rect, footprint, density, options) : null;
  return accented ?? layBlock(rect, footprint, density, { shops: options.shops ?? false });
}

function layBlock(
  rect: TileRect,
  footprint: Footprint,
  density: number,
  options: BlockOptions,
): HousingBlock | null {
  const columns = blockColumns(rect, footprint, density, options);
  if (!columns) return null;
  const rowDepth = Math.max(...columns.map((column) => column.depth));
  const { rows, lanes } = blockRows(rect, rowDepth);
  if (rows.length === 0) return null;
  const shops =
    options.shops && columns.length >= SHOPS_FROM ? shopLots(rows.length, lanes.length) : [];
  const last = columns.length - 1;
  const isShop = (row: number, column: number): boolean =>
    shops.some((shop) => shop.row === row && column === (shop.east ? last : 0));
  const lots = rows.flatMap((row, rowIndex) =>
    columns.map((column, columnIndex) => ({
      tileX: column.x,
      tileZ: row.z,
      rotation: row.rotation,
      role: isShop(rowIndex, columnIndex) ? ('shop' as const) : column.role,
      width: column.width,
      depth: rowDepth,
    })),
  );
  return { lots, lanes };
}

/** The columns of a block's rows, centred: where each starts, how wide it is, and what it is for. */
function blockColumns(
  rect: TileRect,
  footprint: Footprint,
  density: number,
  options: BlockOptions,
): { x: number; width: number; depth: number; role: LotRole }[] | null {
  const width = rect.x1 - rect.x0 + 1 - 2 * FRONT_GARDEN;
  const { accent } = options;
  const slots = (count: number) =>
    accentPattern(count, accent?.share ?? 0).map((isAccent) =>
      isAccent && accent
        ? {
            width: Math.max(footprint.x, accent.footprint.x),
            depth: Math.max(footprint.z, accent.footprint.z),
            role: 'accent' as const,
          }
        : { width: footprint.x, depth: footprint.z, role: 'house' as const },
    );
  const span = (row: readonly { width: number }[]) =>
    row.reduce((sum, slot) => sum + slot.width + HOUSE_GAP, -HOUSE_GAP);
  let places = 0;
  while (span(slots(places + 1)) <= width) places++;
  const row = slots(keptOf(places, density));
  if (places === 0 || (accent && !row.some((slot) => slot.role === 'accent'))) return null;

  let x = rect.x0 + FRONT_GARDEN + Math.floor((width - span(row)) / 2);
  return row.map((slot) => {
    const column = { x, width: slot.width, depth: slot.depth, role: slot.role };
    x += slot.width + HOUSE_GAP;
    return column;
  });
}

/** The rows of a block, centred, and the lanes between its pairs of rows. */
function blockRows(
  rect: TileRect,
  rowDepth: number,
): { rows: { z: number; rotation: Rotation }[]; lanes: number[] } {
  const depth = rect.z1 - rect.z0 + 1 - 2 * FRONT_GARDEN;
  if (depth < rowDepth) return { rows: [], lanes: [] };
  const pairDepth = 2 * rowDepth;
  const pairs = Math.floor((depth + LANE_ROWS) / (pairDepth + LANE_ROWS));
  if (pairs === 0) {
    // Too shallow for two rows: one, centred, facing south.
    const z = rect.z0 + FRONT_GARDEN + Math.floor((depth - rowDepth) / 2);
    return { rows: [{ z, rotation: 0 }], lanes: [] };
  }
  const rows: { z: number; rotation: Rotation }[] = [];
  const lanes: number[] = [];
  const used = pairs * pairDepth + (pairs - 1) * LANE_ROWS;
  const top = rect.z0 + FRONT_GARDEN + Math.floor((depth - used) / 2);
  for (let pair = 0; pair < pairs; pair++) {
    const z = top + pair * (pairDepth + LANE_ROWS);
    rows.push({ z, rotation: 2 }, { z: z + rowDepth, rotation: 0 });
    if (pair < pairs - 1) lanes.push(z + pairDepth + Math.floor(LANE_ROWS / 2));
  }
  return { rows, lanes };
}

/** Which row keeps a shop, and at which end of it. */
function shopLots(rows: number, lanes: number): { row: number; east: boolean }[] {
  if (lanes === 0) {
    return rows === 1
      ? [{ row: 0, east: false }]
      : [
          { row: 0, east: false },
          { row: rows - 1, east: true },
        ];
  }
  return Array.from({ length: lanes }, (_, lane) => [
    { row: 2 * lane + 1, east: false },
    { row: 2 * lane + 2, east: true },
  ]).flat();
}

/**
 * Where an object stands in a lot: centred across it, and pulled to the front,
 * so a house in a villa's deeper lot still lines up with its neighbours along
 * the street.
 */
export function lotAnchor(lot: BlockLot, footprint: Footprint): { tileX: number; tileZ: number } {
  return {
    tileX: lot.tileX + Math.floor((lot.width - footprint.x) / 2),
    tileZ: lot.rotation === 2 ? lot.tileZ : lot.tileZ + lot.depth - footprint.z,
  };
}

/**
 * The ways a park is laid out.
 *
 * - `canal`: a pond two rows deep across the middle, a walk along each bank and
 *   a path down the middle that bridges it.
 * - `twin`: two ponds either side of a path down the middle, and a path across
 *   that bridges both.
 * - `plaza`: a paved square with a fountain in it, paths out to all four
 *   streets, two stepped paths in from the southern corners, and ponds in the
 *   northern corners where there is room.
 * - `lake`: a lake inside a ring walk, spokes out to the streets either side,
 *   and a long bridge down the middle.
 * - `isle`: the lake, with an island the bridge lands on halfway across.
 */
export type ParkDesign = 'canal' | 'twin' | 'plaza' | 'lake' | 'isle';

export const PARK_DESIGNS: readonly ParkDesign[] = ['canal', 'twin', 'plaza', 'lake', 'isle'];

/** The smallest district each design is laid out in. */
const DESIGN_MIN: { readonly [design in ParkDesign]: { width: number; depth: number } } = {
  canal: { width: 11, depth: 8 },
  twin: { width: 13, depth: 9 },
  plaza: { width: 13, depth: 10 },
  lake: { width: 15, depth: 12 },
  isle: { width: 17, depth: 14 },
};

/** The smallest district a park of any design is laid out in. */
export const PARK_MIN = DESIGN_MIN.canal;

/** What a park is asked to be. Everything left out takes the plainest answer. */
export interface ParkStyle {
  readonly design: ParkDesign;
  /** How far the water strays from an ellipse; see `blobTiles`. */
  readonly wobble: Wobble;
  /** Extra rows of lawn kept round the water, which is what makes a lake small or large. */
  readonly margin: number;
}

export interface ParkLayout {
  readonly design: ParkDesign;
  /** The column the park is mirrored about. */
  readonly axis: number;
  readonly water: readonly Tile[];
  /** Straight runs of path, every one of them joined to a street or to another. */
  readonly runs: readonly ParkRun[];
  /** A square paved whole, or null. */
  readonly plaza: TileRect | null;
  /** The north-west tile of a two-by-two centrepiece on the plaza, or null. */
  readonly centrepiece: Tile | null;
  readonly trees: readonly ParkTree[];
  readonly beds: readonly Tile[];
  /** The picnic tables, each standing along a path. */
  readonly tables: readonly TableSpot[];
}

/** What a design decides; the lawns are planted from it the same way for all of them. */
interface ParkBones {
  readonly water: readonly Tile[];
  readonly runs: readonly ParkRun[];
  readonly plaza: TileRect | null;
  readonly centrepiece: Tile | null;
  readonly beds: readonly Tile[];
  /** A row the tree grid runs through. */
  readonly anchorZ: number;
}

/** A park's mirror column and middle row. */
interface Frame {
  readonly axis: number;
  readonly middle: number;
}

const widthOf = (rect: TileRect): number => rect.x1 - rect.x0 + 1;
const depthOf = (rect: TileRect): number => rect.z1 - rect.z0 + 1;

/** The designs a district is big enough for, plainest first. */
export function parkDesignsFor(rect: TileRect): ParkDesign[] {
  return PARK_DESIGNS.filter(
    (design) =>
      widthOf(rect) >= DESIGN_MIN[design].width && depthOf(rect) >= DESIGN_MIN[design].depth,
  );
}

/**
 * Lays a district out as a park, or null when it is too small for the design.
 *
 * Every design is laid out **mirrored about the middle column**, its paths run
 * street to street or onto one another, and wherever a path meets water it
 * crosses it head on, so the layout lays a bridge there: a ramp off each bank,
 * and a deck between them once the water is three tiles or more across. The
 * lawns are then planted the same way whatever the design — see
 * {@link plantGrid} and {@link tableSpots}.
 *
 * A margin the district cannot spare is given up a row at a time rather than
 * refused. Assumes a street runs along all four sides, which is what the
 * generator only ever hands it.
 */
export function parkLayout(rect: TileRect, style: Partial<ParkStyle> = {}): ParkLayout | null {
  const design = style.design ?? 'canal';
  if (!parkDesignsFor(rect).includes(design)) return null;
  const frame = {
    axis: rect.x0 + Math.floor((widthOf(rect) - 1) / 2),
    middle: rect.z0 + Math.floor((depthOf(rect) - 1) / 2),
  };
  for (let margin = Math.max(0, Math.round(style.margin ?? 0)); margin >= 0; margin--) {
    const bones = DESIGNS[design](rect, frame, { wobble: style.wobble ?? NO_WOBBLE, margin });
    if (bones) return planted(rect, frame.axis, design, bones);
  }
  return null;
}

type Builder = (rect: TileRect, frame: Frame, style: Omit<ParkStyle, 'design'>) => ParkBones | null;

const DESIGNS: { readonly [design in ParkDesign]: Builder } = {
  canal: canalBones,
  twin: twinBones,
  plaza: plazaBones,
  lake: lakeBones,
  isle: isleBones,
};

/** A box is worth filling with water only when it is this big both ways. */
const POND_MIN = 3;

const roomyBox = (box: TileRect): boolean => widthOf(box) >= POND_MIN && depthOf(box) >= POND_MIN;

/** Mirrors tiles about a column, keeping the originals. */
const withMirror = (tiles: readonly Tile[], axis: number): Tile[] => [
  ...tiles,
  ...tiles.map((tile) => ({ x: 2 * axis - tile.x, z: tile.z })),
];

/** A path straight down a column from the street to the north to the street to the south. */
const downRun = (rect: TileRect, x: number): ParkRun => ({
  from: { x, z: rect.z0 - 1 },
  to: { x, z: rect.z1 + 1 },
});

/** A path straight across a row from the street to the west to the street to the east. */
const acrossRun = (rect: TileRect, z: number): ParkRun => ({
  from: { x: rect.x0 - 1, z },
  to: { x: rect.x1 + 1, z },
});

/** A pond two rows deep, a walk along each bank, and the path down the middle bridging it. */
function canalBones(rect: TileRect, frame: Frame): ParkBones {
  const pond = rect.z0 + Math.floor((depthOf(rect) - 2) / 2);
  const inset = Math.min(4, Math.max(2, Math.floor(widthOf(rect) / 6)));
  const shore = { x0: rect.x0 + inset, x1: rect.x1 - inset };
  return {
    water: rectTiles({ ...shore, z0: pond, z1: pond + 1 }),
    runs: [acrossRun(rect, pond - 1), acrossRun(rect, pond + 2), downRun(rect, frame.axis)],
    plaza: null,
    centrepiece: null,
    beds: rectTiles({ x0: shore.x0 - 1, x1: shore.x0 - 1, z0: pond, z1: pond + 1 }).concat(
      rectTiles({ x0: shore.x1 + 1, x1: shore.x1 + 1, z0: pond, z1: pond + 1 }),
    ),
    anchorZ: pond - 3,
  };
}

/** Two ponds either side of the path down the middle, and a path across bridging both. */
function twinBones(
  rect: TileRect,
  frame: Frame,
  style: Omit<ParkStyle, 'design'>,
): ParkBones | null {
  const { axis, middle } = frame;
  const box = {
    x0: rect.x0 + 2,
    x1: axis - 2,
    z0: rect.z0 + 2 + style.margin,
    z1: rect.z1 - 2 - style.margin,
  };
  if (!roomyBox(box) || middle < box.z0 || middle > box.z1) return null;
  const beds = [-2, 2].flatMap((dz) => [
    { x: axis - 1, z: middle + dz },
    { x: axis + 1, z: middle + dz },
  ]);
  return {
    water: withMirror(blobTiles(box, style.wobble), axis),
    runs: [downRun(rect, axis), acrossRun(rect, middle)],
    plaza: null,
    centrepiece: null,
    beds: beds.filter((bed) => bed.z > box.z0 && bed.z < box.z1),
    anchorZ: middle,
  };
}

/**
 * The path in from a corner of the park to a tile beside its plaza, as a
 * staircase of short straight runs: two tiles north, two tiles east, and so on
 * until it arrives — which reads as a diagonal without laying one.
 */
function steppedRuns(from: Tile, to: Tile): ParkRun[] {
  const runs: ParkRun[] = [];
  let at = from;
  while (at.z > to.z || at.x < to.x) {
    const north = { x: at.x, z: Math.max(to.z, at.z - 2) };
    const east = { x: Math.min(to.x, north.x + 2), z: north.z };
    if (north.z !== at.z) runs.push({ from: at, to: north });
    if (east.x !== north.x) runs.push({ from: north, to: east });
    at = east;
  }
  return runs;
}

/** A paved square with a fountain, four arms out to the streets, and stepped paths in from the south. */
function plazaBones(
  rect: TileRect,
  frame: Frame,
  style: Omit<ParkStyle, 'design'>,
): ParkBones | null {
  const { axis, middle } = frame;
  const half = widthOf(rect) >= 15 && depthOf(rect) >= 12 ? 3 : 2;
  const plaza = {
    x0: axis - half + 1,
    x1: axis + half,
    z0: middle - half + 1,
    z1: middle + half,
  };
  if (plaza.z0 - rect.z0 < 2 || rect.z1 - plaza.z1 < 2 || plaza.x0 - rect.x0 < 3) return null;
  // Everything but the arms down the middle is mirrored about the plaza's own
  // middle, half a tile east of the axis, because the fountain is two tiles wide.
  const centre = axis + 0.5;
  const stepped = steppedRuns({ x: rect.x0 + 2, z: rect.z1 + 1 }, { x: plaza.x0 - 1, z: plaza.z1 });
  const pond = {
    x0: rect.x0 + 2,
    x1: plaza.x0 - 3,
    z0: rect.z0 + 2 + style.margin,
    z1: middle - 2,
  };
  const west = roomyBox(pond) ? blobTiles(pond, style.wobble) : [];
  return {
    water: [...west, ...west.map((tile) => ({ x: 2 * centre - tile.x, z: tile.z }))],
    runs: [
      { from: { x: axis, z: rect.z0 - 1 }, to: { x: axis, z: plaza.z0 - 1 } },
      { from: { x: axis, z: plaza.z1 + 1 }, to: { x: axis, z: rect.z1 + 1 } },
      { from: { x: rect.x0 - 1, z: middle }, to: { x: plaza.x0 - 1, z: middle } },
      { from: { x: plaza.x1 + 1, z: middle }, to: { x: rect.x1 + 1, z: middle } },
      ...stepped,
      ...stepped.map((run) => mirrorRun(run, centre)),
    ],
    plaza,
    centrepiece: { x: axis, z: middle },
    beds: [
      { x: plaza.x0, z: plaza.z0 },
      { x: plaza.x1, z: plaza.z0 },
    ],
    anchorZ: middle,
  };
}

/** A lake inside a ring walk, spokes to the streets either side, and a bridge down the middle. */
function lakeBones(
  rect: TileRect,
  frame: Frame,
  style: Omit<ParkStyle, 'design'>,
): ParkBones | null {
  const { axis, middle } = frame;
  const inset = 2 + style.margin;
  const ring = {
    x0: rect.x0 + inset,
    x1: 2 * axis - rect.x0 - inset,
    z0: rect.z0 + inset,
    z1: rect.z1 - inset,
  };
  const box = { x0: ring.x0 + 2, x1: ring.x1 - 2, z0: ring.z0 + 2, z1: ring.z1 - 2 };
  if (!roomyBox(box)) return null;
  const corner = (x: number, z: number): ParkRun => ({ from: { x: ring.x0, z }, to: { x, z } });
  return {
    water: blobTiles(box, style.wobble),
    runs: [
      corner(ring.x1, ring.z0),
      corner(ring.x1, ring.z1),
      { from: { x: ring.x0, z: ring.z0 }, to: { x: ring.x0, z: ring.z1 } },
      { from: { x: ring.x1, z: ring.z0 }, to: { x: ring.x1, z: ring.z1 } },
      downRun(rect, axis),
      { from: { x: rect.x0 - 1, z: middle }, to: { x: ring.x0, z: middle } },
      { from: { x: ring.x1, z: middle }, to: { x: rect.x1 + 1, z: middle } },
    ],
    plaza: null,
    centrepiece: null,
    beds: [
      { x: ring.x0 + 1, z: ring.z0 + 1 },
      { x: ring.x1 - 1, z: ring.z0 + 1 },
      { x: ring.x0 + 1, z: ring.z1 - 1 },
      { x: ring.x1 - 1, z: ring.z1 - 1 },
    ],
    anchorZ: middle,
  };
}

/** Rows of water kept either side of the island, so each half of the bridge is a real one. */
const ISLE_CHANNEL = 2;

/** The lake, with an island three tiles wide that the bridge lands on halfway across. */
function isleBones(
  rect: TileRect,
  frame: Frame,
  style: Omit<ParkStyle, 'design'>,
): ParkBones | null {
  const lake = lakeBones(rect, frame, style);
  if (!lake) return null;
  const rows = lake.water.filter((tile) => tile.x === frame.axis).map((tile) => tile.z);
  const island = {
    x0: frame.axis - 1,
    x1: frame.axis + 1,
    z0: Math.min(...rows) + ISLE_CHANNEL,
    z1: Math.max(...rows) - ISLE_CHANNEL,
  };
  if (island.z1 < island.z0) return null;
  const onIsland = new Set(rectTiles(island).map((tile) => tileKey(tile.x, tile.z)));
  return {
    ...lake,
    water: lake.water.filter((tile) => !onIsland.has(tileKey(tile.x, tile.z))),
    beds: [...lake.beds, ...rectTiles(island).filter((tile) => tile.x !== frame.axis)],
  };
}

const keys = (tiles: readonly Tile[]): string[] => tiles.map((tile) => tileKey(tile.x, tile.z));

/** Plants a design's lawns: the tree grid first, then the picnic tables round it. */
function planted(rect: TileRect, axis: number, design: ParkDesign, bones: ParkBones): ParkLayout {
  const paved = new Set(
    keys([...bones.runs.flatMap(runTiles), ...(bones.plaza ? rectTiles(bones.plaza) : [])]),
  );
  const water = new Set(keys(bones.water));
  const fountain = bones.centrepiece
    ? rectTiles({
        x0: bones.centrepiece.x,
        x1: bones.centrepiece.x + 1,
        z0: bones.centrepiece.z,
        z1: bones.centrepiece.z + 1,
      })
    : [];
  const standing = keys([...bones.beds, ...fountain]);
  const trees = plantGrid({
    rect,
    axis,
    anchorZ: bones.anchorZ,
    blocked: new Set([...paved, ...water, ...standing]),
  });
  const tables = tableSpots({
    rect,
    axis,
    paved,
    water,
    taken: new Set([...standing, ...keys(trees.map((tree) => tree.tile))]),
  });
  return { design, axis, ...bones, trees, tables };
}
