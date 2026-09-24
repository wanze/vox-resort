import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 48, d: 48 } as const;

const BODY = { x: 4, z: 3, w: 40, d: 22 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const SLAB = 3;

const HATCH = { along: 18, w: 12, h: 6 } as const;

// Staggered: the rows are closer together than a pair of chairs is deep.
const ROWS = [
  { tables: [14, 26, 38], top: 29 },
  { tables: [8, 20, 32, 44], top: 40 },
] as const;

const near = (top: number): number => top - 3;
const far = (top: number): number => top + 5;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'coffee-shop',
  label: 'Coffee Shop',
  category: 'amenities',
  tiles: { x: 3, z: 3 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  // Two courses clear of the parasol canvas, so it pools on the paving between the
  // tables rather than grazing their tops.
  lights: [{ x: 24, y: SLAB + 13, z: 36, color: LANTERN, intensity: 70, distance: 44 }],
  // Seats out of reach of paving go unused by design; `walkNetwork.ts` drops them.
  seats: ROWS.flatMap((row) =>
    row.tables.flatMap((x) => [
      { x, y: SLAB + 2, z: near(row.top), facing: 0 as const },
      { x, y: SLAB + 2, z: far(row.top), facing: 2 as const },
    ]),
  ),
  venue: {
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 0.7 },
      { need: 'energy', amount: 0.2 },
    ],
    capacity: 16,
    dwellSeconds: { min: 600, max: 1500 },
    doors: [{ x: LEFT + 4, z: FRONT, facing: 0 }],
    litter: 0.03,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, glass, slate, stone, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d, height: SLAB });

    // One flat colour: a tile grid painted voxel by voxel costs a quad per tile.
    box(1, PLOT.w - 2, ground - 1, ground - 1, FRONT + 2, PLOT.d - 2, stone.shade);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    // No shutters: this opening has to read as a counter, not a window.
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: HATCH.along,
      y: ground + 3,
      w: HATCH.w,
      h: HATCH.h,
      shutters: false,
    });
    box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      ground + 2,
      ground + 2,
      FRONT,
      FRONT + 1,
      stone.light,
    );

    // Short reach: a deeper canopy would hide the elevation from the camera.
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: HATCH.along - 2,
      w: HATCH.w + 4,
      y: ground + 10,
      reach: 3,
      canvas: bloom,
    });

    for (const x of [HATCH.along - 2, HATCH.along + HATCH.w + 1]) {
      box(x, x, ground + 6, ground + 7, FRONT, FRONT, LANTERN);
      b.set(x, ground + 8, FRONT, teak.shade);
    }

    // Blank because lettering does not fit this grid.
    doorway(b, { face: 'z+', at: FRONT, along: LEFT + 2, y: ground });
    steps(b, { x: LEFT + 1, z: FRONT + 1, w: 6, y: ground, treads: 1, descends: 'z+' });
    box(LEFT + 8, LEFT + 10, ground + 3, ground + 7, FRONT, FRONT, slate.deep);

    for (const along of [BODY.x + 8, BODY.x + 28]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 4 });
    }
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: BODY.z + 9, y: ground + 4 });
    }

    box(BODY.x + 4, RIGHT - 4, ground + 6, ground + 6, BODY.z + 1, BODY.z + 2, glass.base);
    box(BODY.x + 4, RIGHT - 4, ground, ground + 2, BODY.z + 1, BODY.z + 3, teak.shade);

    // The chair is 3x2 voxels, the size of the seated figure. The seat course at
    // ground + 1 puts hips on ground + 2, which is what the model declares.
    const table = (x: number, top: number): void => {
      box(x, x + 1, ground, ground + 2, top + 1, top + 2, teak.shade);
      box(x - 1, x + 2, ground + 3, ground + 3, top, top + 3, teak.light);
      for (const [z, rail] of [
        [near(top), near(top) - 1],
        [far(top), far(top) + 2],
      ] as const) {
        box(x - 1, x + 1, ground, ground + 1, z, z + 1, teak.base);
        box(x - 1, x + 1, ground + 2, ground + 3, rail, rail, teak.base);
      }
      // A seated head is four courses above the hips, so a 2 m canopy clears by two.
      parasol(b, { x, z: top + 1, y: ground });
    };

    for (const row of ROWS) {
      for (const x of row.tables) table(x, row.top);
    }

    for (const x of [2, PLOT.w - 4]) pottedPlant(b, { x, z: FRONT + 3, y: ground });
    for (const x of [BODY.x + 4, BODY.x + 24]) {
      flowerBox(b, {
        x,
        z: BODY.z - 1,
        y: ground,
        w: 12,
        along: 'x',
        blooms: [foliage.base, foliage.light],
      });
    }
  },
});
