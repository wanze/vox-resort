# Art direction

What every object in the resort is meant to look like, what it is drawn from,
and the two things — a palette and a set of parts — that make forty models look
like one resort rather than forty afternoons.

The companion documents: [voxel-gen/README.md](../voxel-gen/README.md) is the
authoring API and the scale, [rendering.md](rendering.md) is what happens to a
model after it is authored.

## The lane

`docs/references/` holds 22 reference renders, one per family of object, made
with a custom-trained Scenario model from the prompts in
[references/README.md](references/README.md). They are stylized 3D renders, not
voxel art, and they arrived in three distinct styles:

1. **Matte Mediterranean** — `villa.jpg`, `restrooms.jpg`, `tennis-court.jpg`:
   near-flat colour, soft occlusion in the corners, no dramatic light.
2. **Golden hour** — `taverna.jpg`, `tiki-bar.jpg`: the same architecture with
   strong orange sunlight baked into the pixels.
3. **Photoreal tiles** — `grass-kerb.jpg`, `sand.jpg`, `water.jpg`: material
   studies at a resolution this grid cannot reach.

**The resort is lane 1**, and `villa.jpg` is the reference the rest are held
against. That is not only taste. The renderer needs flat unlit albedo and does
its own shading, so lane 2's palette would bake a second sun into the art, and
lane 3 is a texturing problem rather than a modelling one — there is no texturing
at all in this pipeline, by design.

Lanes 2 and 3 stay useful for **massing and dressing**: which way a roof falls,
where the umbrellas and the potted plants go, how a terrace steps down to a
beach. Read them for shape, never for colour.

### What cannot be copied, and is not

One voxel is 25 cm. In the references a roof tile is 3 cm, a chair leg 2 cm and
a potted plant 15 cm across. None of that is expressible here and chasing it is
how a voxel model ends up as noise. What carries the style across the gap is
proportion, silhouette and palette:

- everything stands on its own plinth, with a lip, so a plot reads as a plot;
- roofs overhang the wall they sit on, which is what casts the line of shadow
  that makes a building look built;
- openings are cut **into** the wall rather than painted onto it;
- planting is the only high-frequency detail, and it sits by the entrance.

## The palette

`voxel-gen/palette.ts`. Fourteen materials, each a four-step ramp, 56 colours in
total, and every model has to paint from it — `palette.test.ts` fails a model
that does not.

The problem it solves was measurable rather than aesthetic. Authored one file at
a time, the catalogue reached **234 distinct colours, 137 pairs of which were
within 12 of each other** on the channel sum: twelve buildings meant twelve
almost-but-not-quite creams, and no two roofs agreed on what terracotta is.

The rules, all of them enforced or explained in the module:

- **A colour is an albedo.** Flat, unlit, no highlight and no shadow baked in.
  The scene shades it, and a face painted lighter to fake the sun is wrong from
  the other three sides. The reference renders are lit, so each base was read
  off the least shaded large face of its material and taken back to a mid tone.
- **A ramp is for material, not for light.** Reach for `shade` when a part is
  genuinely something else: a kerb against paving, an eave course against roof
  tile, a shutter against render.
- **Inside a family, tones are close; across families they are not.** The test
  holds every cross-family pair more than 17 apart, which is where the old
  near-duplicates lived.
- **A new family is a deliberate act.** Each one is four more DVE voxels and
  four more rendered materials. Prefer a step of a ramp that exists.

### There is a hard ceiling on colours

DVE writes a submesh's material as a **Uint8** and registers six materials of
its own ahead of ours, so the catalogue may hold **250 colours**. The 251st wraps
onto `dve_solid` and the mesher hands its faces back under a material nothing in
this codebase has heard of — no error, just geometry in the wrong colour. It is
probed and pinned by a test in `catalog/domain/objectTypes.test.ts`.

The catalogue sat at 234 of those 250 before the palette existed, which is the
practical argument for the palette: detail has to be able to grow, and colours
are the budget that runs out first. Every model that has its style pass hands
its private shades back — the seven passed over so far took the catalogue from
255 to 230 — and the end state is a catalogue that paints in 56.

## The parts

`voxel-gen/parts/`. A model is a composition of parts, and a part is a pure
function that paints into the builder and hands back the first free layer above
what it drew, so a building stacks:

```ts
const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
gableRoof(b, { ...BODY, y: eaves, ridge: 'z' });
doorway(b, { face: 'z+', at: FRONT, along: 14, y: ground });
```

| Part                   | What it draws                                              |
| ---------------------- | ---------------------------------------------------------- |
| `ground.plinth`        | the slab a plot stands on, lipped round its top edge       |
| `ground.steps`         | a flight at 1 voxel of rise to 2 of going                  |
| `wall.stuccoWall`      | a solid body with skirting, string course, quoins, cornice |
| `wall.shutteredWindow` | a pane recessed a voxel, with sill, lintel and shutters    |
| `wall.doorway`         | a leaf recessed into a stone frame                         |
| `roof.gableRoof`       | a pitched roof with a ridge and two gables                 |
| `roof.hipRoof`         | a roof falling away on all four sides                      |
| `roof.flatRoof`        | a slab with a parapet, for the utility buildings           |
| `roof.thatchRoof`      | a steep hipped palm roof with a pole over its ridge        |
| `veranda.arcade`       | piers with round arches cut between them, under a cornice  |
| `veranda.balustrade`   | balusters between a bottom rail and a coping               |
| `pool.poolWater`       | a basin sunk into a deck, rimmed with coping and filled    |
| `props.pottedPlant`    | greenery in a rimmed terracotta pot                        |
| `props.flowerBox`      | a planter, flowering or green                              |

