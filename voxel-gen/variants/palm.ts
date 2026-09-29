import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 15;
const CROWN = 38;

// Rotated off the axes so no frond lines up with a tile edge and the crown reads round.
const FRONDS = [
  { turn: 0.2, reach: 7.4, droop: 7, leaf: PALETTE.foliage.base },
  { turn: 1.1, reach: 7, droop: 8, leaf: PALETTE.foliage.base },
  { turn: 2.0, reach: 7.4, droop: 7, leaf: PALETTE.foliage.base },
  { turn: 2.95, reach: 7, droop: 8, leaf: PALETTE.foliage.base },
  { turn: 3.85, reach: 7.4, droop: 7, leaf: PALETTE.foliage.base },
  { turn: 4.75, reach: 7, droop: 8, leaf: PALETTE.foliage.base },
  { turn: 5.6, reach: 7.2, droop: 7, leaf: PALETTE.foliage.base },
  { turn: 0.65, reach: 4, droop: 1, leaf: PALETTE.grass.base },
  { turn: 2.75, reach: 4, droop: 1, leaf: PALETTE.grass.base },
  { turn: 4.85, reach: 4, droop: 1, leaf: PALETTE.grass.base },
] as const;

const clamp = (value: number): number => Math.min(EDGE, Math.max(0, value));

// Rooted in the middle and bowing out on the way up, then back, so the crown sits
// over the root and the fronds stay inside the tile.
function trunkAt(y: number, top: number): readonly [number, number] {
  const bow = Math.sin((y / top) * Math.PI);
  return [7 + 2.5 * bow, 7 + 2 * bow];
}

function frond(
  b: VoxelBuilder,
  [cx, cz]: readonly [number, number],
  turn: number,
  reach: number,
  droop: number,
  leaf: Color,
): void {
  const dx = Math.cos(turn);
  const dz = Math.sin(turn);
  const leaflet = (x: number, y: number, z: number): void =>
    b.set(clamp(Math.round(x)), y, clamp(Math.round(z)), leaf);
  for (let step = 1; step <= reach * 2; step++) {
    const t = step / (reach * 2);
    const out = t * reach;
    // Lifts off the crown before it droops, like a rib under its own weight.
    const y = Math.round(CROWN + 2 + 3 * t - (droop + 3) * t * t);
    const x = cx + dx * out;
    const z = cz + dz * out;
    leaflet(x, y, z);
    // The leaflets hang a course below the rib, which is what makes a frond read as a frond.
    if (t < 0.25 || t > 0.8) continue;
    leaflet(x - dz, y - 1, z + dx);
    leaflet(x + dz, y - 1, z - dx);
  }
}

export default defineModel({
  id: 'palm-b',
  label: 'Palm B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { sand, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2, stone: sand });
    const [baseX, baseZ] = trunkAt(0, CROWN - ground);
    const bedX = Math.floor(baseX);
    const bedZ = Math.floor(baseZ);
    b.box(bedX - 2, bedX + 3, ground - 1, ground - 1, bedZ - 2, bedZ + 3, teak.deep);

    // The trunk steps sideways only where the curve says so; each step is a ring,
    // which is the one place the bark changes tone.
    let last = '';
    for (let y = ground; y < CROWN; y++) {
      const [x, z] = trunkAt(y - ground, CROWN - ground).map(Math.floor) as [number, number];
      const cell = `${x},${z}`;
      const color = cell === last || y < ground + 2 ? teak.light : teak.base;
      last = cell;
      const flare = y < ground + 2 ? 1 : 0;
      b.box(x - flare, x + 1 + flare, y, y, z - flare, z + 1 + flare, color);
    }
    const [topX, topZ] = trunkAt(CROWN - ground, CROWN - ground).map(Math.floor) as [
      number,
      number,
    ];
    b.box(topX - 1, topX + 2, CROWN - 1, CROWN, topZ - 1, topZ + 2, teak.shade);
    for (const [x, z] of [
      [topX - 1, topZ + 2],
      [topX + 2, topZ],
      [topX, topZ - 1],
    ] as const) {
      b.set(x, CROWN - 2, z, teak.deep);
    }

    const centre = [topX + 0.5, topZ + 0.5] as const;
    for (const { turn, reach, droop, leaf } of FRONDS) frond(b, centre, turn, reach, droop, leaf);
    b.box(topX, topX + 1, CROWN + 1, CROWN + 3, topZ, topZ + 1, PALETTE.grass.base);
  },
});
