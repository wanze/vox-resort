/**
 * Resort hotel block: four whitewashed storeys of balconied rooms over an
 * arcaded entrance loggia, under a paved roof terrace with a plunge pool.
 * 160x80 (40x20 m plot, a 37x14 m block of five 3 m storeys, about 17 m to the
 * roof rail), a 10x5 tile. Entrance and balconies face +z.
 *
 * It was a 21x12 m block of four storeys on 6x4 tiles, which is a pension: a
 * resort hotel block runs 40 m and more, and beside a 10 m house the old one was
 * barely twice its length. The block is solid, as `wall.ts` asks, so it is the
 * heaviest model in the catalogue by voxels — what it costs to draw is its
 * surface, which grew far less than its volume.
 *
 * `docs/references/hotel.jpg` is a golden-hour render, so it is read here for
 * massing only — where the balconies go, how the entrance is covered, that the
 * top of the block is occupied rather than blank. The colour and the detailing
 * come from `docs/references/villa.jpg`, which is the lane; see
 * `docs/art-direction.md`. That is why a hotel and a villa share an arcade, a
 * balustrade and a whitewashed wall: they are the same resort.
 *
 * A pair of lanterns hangs in the loggia, so after dark the entrance is lit
 * rather than the block being a dark cliff over a lit street.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Lit at night, so it is drawn unlit at full brightness. */
const LANTERN = PALETTE.amber.light;

