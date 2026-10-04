import {
  defineModel,
  PAVING_VOXELS,
  TILE_VOXELS,
  type Color,
  type MosaicSide,
  type QuarterTurns,
  type VoxelModelSource,
} from '../voxelgen.ts';

export const BAND = 2;

export const MOSAIC_COST = 40;

// Paving is dense: a tile deep in a plaza sums dozens of these, so each is a fraction of a fountain.
export const MOSAIC_SCENERY = 0.05;

export interface MosaicPiece {
  readonly name: string;
  readonly suffix: string;
  readonly borders: readonly MosaicSide[];
}

// The first is the style's own model, so the palette's picture is a framed tile.
export const MOSAIC_PIECES: readonly MosaicPiece[] = [
  { name: 'single', suffix: 'Single', borders: ['n', 'e', 's', 'w'] },
  { name: 'end', suffix: 'End', borders: ['n', 'e', 'w'] },
  { name: 'strip', suffix: 'Strip', borders: ['n', 's'] },
  { name: 'corner', suffix: 'Corner', borders: ['n', 'w'] },
  { name: 'edge', suffix: 'Edge', borders: ['n'] },
  { name: 'centre', suffix: 'Centre', borders: [] },
];

export interface MosaicStyle {
  readonly id: string;
  readonly label: string;
  // The north-west quarter; null shows the field.
  readonly quadrant: (x: number, z: number) => Color | null;
  readonly field: Color;
  readonly border: Color;
  readonly bed: Color;
}

const LAST = TILE_VOXELS - 1;
const HALF = TILE_VOXELS / 2;
const TOP = PAVING_VOXELS - 1;

export const inside = (value: number, lo: number, hi: number): boolean =>
  value >= lo && value <= hi;

export interface Cell {
  readonly x: number;
  readonly z: number;
}

// One turn swings north to face west, as rotation.ts turns a placed model.
export function turnVoxel(x: number, z: number, turns: QuarterTurns): Cell {
  let cell = { x, z };
  for (let turn = 0; turn < turns; turn++) cell = { x: cell.z, z: LAST - cell.x };
  return cell;
}

const REACH: { readonly [side in MosaicSide]: (cell: Cell) => number } = {
  n: (cell) => cell.z,
  s: (cell) => LAST - cell.z,
  w: (cell) => cell.x,
  e: (cell) => LAST - cell.x,
};

export const withinBand = (side: MosaicSide, cell: Cell): boolean => REACH[side](cell) < BAND;

// Painted once and turned into the other three quarters: a piece turned to fit shows the same
// field as an unturned one beside it.
function fieldOf(style: MosaicStyle): (x: number, z: number) => Color {
  const grid: Color[] = Array.from({ length: TILE_VOXELS * TILE_VOXELS }, () => style.field);
  for (let x = 0; x < HALF; x++) {
    for (let z = 0; z < HALF; z++) {
      const color = style.quadrant(x, z) ?? style.field;
      for (const turns of [0, 1, 2, 3] as const) {
        const cell = turnVoxel(x, z, turns);
        grid[cell.z * TILE_VOXELS + cell.x] = color;
      }
    }
  }
  return (x, z) => grid[z * TILE_VOXELS + x]!;
}

export function mosaicSources(style: MosaicStyle): VoxelModelSource[] {
  const field = fieldOf(style);
  return MOSAIC_PIECES.map((piece, index) =>
    defineModel({
      id: index === 0 ? style.id : `${style.id}-${piece.name}`,
      label: index === 0 ? style.label : `${style.label} (${piece.suffix})`,
      category: 'grounds',
      tiles: { x: 1, z: 1 },
      ...(index === 0 ? {} : { groundDecides: true }),
      cost: MOSAIC_COST,
      scenery: MOSAIC_SCENERY,
      mosaic: { style: style.id, borders: piece.borders },
      build: (b) => {
        b.box(0, LAST, 0, TOP - 1, 0, LAST, style.bed);
        for (let x = 0; x <= LAST; x++) {
          for (let z = 0; z <= LAST; z++) {
            const banded = piece.borders.some((side) => withinBand(side, { x, z }));
            b.set(x, TOP, z, banded ? style.border : field(x, z));
          }
        }
      },
    }),
  );
}
