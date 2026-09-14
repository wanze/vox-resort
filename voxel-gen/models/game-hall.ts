/**
 * Open games hall: a whitewashed pavilion whose front is an arcade of three
 * round-headed bays, so the machines inside are on show — a row of cabinets
 * stood in the outer two bays, a second row down the back wall, a pool table
 * and an air hockey table in the middle and a prize counter down one side —
 * under a flat slate roof with a neon band round its eaves and a lit sign box
 * standing over the entrance.
 * 64x64x24 (16x16 m plot, a 14x11 m hall 3 m to the eaves, 6 m to the top of
 * the sign), a 4x4 tile. The open front faces +z.
 *
 * It was a 10x8.5 m hall on 3x3 tiles — 85 m², a games room rather than an
 * arcade. At 150 m² the front takes five bays instead of three, and the room has
 * space for a third table and a proper prize counter.
 *
 * Drawn from `docs/references/arcade.jpg` read back into the lane: the
 * reference is a cream box with a grey flat roof, red neon under the eaves and
 * lit sign boxes over its shopfronts, which is a games hall this resort can
 * own. The model it replaces was drawn before the palette — indigo walls, a
 * near-black roof, a glass front with three neons dithered along it — so it
 * read as a nightclub dropped into a Mediterranean resort, and every one of its
 * twenty colours was its own. See `docs/art-direction.md`.
 *
 * Two things carry the reference across the gap. The front is an `arcade`, the
 * same part the villa and the hotel stand on, which is what makes a games hall
 * belong here at all and what makes it open: you look through the arches at the
 * screens rather than at a painted glass front. And the light is spent in three
 * places only — the band at the roofline, the sign over the entrance, and the
 * screens themselves, which are inside — because neon on every surface is what
 * made the old model dark: a colour only reads as lit next to something that is
 * not.
 *
 * The hall is genuinely hollow, which is the one cost the model chooses: the
 * mesher meshes the inside surfaces too, so a room is dearer than the solid
 * body `wall.ts` recommends. It is also the whole point of the model, and the
 * shell is carved rather than assembled from three slabs so the corners keep
 * their quoins.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

/** The three things that are lit after dark, and nothing else is. */
const NEON = PALETTE.bloom.light;
const SIGN = PALETTE.amber.light;
const SCREEN = PALETTE.water.light;

