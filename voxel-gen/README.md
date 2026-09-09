# voxel-gen

Hand-authored voxel models: you describe an object in code (place coloured cubes
on an integer grid) and get a real object in the resort plus an isometric preview
PNG you can eyeball without opening a browser.

The app imports these same files — `src/features/catalog/domain/objectTypes.ts`
builds every model in `models/index.ts` — so there is exactly one copy of the
art. The preview renderer is dependency-free: a small z-buffered rasteriser and a
from-scratch PNG encoder, no three.js.

Ported from the `costa-sole` project. The GLB exporter it also carried is gone:
objects reach the screen through the voxel pipeline in `src/`, not as glTF files.

## Run

Needs Node 22.18+ (native TypeScript type stripping — no build step).

```bash
pnpm preview                 # every model -> voxel-gen/out/<id>.png
pnpm preview bungalow hotel  # just these
pnpm preview --sheet         # one contact sheet of all models
pnpm preview --audit         # size table: does each model fill its tiles?
```

Outputs land in `voxel-gen/out/` (git-ignored); `VOXELGEN_OUT` overrides it.

## Add or change a model

Copy a file in `models/` and edit it, then add it to `models/index.ts`. A
building is a composition of parts from `parts/`, painting in colours from
`palette.ts`, and it reads as a description rather than as arithmetic:

```ts
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 2, z: 2, w: 28, d: 36 } as const;
const FRONT = BODY.z + BODY.d - 1;

export default defineModel({
  id: 'my-asset',
  label: 'My Asset',
  // Shelf of the build palette it is offered on: see MODEL_CATEGORIES.
  category: 'amenities',
  tiles: { x: 2, z: 3 },
  build: (b: VoxelBuilder) => {
    // Each part hands back the first free layer above it, so a building stacks.
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'z' });

    doorway(b, { face: 'z+', at: FRONT, along: 14, y: ground });
    steps(b, { x: 13, z: FRONT + 1, w: 6, y: ground, descends: 'z+' });
    shutteredWindow(b, { face: 'z+', at: FRONT, along: 6, y: ground + 4 });
    for (const x of [10, 20]) pottedPlant(b, { x, z: FRONT + 2, y: ground });
  },
});
```

Anything the parts do not cover is still painted by hand on the builder:

```ts
b.set(x, y, z, PALETTE.teak.base); // one voxel
b.box(x0, x1, y0, y1, z0, z1, PALETTE.stone.base); // an inclusive box
b.del(x, y, z); // remove one, e.g. carving a recess
```

**Colours come from `palette.ts` and nothing else** — 14 materials, each a
four-step ramp, and a unit test fails a model that paints anything outside it.
`docs/art-direction.md` is what the palette and the parts are for, which
reference each model is drawn from, and which models still have their style pass
to come.

`category` is what groups the object in the app's build palette — `grounds`,
`lodging`, `amenities` or `leisure`, declared in `MODEL_CATEGORIES` in
`voxelgen.ts`. It is a fact about the art, which is why it is declared with the
art: a new model shows up on the right shelf without the app being touched.

## Glowing and lighting

Two optional fields let a model take part in the day/night cycle. Both are in the
model's own coordinates, so wherever the object is placed the light lands in the
right spot.

```ts
const GLOW = 0xffe3a3;

export default defineModel({
  id: 'my-lamp',
  label: 'My Lamp',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Colours drawn unlit at full brightness, so they still read after dark.
  emissive: [GLOW],
  // Point lights the scene may switch on at night.
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b: VoxelBuilder) => {
    /* ... */
  },
});
```

`emissive` costs nothing — the glowing colours are split into a second geometry
that shares one unlit material across the whole scene. `lights` is not free: the
scene keeps a small pool of real point lights and aims it at the anchors nearest
the camera, so a model that declares a light is competing for that pool. Declare
one for something that genuinely lights its surroundings (a lamp, a torch, a pool
flood), not for every lit window.

A light needs no voxel behind it — the swimming pool declares two submerged
floods that nothing paints.

## Scale

**One tile is `TILE_VOXELS` (16) voxels and stands for 4 m.** Everything follows
from that:

| Real thing        | Voxels  |
| ----------------- | ------- |
| 1 m               | 4       |
| a storey (3 m)    | 12      |
| a doorway (2.1 m) | 8–9     |
| a tile (4 m)      | 16      |
| a tennis court    | 95 x 44 |

Pick a model's `tiles` from what the object really measures — a snack kiosk is
8 x 4 m (2x1), a resort villa's plot is 16 x 16 m (4x4), a hotel block 24 x 16 m
(6x4) — then draw it to fill that footprint edge to edge. Heights follow the same
rule: a four-storey hotel is 4 x 12 voxels of wall, not whatever looks tall.

Conventions:

- **Y is up**; a voxel at `(x, y, z)` fills the unit cube `[x, x+1]^3`; colours
  are packed `0xRRGGBB`; later writes to a cell win.
- **Fill the footprint.** The model must fit inside the `tiles` it claims — a
  unit test enforces that — and `--audit` reports how much of it the model
  actually fills. A model well under 100% is drawn at a smaller scale than its
  neighbours, which is what makes a resort look wrong once everything is placed.
  Every model in the catalogue is currently at 100%, and new ones should be too;
  the usual way to get there is to run the object's ground platform out to the
  full footprint and let the structure sit on it.
- **Keep bodies solid.** It is tempting to hollow a large building out to save
  voxels, but the mesher only culls faces between two solid voxels: a cavity
  gets its own inside surface, so hollowing roughly doubles a building's
  triangles while saving voxels nobody has to draw. Solid is cheaper to render.
- **Colours are flat and unlit.** The app shades them with its own lights, so
  never bake highlights or shadows into a colour — a ramp's `shade` is for a part
  that is a different material, not for a face that faces away from the sun.
- **Never dither a pattern across a face.** The mesher merges coplanar faces of
  one colour into rectangles, so a checkerboard wall costs more triangles than a
  hotel. See `docs/art-direction.md`.
- Every distinct colour in the catalogue becomes one DVE voxel and one rendered
  material, so reusing a colour across models is free — and the catalogue may
  hold **250 of them in total**, because DVE writes a submesh's material as a
  byte. That ceiling is why the palette is enforced.

An object also needs somewhere to stand: add it to `RESORT_PLAN` in
`src/features/layout/domain/resortPlan.ts`, or the layout tests will fail. It
does not need a path drawn to it — the layout grows a spur from every object to
the nearest street — but it does need a free tile for that spur to run through.

A type may be placed as many times as you like; each placement becomes one more
instance of the same geometry, which is nearly free.

`model-prompts.md` holds the original text prompts each model was authored from,
plus the dimension table they were specified against.
