import { PALETTE } from '../palette.ts';
import { palmFrond, type PalmFrond } from '../parts/palm.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Low enough for the crown to read against the trunk; at 38 the fronds looked like a tuft on a pole.
const CROWN = 30;

const { foliage, grass } = PALETTE;

// Rotated off the axes so no frond lines up with a tile edge and the crown reads round. The lower
// fronds are a shade darker, which is what gives the crown depth from above.
const FRONDS: readonly PalmFrond[] = [
  ...Array.from({ length: 9 }, (_, index) => ({
    turn: 0.2 + (index * 2 * Math.PI) / 9,
    droop: index % 2 === 0 ? 8 : 10,
    rib: index % 2 === 0 ? foliage.base : foliage.shade,
    leaflet: index % 2 === 0 ? foliage.base : foliage.shade,
    tip: foliage.light,
  })),
  ...[0.65, 2.75, 4.85].map((turn) => ({
    turn,
    reach: 4,
    droop: 1,
    rib: grass.base,
    leaflet: grass.base,
    tip: grass.light,
  })),
];

// Rooted in the middle and bowing out on the way up, then back, so the crown sits
// over the root and the fronds stay inside the tile.
function trunkAt(y: number, top: number): readonly [number, number] {
  const bow = Math.sin((y / top) * Math.PI);
  return [7 + 2.5 * bow, 7 + 2 * bow];
}

export default defineModel({
  id: 'palm-b',
  label: 'Palm B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 1, z: 1 },
  onTerrain: true,
  build: (b: VoxelBuilder) => {
    const { teak } = PALETTE;
    const ground = 0;
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
    for (const frond of FRONDS) palmFrond(b, centre, CROWN, frond);
    b.box(topX, topX + 1, CROWN + 1, CROWN + 3, topZ, topZ + 1, PALETTE.grass.base);
  },
});