const PLOT = 64;
const BODY = { x: 4, z: 5, w: 56, d: 44 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

/**
 * The open front. An odd count of bays centres one, and the run is only two
 * voxels deep — half what the villa's veranda piers are — because depth here is
 * a tunnel: every voxel of reveal is a voxel of the opening the soffit hides
 * from a camera looking down at it, and what is behind these arches is the
 * model.
 */
const ARCADE = { z: FRONT - 1, d: 2, bays: 5 } as const;
/** The room, carved out of the body: the shell is what is left round it. */
const HALL = { x: 7, x1: 56, z: 8, z1: FRONT - 2 } as const;

/**
 * How far the roof oversails. One voxel rather than the two the pitched roofs
 * take, for the same reason the arcade is thin: two layers of eave hang over
 * two layers of opening at the angle the resort is looked at.
 */
const OVERHANG = 1;

/** The two tables, across the room from the centre bay that looks in at them. */
const TABLES = { z: 34, z1: 40 } as const;

/** The sign box on the parapet, centred on the middle bay. */
const BOARD = { x: 24, x1: 39, y: 19, y1: 23 } as const;

export default defineModel({
  id: 'game-hall',
  label: 'Game Hall',
  category: 'leisure',
  tiles: { x: 4, z: 4 },
  emissive: [NEON, SIGN, SCREEN],
  windows: WINDOW_GLASS,
  // Two lamps down the middle of the room, the front one a little forward of
  // the tables, so after dark the hall spills onto its own forecourt.
  lights: [
    { x: 32, y: 11, z: 34, color: SIGN, intensity: 90, distance: 52 },
    { x: 32, y: 11, z: 16, color: SIGN, intensity: 70, distance: 40 },
  ],
  venue: {
    role: 'activity',
    satisfies: [{ need: 'fun', amount: 0.8 }],
    capacity: 24,
    dwellSeconds: { min: 1200, max: 3600 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stone, stucco, slate, metal, teak, foliage, bloom } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    // The arcade repaints the front strip of the body and carves its bays
    // through it, and comes out on the same course the wall does.
    const cornice = arcade(b, {
      x: BODY.x,
      z: ARCADE.z,
      w: BODY.w,
      d: ARCADE.d,
      y: ground,
      along: 'x',
      bays: ARCADE.bays,
      pier: 3,
      // Nine clear layers under a rise of two, which is the twelve a storey is
      // and a 2.25 m opening: an arch that springs low enough to read as an
      // arch on the villa reads as a slot on a hall you are meant to see into.
      height: 9,
      rise: 2,
    });
    if (cornice !== eaves) throw new Error('The arcade and the wall must reach the same eaves');
    // The strip it repaints includes the body's two front quoins, so those go
    // back on over it.
    for (const x of [LEFT, RIGHT]) box(x, x, ground, eaves - 2, FRONT, FRONT, stucco.light);

    // The room. Cleared up to the cornice, which stays as the ceiling.
    for (let x = HALL.x; x <= HALL.x1; x++) {
      for (let z = HALL.z; z <= HALL.z1; z++) {
        for (let y = ground; y <= eaves - 2; y++) b.del(x, y, z);
      }
    }
    // A hard floor, laid over the plinth rather than standing on it. Pale,
    // because a dark floor is what turns an open front into a cave mouth.
    box(HALL.x, HALL.x1, ground - 1, ground - 1, HALL.z, HALL.z1, stone.shade);

    flatRoof(b, { ...BODY, y: eaves, overhang: OVERHANG, parapet: 2, cover: slate });
    // The neon, on the fascia of the roof slab: the parapet stands directly
    // over it rather than out past it, so the band is not in its own shadow.
    const xLo = BODY.x - OVERHANG;
    const xHi = RIGHT + OVERHANG;
    const zLo = BODY.z - OVERHANG;
    const zHi = FRONT + OVERHANG;
    box(xLo, xHi, eaves, eaves, zLo, zLo, NEON);
    box(xLo, xHi, eaves, eaves, zHi, zHi, NEON);
    box(xLo, xLo, eaves, eaves, zLo, zHi, NEON);
    box(xHi, xHi, eaves, eaves, zLo, zHi, NEON);

    // The sign box, standing on the front parapet: a lit panel in a metal case.
    box(BOARD.x, BOARD.x1, BOARD.y, BOARD.y1, zHi, zHi, metal.base);
    box(BOARD.x + 1, BOARD.x1 - 1, BOARD.y + 1, BOARD.y1 - 1, zHi, zHi, SIGN);

    // Windows all the way round, and big ones: a hall is seen from three sides
    // and glazed on all of them in the reference, so a pair of cottage windows
    // on an elevation this long would read as the back of the building.
    for (const along of [10, 22, 34]) {
      for (const [face, at] of [
        ['x-', LEFT],
        ['x+', RIGHT],
      ] as const) {
        shutteredWindow(b, { face, at, along, y: ground + 3, w: 8, h: 7, shutters: false });
      }
    }
    for (const along of [10, 24, 38, 50]) {
      shutteredWindow(b, {
        face: 'z-',
        at: BODY.z,
        along,
        y: ground + 3,
        w: 8,
        h: 7,
        shutters: false,
      });
    }

    // Two vents on the roof. The field of a flat roof is a third of what the
    // resort sees of this building, and an empty one reads as a lid.
    const deck = eaves + 1;
    for (const [x, z] of [
      [9, 9],
      [45, 13],
      [25, 30],
    ] as const) {
      box(x, x + 4, deck, deck + 1, z, z + 3, slate.shade);
      box(x, x + 4, deck + 2, deck + 2, z, z + 3, metal.base);
    }

    /**
     * One machine: a cased column with a hood over it, a control shelf and a
     * lit screen on the side it faces. Two voxels square is 50 cm, against the
     * 70 a real cabinet is — three would put a pool table's worth of machine in
     * the room — and eight layers is the 2 m the arches are clear to.
     */
    const cabinet = (x: number, z: number, faces: 'z+' | 'x+', screen: Color): void => {
      box(x, x + 1, ground, ground + 6, z, z + 1, metal.base);
      box(x, x + 1, ground + 7, ground + 7, z, z + 1, metal.deep);
      const [x0, x1] = faces === 'x+' ? [x + 1, x + 1] : [x, x + 1];
      const [z0, z1] = faces === 'z+' ? [z + 1, z + 1] : [z, z + 1];
      box(x0, x1, ground + 3, ground + 3, z0, z1, teak.base);
      box(x0, x1, ground + 4, ground + 6, z0, z1, screen);
    };

    // Where the machines go is set by what can be seen of them. A row stood
    // against the back wall is 7 m behind the arches and invisible from any
    // angle the resort is viewed at, so the row that carries the model stands
    // immediately inside the two outer bays, facing out through them; the back
    // wall gets a second, dimmer row for the room to have a depth at all.
    const screens = [SCREEN, NEON, SIGN];
    for (const [i, x] of [8, 11, 19, 22, 40, 43, 50, 53].entries()) {
      cabinet(x, HALL.z1 - 1, 'z+', screens[i % screens.length]!);
    }
    for (const [i, x] of [12, 16, 20, 24, 28, 32, 36, 40, 44].entries()) {
      cabinet(x, HALL.z, 'z+', screens[(i + 2) % screens.length]!);
    }
    for (const [i, z] of [12, 16, 20, 24, 28].entries()) {
      cabinet(HALL.x, z, 'x+', screens[(i + 1) % screens.length]!);
    }

    // The prize counter down the right-hand wall.
    box(51, HALL.x1, ground, ground + 2, 12, 30, teak.shade);
    box(51, HALL.x1, ground + 3, ground + 3, 12, 30, stone.light);

    /**
     * A table: a timber body, a rail round the top and a playing surface inside
     * it. Both of them stand in the middle of the room rather than against a
     * wall, which is where the centre bay looks: the bay is the way in, so it is
     * the one opening nothing can be parked in front of, and a hall you can see
     * the floor of through it is a hall that reads as empty.
     */
    const table = (x: number, x1: number, rail: Color, surface: Color): void => {
      box(x, x1, ground, ground + 2, TABLES.z, TABLES.z1, teak.shade);
      box(x, x1, ground + 3, ground + 3, TABLES.z, TABLES.z1, rail);
      box(x + 1, x1 - 1, ground + 3, ground + 3, TABLES.z + 1, TABLES.z1 - 1, surface);
    };
    table(12, 20, metal.base, stucco.light);
    table(26, 36, teak.base, foliage.shade);
    table(40, 50, teak.base, foliage.shade);
    // The halfway line of the air hockey table, which is one course across it
    // rather than a pattern painted over it.
    box(13, 19, ground + 3, ground + 3, TABLES.z + 3, TABLES.z + 3, bloom.base);

    // The forecourt: a darker apron up to the middle bay, planting either side.
    box(22, 41, ground - 1, ground - 1, FRONT + 1, PLOT - 2, stone.shade);
    for (const x of [8, 53]) pottedPlant(b, { x, z: FRONT + 2, y: ground });
    for (const x of [LEFT, 51]) flowerBox(b, { x, z: PLOT - 4, y: ground, w: 9, along: 'x' });
  },
});
