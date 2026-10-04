# voxel-gen

Voxel models written in code: place coloured cubes on an integer grid and you
get an object in the resort, plus an isometric PNG preview.

The app imports these files directly (`src/features/catalog/domain/objectTypes.ts`
builds every model in `models/index.ts`), so there is only one copy of the art.
The preview renderer has no dependencies: a small z-buffered rasteriser and PNG
encoder.

## Previews

Needs Node 22.18+ (runs TypeScript natively, no build step).

```bash
pnpm preview                 # every model -> voxel-gen/out/<id>.png
pnpm preview bungalow hotel  # only these
pnpm preview --sheet         # contact sheet of all models
pnpm preview --audit         # how much of its footprint each model fills
pnpm preview --people        # the crowd; --sky for balloons, --sea for boats
pnpm preview --drafts        # models withheld from the app (DRAFT_SOURCES)
pnpm preview --tools --sheet # the build palette's tool pictures
pnpm preview --lineup        # models side by side at one scale, with a person
pnpm preview --variants      # each variant beside the model it would replace
```

Output goes to `voxel-gen/out/` (git-ignored), or `VOXELGEN_OUT` if set.

## Adding a model

Copy a file in `models/`, edit it and add it to `models/index.ts`. A building is
composed from `parts/` and painted from `palette.ts`:

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
  category: 'amenities', // build palette shelf, see MODEL_CATEGORIES
  tiles: { x: 2, z: 3 },
  build: (b: VoxelBuilder) => {
    // Each part returns the first free layer above it, so parts stack.
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

Anything the parts don't cover, paint by hand:

```ts
b.set(x, y, z, PALETTE.teak.base); // one voxel
b.box(x0, x1, y0, y1, z0, z1, PALETTE.stone.base); // inclusive box
b.del(x, y, z); // remove one
```

**Only use colours from `palette.ts`.** A unit test fails any model that paints
outside it. [docs/art-direction.md](../docs/art-direction.md) covers the palette,
the parts and the references.

`category` is one of `grounds`, `lodging`, `amenities`, `leisure`
(`MODEL_CATEGORIES` in `voxelgen.ts`) and decides which shelf of the build
palette the model appears on. `placement` keeps a model on the `beach` or
`shore` and caps how many a generated resort gets (`perResort`). `gateway: true`
marks an entrance where guests arrive and leave.
`nameplate` marks a blank board (`x0`-`x1`, `y0`-`y1`, each face's `surface`
layer and `outward` side, and an `ink` colour) where the app letters the resort's
name; paint the board blank and leave the layer in front of it empty.

To place it on the authored plot, add it to `RESORT_PLAN` in
`src/features/layout/domain/resortPlan.ts`, otherwise the layout tests fail. It
needs a free tile next to it for a path; the layout connects it to the nearest
street.

## Variants

`variants/` holds other styles of catalogue models, each naming the original it
belongs with (`VARIANTS` in `variants/index.ts`). An original and its variants
are a _family_. Variants are in the game: the player picks a style in the build
palette (or lets it roll, except for 1 × 1 models drawn in runs, such as hedges
and lamps), and generated resorts style their neighbourhoods.

A new variant is one entry in `VARIANTS`, and nothing in `src/` changes. It must
pass the family contract in `variants.test.ts`: the same tiles, category,
placement and venue facts as its original. Only the look, the doors, seats,
lights, windows and water may differ. If it needs other sim facts, it is a new
model, not a variant. A variant costs what its original costs, unless it declares
its own `cost`, and the world names it by its family ("Bakery", never
"Bakery B").

Besides `--variants`, `pnpm dev` serves `/compare.html`, which shows each pair in
3D with voxel and triangle counts.

## Glow, lights and water

```ts
const GLOW = 0xffe3a3;

export default defineModel({
  id: 'my-lamp',
  // ...
  emissive: [GLOW], // drawn unlit, so they read after dark
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  water: [PALETTE.water.base], // drawn with the water shader
  build: (b) => {
    /* ... */
  },
});
```

- `emissive` colours get their own unlit geometry. Free.
- `lights` are baked into a light volume at load (`lighting/domain/lightGrid.ts`)
  and cost nothing per frame, only bake time and memory. Use them for things that
  actually light their surroundings (lamps, torches, pool floods), not every lit
  window. A light doesn't need a voxel behind it. Its `x`/`z` name a voxel
  column, as a seat's do, and the light hangs in that column's middle; `y` is a
  plain height.
- `water` faces ripple and reflect like the sea. Paint them in one flat tone.

Positions are in model coordinates, so they follow the object when it's placed.

## Seats

```ts
// Three people on a bench, facing out the front.
seats: [4, 8, 12].map((x) => ({ x, y: 4, z: 7, facing: 0 })),

// One sunbather on a lounger.
seats: [{ x: 7, y: 5, z: 8, facing: 0, pose: 'lie' }],
```

- `x`, `z` is the column the person's **hips** occupy; `y` is the first free
  layer above the seat.
- `facing` is quarter turns from the model's +z, in the direction the **legs**
  point. `0` faces out the front.
- `pose` is `'sit'` (default) or `'lie'`. A lying figure extends four voxels back
  from the hips and three forward.

The crowd uses seats automatically. A seat is only used if there is paving within
one tile of it, except on the beach, where anyone walking on the sand can use it.
`seats.test.ts` checks that every seat has something solid under it, room above
it and space from the next.

## Venues

A model guests can visit declares a `venue`. Decoration (palms, benches, bins)
doesn't.

```ts
venue: {
  role: 'food',
  satisfies: [{ need: 'hunger', amount: 0.5 }],
  capacity: 8,
  dwellSeconds: { min: 240, max: 480 },
},
```

| Field          | Meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `role`         | `lodging`, `food`, `drink`, `activity` or `service`                               |
| `satisfies`    | needs a visit serves (`hunger`, `thirst`, `energy`, `fun`, `hygiene`), each -1..1 |
| `capacity`     | people inside at once; beyond that a queue forms                                  |
| `dwellSeconds` | length of one visit, in simulated seconds                                         |
| `beds`         | lodging only, equal to `capacity`                                                 |
| `doors`        | where guests enter, turned with the building                                      |
| `shelter`      | `'open'` closes in rain; default `'covered'`                                      |
| `sign`         | the icon the app hangs over the door (`SignKind`); default the role's own         |
| `names`        | names the game draws a new venue's from, at most 24 characters; none, its type    |
| `stage`        | an animator can put a show on here                                                |
| `floor`        | seated visitors dance on it in a show, still standing ones cheer where they stand |

A negative `amount` makes a need worse (tennis costs energy). `venues.test.ts`
lists the models deliberately without a venue, so every new model must be one or
the other.

## Sound

A model the player should hear declares `sound`, a `SoundKind` on the model
itself rather than on its venue, since trees and fountains sound too:

```ts
sound: 'cafe',
```

Venues are heard when the camera is zoomed in close to them and they're open in
the weather. `fountain` and `torch` (at night) are heard near them, and `trees`
plays no sound itself: enough trees near the camera bring in birds by day,
crickets at night and cicadas in a heatwave. A variant sounds like its original
and declares nothing. A new `SoundKind` needs a slot in `SLOT_NAMES`
(`src/features/sound/domain/bank.ts`) and the bank (`sounds/bank.ts`); see
`docs/sound.md`.

## Scale

**One tile is 16 voxels (`TILE_VOXELS`) and 4 m.**

| Real thing        | Voxels  |
| ----------------- | ------- |
| 1 m               | 4       |
| a storey (3 m)    | 12      |
| a doorway (2.1 m) | 8–9     |
| a tile (4 m)      | 16      |
| a tennis court    | 95 x 44 |

Size `tiles` from the real object (a snack kiosk is 8 x 4 m, so 2x1; a hotel
block 40 x 20 m, so 10x5) and fill the footprint edge to edge.

## Rules

- **Y is up.** A voxel at `(x, y, z)` fills `[x, x+1]^3`. Colours are `0xRRGGBB`.
  Later writes win.
- **Fill the footprint.** A test enforces that the model fits its `tiles`;
  `--audit` shows how much it fills. Aim for 100%, usually by running the ground
  platform to the edges. An underfilled model looks too small next to its
  neighbours.
- **Keep bodies solid.** Hollow buildings get inside faces and roughly double
  their triangles.
- **No lighting in colours.** The app lights the scene. A ramp's `shade` is for a
  different material, not a shadow.
- **No dithered patterns.** The mesher merges same-colour faces into rectangles,
  so a checkerboard wall costs more than a hotel.
- **At most 250 colours in the whole catalogue** (DVE stores materials as a
  byte). This is why the palette is enforced.

## Models that claim no tile

Besides `models/`, three registries feed the same pipeline: `people/`, `sky/`
(balloons) and `sea/` (boats, buoys). They aren't on the build palette and aren't
placed by the generator. `PAINTED_MODELS` in `objectTypes.ts` joins all of them;
`features/crowd/`, `features/balloons/` and `features/sea/` move them.

Their origin is where they're drawn from: people from their feet, balloons from
the basket, sea models from their waterline (nothing below it is drawn).

`props/` holds the balls and the `wheelchair`, which the crowd field draws under a
seated guest. It is painted at the figure's scale with its seat
`CHAIR_SEAT_VOXELS` up, and reaches as far behind the seat as the footrest does in
front, so centring both on their footprints puts the figure over the seat.

`tools/` holds the build palette's tool pictures (terrain brushes, bulldozer,
land), rendered at 256 px by the default `pnpm preview`. The app finds them by id
through `TOOL_ART` in `features/build/domain/toolArt.ts` and never imports them.