Every part takes explicit voxel dimensions and defaults its materials from the
palette, so a model reads as intent rather than as arithmetic, and a change to
`gableRoof` improves every roof at once. They are unit-tested next to
themselves, because they are pure — `vite.config.ts` includes
`voxel-gen/**/*.test.ts` for exactly that.

Openings are written once for all four faces: `faceCell` in `wall.ts` maps a
face plus a position across it and a depth into it onto a voxel, which is why
`shutteredWindow` needs no variant per side.

### Not parts yet

The next passes want, roughly in this order: `pergola`, `awning` and `deck`.
They are deliberately not written until a model needs them — speculative parts
are dead code, and `pnpm fallow:audit` says so. `arcade`, `balustrade` and
`thatchRoof` came off this list with the lodging pass and `poolWater` with the
pool, which is the order it is meant to work in: a model asks for a part, not
the other way round. `poolWater` was written when one model wanted three
basins, which is the moment a shape stops being a drawing and becomes a part.

## Water is a shader, not a colour

`PALETTE.water` is an albedo like every other family, and painted as one it
reads as flat blue next to a sea that swells, glints and goes orange at dusk.
So a model may declare which of its colours are water:

```ts
water: [PALETTE.water.base],
```

Those faces are meshed into a geometry of their own and drawn with the sea's
shader at pool scale — see `rendering/adapters/poolWaterMaterial.ts`, and
`waterSurface.ts` for the part the two share. Three things follow for the art:

- **One tone, no ripples painted in.** The shader supplies the movement; a
  second blue dithered across the surface would defeat the merge and fight the
  waves. `swimming-pool` paints 3 189 voxels of water in exactly one colour.
- **The albedo still matters.** It is what the shader starts from, so a
  paddling pool and a lagoon can be different blues off the one material.
- **A declared colour is water everywhere in that model.** Not a shade of it, a
  colour — the shower's stream is `water.light` precisely so that it stays a
  painted surface.

## Rules that hold whatever else changes

- **Fill the footprint.** A model must fit inside the tiles it claims and should
  fill them; `pnpm preview --audit` reports it. A model well under 100% is drawn
  at a smaller scale than its neighbours, which is what makes a resort look
  wrong once everything is standing next to each other.
- **Scale is not negotiable.** 16 voxels to a 4 m tile, 12 to a storey, 8 to an
  elevation level. See `voxel-gen/README.md`.
- **Never dither a pattern across a face.** This is the one performance rule
  authoring has to know, and it is not a small effect. The mesher merges
  coplanar faces of one colour into maximal rectangles, so cost is the number of
  flat single-coloured rectangles, not the number of voxels:

  | model                              | voxels  | triangles | per tile |
  | ---------------------------------- | ------- | --------- | -------- |
  | `hotel`, plain walls, before       | 246 147 | 2 706     | 113      |
  | `bungalow`, dithered walls, before | 6 070   | 5 440     | 1 360    |
  | `bungalow`, the same hut, after    | 9 460   | 1 076     | 269      |

  The hotel was forty times the old bungalow's voxels and half its triangles. A
  checkerboard, a woven texture or a tile grid painted voxel by voxel across a
  wall defeats the merge completely. Where a surface wants variation, give it
  geometry — a course, a recess, a band — or leave it to the shader: the third
  row is that hut redrawn with a sill course and a plate instead of a weave, and
  it is a bigger, more detailed model for a fifth of the triangles.

- **Detail is cheap; detail multiplied by placements is not.** Per-frame cost is
  a model's triangles times the number of times it stands on the plot. The style
  pass added about 270 triangles to each building it touched, which is nothing
  for a hotel placed four times. The same 270 on `path`, which is laid on 2 530
  tiles, would be 680 k.

## The loop

```bash
pnpm preview --sheet    # every model on one contact sheet, to compare
pnpm preview cottage    # one model, after changing it
pnpm preview --audit    # footprint fill, and voxel counts
pnpm test               # the palette, the parts, the catalogue, the layout
pnpm bench              # the frame, once a pass touches something mass-placed
```

Work in **family passes**, not model by model: all the roofs in one sitting,
then the walls and openings, then the ground, then the props. Comparing twelve
roofs against each other is what keeps them consistent; comparing one roof
against a reference is how the drift started.

## Where the passes have got to

| Pass                                                     | State                                     |
| -------------------------------------------------------- | ----------------------------------------- |
| Palette, and the parts to compose a building             | done                                      |
| `cottage`, `house`, `restrooms`, `first-aid`             | done                                      |
| `villa`, `hotel`, `bungalow` — the lodging range         | done                                      |
| `swimming-pool` — the pool terrace, and `poolWater`      | done                                      |
| `restaurant`, `resort-bar`, `poolside-bar`, `beach-club` | next; wants `pergola`, `awning`, `deck`   |
| `waterpark`                                              | wants the pool pass's `poolWater`         |
| The 1×1 props, and the ground tiles                      | last: cheapest to change, and mass-placed |

Every id still on the exempt list in `voxel-gen/palette.test.ts` is a model that
has not had its pass. The list only ever shrinks.
