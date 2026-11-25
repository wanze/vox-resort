import { palmFrond, type PalmFrond } from '../parts/palm.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const C = {
  trunk: 0x8a6a3f,
  trunkDark: 0x6f5330,
  frondA: 0x2f7d45,
  frondB: 0x49a05e,
  frondTip: 0x62b56f,
  coconut: 0x5a3f26,
};

// Low enough for the crown to read against the trunk; at 40 the fronds looked like a tuft on a pole.
const TOP = 32;

// Off the axes, so no frond lines up with a tile edge. Alternate fronds hang lower and darker, which
// layers the crown instead of laying it flat.
const FRONDS: readonly PalmFrond[] = [
  ...Array.from({ length: 8 }, (_, index) => ({
    turn: 0.4 + (index * Math.PI) / 4,
    droop: index % 2 === 0 ? 7 : 10,
    rib: C.frondA,
    leaflet: index % 2 === 0 ? C.frondB : C.frondA,
    tip: C.frondTip,
  })),
  ...[1.2, 3.3, 5.4].map((turn) => ({
    turn,
    reach: 3.5,
    droop: 0,
    rib: C.frondB,
    leaflet: C.frondB,
    tip: C.frondTip,
  })),
];

export default defineModel({
  id: 'palm',
  label: 'Palm',
  category: 'grounds',
  sound: 'trees',
  scenery: 0.4,
  // What it cost before its crown grew: the price follows the voxel count, and this was only a look.
  cost: 10,
  tiles: { x: 1, z: 1 },
  onTerrain: true,
  build: (b: VoxelBuilder) => {
    // A lean that comes back over the root by the top, so the crown is centred on the tile it fills.
    let tx = 7;
    let tz = 7;
    for (let y = 2; y <= TOP; y++) {
      const rise = (y - 2) / (TOP - 2);
      tx = 7 + Math.round(Math.sin(rise * Math.PI) * 2);
      tz = 7 + Math.round(Math.sin(rise * Math.PI) * 1);
      b.box(tx, tx + 1, y, y, tz, tz + 1, (y - 2) % 3 === 0 ? C.trunkDark : C.trunk);
    }

    for (const [dx, dz] of [
      [-1, 0],
      [2, 1],
      [0, 2],
      [1, -1],
    ] as const)
      b.set(tx + dx, TOP - 1, tz + dz, C.coconut);

    for (const frond of FRONDS) palmFrond(b, [tx + 0.5, tz + 0.5], TOP, frond);
    b.box(tx, tx + 1, TOP + 1, TOP + 2, tz, tz + 1, C.frondB);
    b.set(tx, TOP + 3, tz, C.frondTip);
  },
});
