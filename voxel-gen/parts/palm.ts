import { TILE_VOXELS, type Color, type VoxelBuilder } from '../voxelgen.ts';

export interface PalmFrond {
  readonly turn: number;
  // Zero runs the frond out to the tile's edge; anything else is a short frond of that length.
  readonly reach?: number;
  readonly droop: number;
  readonly rib: Color;
  readonly leaflet: Color;
  readonly tip: Color;
}

const EDGE = TILE_VOXELS - 1;

// Half a tile across a cardinal and the full diagonal across a corner: the crown fills the square
// a palm stands on, which is what reads as a crown at a distance.
const LONGEST = 10.5;

// The leaflets' widest spread, at mid-frond; the rib keeps this far in from the tile's edge.
const SPREAD = 2;

const clamp = (value: number): number => Math.min(EDGE, Math.max(0, Math.round(value)));

function reachToEdge(cx: number, cz: number, dx: number, dz: number): number {
  const along = (from: number, step: number): number =>
    step > 0.01 ? (EDGE + 0.5 - from) / step : step < -0.01 ? (from + 0.5) / -step : LONGEST;
  return Math.min(LONGEST, along(cx, dx), along(cz, dz)) - 0.5;
}

export function palmFrond(
  b: VoxelBuilder,
  [cx, cz]: readonly [number, number],
  crown: number,
  frond: PalmFrond,
): void {
  const dx = Math.cos(frond.turn);
  const dz = Math.sin(frond.turn);
  const reach = frond.reach ?? reachToEdge(cx, cz, dx, dz);
  // Scaled to one voxel a step on the longer axis, so a diagonal leaflet row has no holes.
  const side = Math.max(Math.abs(dx), Math.abs(dz));
  const px = -dz / side;
  const pz = dx / side;
  const steps = Math.ceil(reach * 2);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const x = cx + dx * t * reach;
    const z = cz + dz * t * reach;
    // Lifts off the crown before it droops, like a rib under its own weight.
    const y = Math.round(crown + 2 + 3 * t - (frond.droop + 3) * t * t);
    b.set(clamp(x), y, clamp(z), t > 0.85 ? frond.tip : frond.rib);
    if (t < 0.12) continue;
    // Widest past the middle and narrowing to the tip; each leaflet hangs below the one inside it.
    const spread = Math.round(SPREAD * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.3);
    for (let out = 1; out <= spread; out++) {
      const colour = t > 0.85 ? frond.tip : frond.leaflet;
      b.set(clamp(x + px * out), y - out, clamp(z + pz * out), colour);
      b.set(clamp(x - px * out), y - out, clamp(z - pz * out), colour);
    }
  }
}