const PLOT = { w: 160, d: 80 } as const;
const BODY = { x: 6, z: 10, w: 148, d: 56 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;
const STOREYS = 5;

/** The entrance loggia, centred on the block and three bays wide. */
const LOGGIA = { x: 63, w: 34, z: FRONT + 3, d: 3 } as const;
/** The three arches of it, so the entrance can sit under the middle one. */
const ARCHES = [67, 77, 87] as const;

/**
 * Where each balcony starts, and how wide it is. Ten to a storey, one to every
 * 3.5 m of front, which is the pitch a block of rooms is built at, centred on
 * the block so both ends keep a pier of wall.
 */
const BALCONIES: readonly number[] = Array.from({ length: 10 }, (_, i) => 11 + i * 14);
const BALCONY_W = 12;
/** Balconies clear of the loggia, which takes the middle of the first floor. */
const FIRST_FLOOR = BALCONIES.filter((x) => x + BALCONY_W <= LOGGIA.x || x >= LOGGIA.x + LOGGIA.w);

/** The roof pool, sunk into the terrace the way the villa's is into its paving. */
const POOL = { x: 30, z: 20, w: 40, d: 30 } as const;

/** The stair and lift house on the roof, at the end away from the pool. */
const STAIR_HOUSE = { x: 112, z: 24, w: 22, d: 18 } as const;

/** The lanterns in the loggia, by the column they hang in. */
const LANTERNS = [74, 85] as const;

/**
 * Balusters every three voxels rather than every two, which is the one place
 * this block differs from the villa's detailing. A hotel is eighteen runs of
 * balustrade against the villa's three, and every baluster is four quads the
 * mesher cannot merge away; at the villa's pitch the block costs more triangles
 * than the four buildings that went before it put together. See `veranda.ts`.
 */
const PITCH = 3;

export default defineModel({
  id: 'hotel',
  label: 'Hotel',
  category: 'lodging',
  tiles: { x: 10, z: 5 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  // One lamp per lantern, a voxel clear of the wall it hangs on.
  lights: LANTERNS.map((x) => ({
    x,
    y: 11,
    z: FRONT + 2,
    color: LANTERN,
    intensity: 100,
    distance: 58,
  })),
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: STOREYS });
    // No parapet: a roof somebody swims on is a terrace, so it is edged the way
    // the balconies and the villa's terrace are, and the pool can be seen from
    // the street rather than walled off behind a kerb.
    const deck = flatRoof(b, { ...BODY, y: eaves, parapet: 0, cover: PALETTE.stone });

    // The loggia over the entrance, and the first-floor terrace its roof is.
    const cornice = arcade(b, {
      x: LOGGIA.x,
      z: LOGGIA.z,
      w: LOGGIA.w,
      d: LOGGIA.d,
      y: ground,
      along: 'x',
      bays: ARCHES.length,
      pier: 4,
      height: 8,
    });
    const terrace = cornice + 1;
    const brink = LOGGIA.z + LOGGIA.d - 1;
    b.box(
      LOGGIA.x - 2,
      LOGGIA.x + LOGGIA.w + 1,
      cornice,
      cornice,
      FRONT + 1,
      brink + 1,
      PALETTE.terracotta.deep,
    );
    b.box(
      LOGGIA.x - 1,
      LOGGIA.x + LOGGIA.w,
      terrace,
      terrace,
      FRONT + 1,
      brink,
      PALETTE.stone.base,
    );

    /**
     * A storey's floor level: the layer its balcony slabs are laid on, and one
     * below the layer everything standing on them starts at. The loggia roof
     * comes out on the first of these, which is what lets the terrace over the
     * entrance and the balconies either side of it read as one floor.
     */
    const floors = Array.from(
      { length: STOREYS - 1 },
      (_, i) => ground + (i + 1) * STOREY_VOXELS + 1,
    );

    for (const [storey, floor] of floors.entries()) {
      const rail = floor + 1;
      for (const x of storey === 0 ? FIRST_FLOOR : BALCONIES) {
        // A tiled nosing under each slab. Sixteen of these are the only strong
        // colour on the elevation, and they are what keeps the block in the same
        // family as the villa's roof rather than reading as a cream cliff.
        b.box(x - 1, x + BALCONY_W, floor, floor, FRONT + 1, FRONT + 5, PALETTE.terracotta.deep);
        b.box(x, x + BALCONY_W - 1, floor, floor, FRONT + 1, FRONT + 4, PALETTE.stone.base);
        balustrade(b, { x, z: FRONT + 4, y: rail, w: BALCONY_W, along: 'x', pitch: PITCH });
        for (const edge of [x, x + BALCONY_W - 1]) {
          balustrade(b, { x: edge, z: FRONT + 1, y: rail, w: 4, along: 'z', pitch: PITCH });
        }
        doorway(b, { face: 'z+', at: FRONT, along: x + 4, y: rail, w: 4, h: 8 });
      }
    }

    // The terrace over the loggia, edged like the villa's and reached by the
    // same French windows the balconies are.
    balustrade(b, { x: LOGGIA.x, z: brink, y: terrace + 1, w: LOGGIA.w, along: 'x', pitch: PITCH });
    for (const edge of [LOGGIA.x, LOGGIA.x + LOGGIA.w - 1]) {
      balustrade(b, {
        x: edge,
        z: FRONT + 1,
        y: terrace + 1,
        w: brink - FRONT,
        along: 'z',
        pitch: PITCH,
      });
    }
    for (const along of ARCHES) {
      doorway(b, { face: 'z+', at: FRONT, along, y: terrace + 1, w: 5, h: 8 });
    }

    // The entrance, under the middle arch and on the block's centre line.
    doorway(b, { face: 'z+', at: FRONT, along: ARCHES[1], y: ground, w: 6, h: 10 });
    steps(b, { x: ARCHES[1], z: FRONT + 1, w: 6, y: ground, treads: 1, descends: 'z+' });
    for (const along of [ARCHES[0], ARCHES[2]]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4, shutters: false });
    }
    // The lanterns, hung off the wall inside the loggia rather than out in the
    // weather, which is where the reference puts the light it burns.
    for (const x of LANTERNS) {
      b.box(x, x + 1, ground + 6, ground + 9, FRONT + 1, FRONT + 1, PALETTE.metal.deep);
      b.box(x, x + 1, ground + 7, ground + 8, FRONT + 1, FRONT + 1, LANTERN);
    }

    // Every storey, on the three sides the balconies do not take. A room has a
    // window whichever way it faces, and the block is seen from all of them.
    for (let storey = 0; storey < STOREYS; storey++) {
      const sill = ground + 3 + storey * STOREY_VOXELS;
      for (const along of [16, 28, 40, 52]) {
        shutteredWindow(b, { face: 'x-', at: LEFT, along, y: sill, w: 4 });
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y: sill, w: 4 });
      }
      for (let along = 12; along <= 144; along += 12) {
        shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: sill, w: 4 });
      }
    }
    // Ground floor, outboard of the loggia.
    for (const along of [12, 24, 36, 48, 108, 120, 132, 144]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, w: 4 });
    }

    // The roof terrace: edged, then a pool sunk into the paving the way the
    // villa's is into its own.
    for (const z of [BODY.z - 1, FRONT + 1]) {
      balustrade(b, { x: BODY.x - 1, z, y: deck, w: BODY.w + 2, along: 'x', pitch: PITCH });
    }
    for (const x of [BODY.x - 1, RIGHT + 1]) {
      balustrade(b, { x, z: BODY.z - 1, y: deck, w: BODY.d + 2, along: 'z', pitch: PITCH });
    }
    const poolX = POOL.x + POOL.w - 1;
    const poolZ = POOL.z + POOL.d - 1;
    for (let x = POOL.x; x <= poolX; x++) {
      for (let z = POOL.z; z <= poolZ; z++) {
        if (x === POOL.x || x === poolX || z === POOL.z || z === poolZ) {
          b.box(x, x, eaves, eaves + 1, z, z, PALETTE.stone.light);
          continue;
        }
        b.del(x, eaves, z);
        b.set(x, eaves - 1, z, PALETTE.water.base);
      }
    }

    // The stair and lift house: a whitewashed box on the terrace under a slate
    // lid. A roof this long with nothing standing on it reads as a lid, and a
    // block of five storeys has to come up onto its roof somewhere.
    const lid = stuccoWall(b, { ...STAIR_HOUSE, y: deck, storeys: 1, skirting: 0 });
    flatRoof(b, { ...STAIR_HOUSE, y: lid, parapet: 1 });
    doorway(b, { face: 'x-', at: STAIR_HOUSE.x, along: STAIR_HOUSE.z + 7, y: deck, w: 4, h: 9 });

    // Planting at the entrance and nowhere else, the roof terrace included: the
    // lane spends its one piece of high-frequency detail on the way in.
    for (const x of [LOGGIA.x - 5, LOGGIA.x + LOGGIA.w + 3]) {
      pottedPlant(b, { x, z: brink + 1, y: ground });
    }
    for (const x of [LOGGIA.x - 12, LOGGIA.x + LOGGIA.w + 8]) {
      flowerBox(b, { x, z: brink + 1, y: ground, w: 6, along: 'x' });
    }
  },
});
