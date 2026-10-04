import type { QuarterTurns } from '../voxelgen.ts';

export interface SampleCell {
  readonly x: number;
  readonly z: number;
  readonly piece: string;
  readonly turns: QuarterTurns;
}

// A 4 x 3 plaza, a strip leaving it east that bends south into a T, and one lone tile. Written out
// by hand so the sheet shows what was meant; layout's mosaic test holds it to the fit rule.
export const MOSAIC_SAMPLE: readonly SampleCell[] = [
  { x: 0, z: 0, piece: 'corner', turns: 0 },
  { x: 1, z: 0, piece: 'edge', turns: 0 },
  { x: 2, z: 0, piece: 'edge', turns: 0 },
  { x: 3, z: 0, piece: 'corner', turns: 3 },
  { x: 0, z: 1, piece: 'edge', turns: 1 },
  { x: 1, z: 1, piece: 'centre', turns: 0 },
  { x: 2, z: 1, piece: 'centre', turns: 0 },
  { x: 3, z: 1, piece: 'centre', turns: 0 },
  { x: 0, z: 2, piece: 'corner', turns: 1 },
  { x: 1, z: 2, piece: 'edge', turns: 2 },
  { x: 2, z: 2, piece: 'edge', turns: 2 },
  { x: 3, z: 2, piece: 'corner', turns: 2 },
  { x: 4, z: 1, piece: 'strip', turns: 0 },
  { x: 5, z: 1, piece: 'strip', turns: 0 },
  { x: 6, z: 1, piece: 'strip', turns: 0 },
  { x: 7, z: 1, piece: 'corner', turns: 3 },
  { x: 7, z: 2, piece: 'strip', turns: 1 },
  { x: 7, z: 3, piece: 'strip', turns: 1 },
  { x: 7, z: 4, piece: 'edge', turns: 2 },
  { x: 6, z: 4, piece: 'strip', turns: 0 },
  { x: 5, z: 4, piece: 'end', turns: 1 },
  { x: 8, z: 4, piece: 'end', turns: 3 },
  { x: 1, z: 5, piece: 'single', turns: 0 },
];
