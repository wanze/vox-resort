import {
  defineModel,
  TILE_VOXELS,
  type MosaicSide,
  type VoxelBuilder,
  type VoxelModelSource,
} from '../voxelgen.ts';
import { kitPieceOf } from '../mosaics/pieces.ts';

export interface RunPiece {
  readonly name: string;
  readonly suffix: string;
  readonly joins: readonly MosaicSide[];
}

// The first is the style's own model, so the palette shows a straight length and a hedge saved
// before runs joined keeps its id.
export const RUN_PIECES: readonly RunPiece[] = [
  { name: 'straight', suffix: 'Straight', joins: ['e', 'w'] },
  { name: 'single', suffix: 'Single', joins: [] },
  { name: 'end', suffix: 'End', joins: ['e'] },
  { name: 'corner', suffix: 'Corner', joins: ['e', 's'] },
  { name: 'tee', suffix: 'Tee', joins: ['e', 's', 'w'] },
  { name: 'cross', suffix: 'Cross', joins: ['n', 'e', 's', 'w'] },
];

export interface Footprint {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface RunStyle {
  readonly id: string;
  readonly label: string;
  readonly cost: number;
  readonly scenery: number;
  // Centred, lo + hi = 15, so an arm turned onto another side still meets its neighbour's.
  readonly span: { readonly lo: number; readonly hi: number };
  readonly paint: (b: VoxelBuilder, footprint: Footprint) => void;
}

const LAST = TILE_VOXELS - 1;

// Where a run stops short of a side it does not join: a hedge ends on the grass, not the edge.
const MARGIN = 2;

const OPPOSITE: { readonly [side in MosaicSide]: MosaicSide } = { n: 's', s: 'n', e: 'w', w: 'e' };

function armTo(side: MosaicSide, lo: number, hi: number, reach: number): Footprint {
  switch (side) {
    case 'n':
      return { x0: lo, x1: hi, z0: reach, z1: hi };
    case 's':
      return { x0: lo, x1: hi, z0: lo, z1: LAST - reach };
    case 'w':
      return { x0: reach, x1: hi, z0: lo, z1: hi };
    default:
      return { x0: lo, x1: LAST - reach, z0: lo, z1: hi };
  }
}

// A lone tile is a short length and an end runs on to the far margin, so neither is a stub.
function footprintsOf(joins: readonly MosaicSide[], lo: number, hi: number): Footprint[] {
  const core = { x0: lo, x1: hi, z0: lo, z1: hi };
  const arms = joins.map((side) => armTo(side, lo, hi, 0));
  if (joins.length === 0) return [armTo('w', lo, hi, MARGIN), armTo('e', lo, hi, MARGIN)];
  if (joins.length === 1) return [core, ...arms, armTo(OPPOSITE[joins[0]!], lo, hi, MARGIN)];
  return [core, ...arms];
}

export function runSources(style: RunStyle): VoxelModelSource[] {
  return RUN_PIECES.map((piece, index) =>
    defineModel({
      ...kitPieceOf(style, piece, index),
      onTerrain: true,
      cost: style.cost,
      scenery: style.scenery,
      run: { style: style.id, joins: piece.joins },
      build: (b) => {
        for (const footprint of footprintsOf(piece.joins, style.span.lo, style.span.hi)) {
          style.paint(b, footprint);
        }
      },
    }),
  );
}
