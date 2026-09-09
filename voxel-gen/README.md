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

Copy a file in `models/` and edit the geometry, then add it to
`models/index.ts`. The shape of a model:

```ts
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'my-asset',
  label: 'My Asset',
  // Shelf of the build palette it is offered on: see MODEL_CATEGORIES.
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b); // set(x, y, z, 0xRRGGBB)
    const box = b.box.bind(b); // box(x0, x1, y0, y1, z0, z1, color) — inclusive
    const del = b.del.bind(b); // remove a voxel, e.g. carving a recess

    box(0, 31, 0, 0, 0, 31, 0xc9c2b4); // a 2x2 tile stone slab
  },
});
```

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
  never bake highlights or shadows into a colour.
- Every distinct colour in the catalogue becomes one DVE voxel and one rendered
  material, so reusing a colour across models is free — inventing near-duplicate
  shades is not.

An object also needs somewhere to stand: add it to `RESORT_PLAN` in
`src/features/layout/domain/resortPlan.ts`, or the layout tests will fail. It
does not need a path drawn to it — the layout grows a spur from every object to
the nearest street — but it does need a free tile for that spur to run through.

A type may be placed as many times as you like; each placement becomes one more
instance of the same geometry, which is nearly free.

`model-prompts.md` holds the original text prompts each model was authored from,
plus the dimension table they were specified against.