## Paving

Players pick `path` or `staircase` ("Stairs"). The ground decides what a path
becomes: `path` on grass, `boardwalk` on sand, `jetty` on water, and on a terrace
step a ramp where two straight tiles fit below it (`ramp-foot` on the tile before,
`ramp-head` against the step, 1:4), else `stairs`. A `staircase` stays a flight
where it climbs and is flat paving where it does not. The derived kinds declare
`groundDecides` so the palette hides them; `parts/flight.ts` builds the flight,
the ramp courses and the balustrades for all of them, one model a flank
(`stair-railing-left`/`-right`, `ramp-foot-railing-left`/`-right`,
`ramp-head-railing-left`/`-right`) laid along the edge like any rail, so a climb
wider than a tile is railed down its outer flanks only. All paving is two voxels tall
(`PAVING_VOXELS`). A new kind of paving is a model file plus an entry in
`PAVING_IDS`; mosaic ids join it from their registry.

`mosaics/` holds the mosaic paving. A style is one file in `mosaics/styles/`, a
`MosaicStyle` with a field colour, a border, a bed and the north-west quarter of
its pattern, plus an entry in `MOSAIC_STYLES`. `mosaicSources` generates its six
pieces (`single`, `end`, `strip`, `corner`, `edge`, `centre`): the field turned
four-fold, with a two-voxel band of the border along each side the piece
borders. The first style is the family's original and the others its variants;
the pieces are families of their own, hidden by `groundDecides`, and the ids
join `PAVING_IDS` and `DERIVED_IDS` from `MOSAIC_IDS`, so nothing in `src/`
changes for a new style. `pnpm preview --mosaics` stamps `mosaics/sample.ts` in
every style; `meshBudget.test.ts` holds each piece to 128 triangles.

`model-prompts.md` holds the original prompts and dimension table the models were
written from.
