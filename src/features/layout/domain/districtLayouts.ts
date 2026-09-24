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

export type LotRole = 'house' | 'accent' | 'shop';

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
  readonly lanes: readonly number[];
}

interface Footprint {
  readonly x: number;
  readonly z: number;
}

export interface BlockOptions {
  readonly accent?: { readonly footprint: Footprint; readonly share: number };
  readonly shops?: boolean;
}

const FRONT_GARDEN = 1;

const HOUSE_GAP = 1;

const LANE_ROWS = 3;

const SHOPS_FROM = 3;

function keptOf(places: number, density: number): number {
  if (places <= 0) return 0;
  const wanted = Math.max(1, Math.round(places * density));
  // The same parity as the row, so the gap either side of the kept run is even.
  if ((places - wanted) % 2 === 0) return wanted;
  return wanted > 1 ? wanted - 1 : wanted + 1;
}

function accentPattern(count: number, share: number): boolean[] {
  const stride = Math.max(2, Math.round(1 / share));
  return Array.from({ length: count }, (_, index) => {
    if (share <= 0 || count < 2) return false;
    if (count === 2) return index === 0;
    return Math.min(index, count - 1 - index) % stride === 0;
  });
}

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

function blockRows(
  rect: TileRect,
  rowDepth: number,
): { rows: { z: number; rotation: Rotation }[]; lanes: number[] } {
  const depth = rect.z1 - rect.z0 + 1 - 2 * FRONT_GARDEN;
  if (depth < rowDepth) return { rows: [], lanes: [] };
  const pairDepth = 2 * rowDepth;
  const pairs = Math.floor((depth + LANE_ROWS) / (pairDepth + LANE_ROWS));
  if (pairs === 0) {
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

// Pulled to the front so a house in a villa's deeper lot lines up with its neighbours.
export function lotAnchor(lot: BlockLot, footprint: Footprint): { tileX: number; tileZ: number } {
  return {
    tileX: lot.tileX + Math.floor((lot.width - footprint.x) / 2),
    tileZ: lot.rotation === 2 ? lot.tileZ : lot.tileZ + lot.depth - footprint.z,
  };
}

export type ParkDesign = 'canal' | 'twin' | 'plaza' | 'lake' | 'isle';

export const PARK_DESIGNS: readonly ParkDesign[] = ['canal', 'twin', 'plaza', 'lake', 'isle'];

const DESIGN_MIN: { readonly [design in ParkDesign]: { width: number; depth: number } } = {
  canal: { width: 11, depth: 8 },
  twin: { width: 13, depth: 9 },
  plaza: { width: 13, depth: 10 },
  lake: { width: 15, depth: 12 },
  isle: { width: 17, depth: 14 },
};

export const PARK_MIN = DESIGN_MIN.canal;

export interface ParkStyle {
  readonly design: ParkDesign;
  readonly wobble: Wobble;
  readonly margin: number;
}

export interface ParkLayout {
  readonly design: ParkDesign;
  readonly axis: number;
  readonly water: readonly Tile[];
  readonly runs: readonly ParkRun[];
  readonly plaza: TileRect | null;
  readonly centrepiece: Tile | null;
  readonly trees: readonly ParkTree[];
  readonly beds: readonly Tile[];
  readonly tables: readonly TableSpot[];
}

interface ParkBones {
  readonly water: readonly Tile[];
  readonly runs: readonly ParkRun[];
  readonly plaza: TileRect | null;
  readonly centrepiece: Tile | null;
  readonly beds: readonly Tile[];
  readonly anchorZ: number;
}

interface Frame {
  readonly axis: number;
  readonly middle: number;
}

const widthOf = (rect: TileRect): number => rect.x1 - rect.x0 + 1;
const depthOf = (rect: TileRect): number => rect.z1 - rect.z0 + 1;

export function parkDesignsFor(rect: TileRect): ParkDesign[] {
  return PARK_DESIGNS.filter(
    (design) =>
      widthOf(rect) >= DESIGN_MIN[design].width && depthOf(rect) >= DESIGN_MIN[design].depth,
  );
}

// Assumes a street runs along all four sides, which is all the generator hands it.
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

const POND_MIN = 3;

const roomyBox = (box: TileRect): boolean => widthOf(box) >= POND_MIN && depthOf(box) >= POND_MIN;

const withMirror = (tiles: readonly Tile[], axis: number): Tile[] => [
  ...tiles,
  ...tiles.map((tile) => ({ x: 2 * axis - tile.x, z: tile.z })),
];

const downRun = (rect: TileRect, x: number): ParkRun => ({
  from: { x, z: rect.z0 - 1 },
  to: { x, z: rect.z1 + 1 },
});

const acrossRun = (rect: TileRect, z: number): ParkRun => ({
  from: { x: rect.x0 - 1, z },
  to: { x: rect.x1 + 1, z },
});

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
  // Mirrored about the plaza's own middle, half a tile east of the axis, because the fountain
  // is two tiles wide.
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

// Water either side of the island, so each half of the bridge is a real bridge.
const ISLE_CHANNEL = 2;

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
