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
its private shades back — the fourteen passed over so far took the catalogue
from 255 to 176 — and the end state is a catalogue that paints in 56.

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
| `wall.awning`          | a flat blind cantilevered off a wall, with a valance       |
| `roof.gableRoof`       | a pitched roof with a ridge and two gables                 |
| `roof.hipRoof`         | a roof falling away on all four sides                      |
| `roof.flatRoof`        | a slab with a parapet, for the utility buildings           |
| `roof.thatchRoof`      | a steep hipped palm roof with a pole over its ridge        |
| `veranda.arcade`       | piers with round arches cut between them, under a cornice  |
| `veranda.balustrade`   | balusters between a bottom rail and a coping               |
| `pool.poolWater`       | a basin sunk into a deck, rimmed with coping and filled    |
| `props.pottedPlant`    | greenery in a rimmed terracotta pot                        |
| `props.flowerBox`      | a planter, flowering or green                              |
| `props.parasol`        | one flat square of canvas on a pole, with a finial         |

Every part takes explicit voxel dimensions and defaults its materials from the
palette, so a model reads as intent rather than as arithmetic, and a change to
`gableRoof` improves every roof at once. They are unit-tested next to
themselves, because they are pure — `vite.config.ts` includes
`voxel-gen/**/*.test.ts` for exactly that.

Openings are written once for all four faces: `faceCell` in `wall.ts` maps a
face plus a position across it and a depth into it onto a voxel, which is why
`shutteredWindow` needs no variant per side.

### Not parts yet

**The list is empty.** Parts are deliberately not written until a model needs
them — speculative parts are dead code, and `pnpm fallow:audit` says so.
`arcade`, `balustrade` and `thatchRoof` came off this list with the lodging
pass, `poolWater` with the pool, `parasol` with the beach club and `awning`
with the supermarket, which is the order it is meant to work in: a model asks
for a part, not the other way round. `poolWater` was written when one model
wanted three basins, which is the moment a shape stops being a drawing and
becomes a part.

`awning` was the last name on it, and the supermarket is the model that had
one. It is worth saying what the check that comes first turned up, because it
is the check that removed the previous entry without writing anything.
`flatRoof` is the near miss: it lays a slab, it takes any ramp, and a blind is
a slab. It is still not one. A roof oversails a footprint by the same overhang
on all four sides where a blind stands out from exactly one, and the lip it can
draw is a parapet standing **up** round its edge where a blind's valance hangs
**down** at its brink — and the valance is the part that matters, because a
canopy one voxel thick seen from 30 degrees above is a coloured rectangle lying
on the air. So it is a part, and it is drawn where the produce is rather than
over the glazing: see the pergola below, which is the same lesson from the
other end.

The restaurant pass tried `pergola` and gave it back, which is the same rule
read the other way. A written and tested `pergola` — posts, beams and rafters
over the taverna terrace — made the model worse from the only angle the resort
is ever seen at: the terrace is in the foreground of a camera looking down at
30 degrees, so a frame two thirds of the building's height standing in front of
it hides the arcade the pass was for. The terrace wanted a **parasol** instead,
which the reference had all along, and it was then drawn by hand in two models —
`swimming-pool` and `restaurant`, the same tone of `amber` on the same teak
pole. The beach club wanting a third was the `poolWater` moment, so `parasol` is
now a part in `props.ts` and all three models call it. Both bars do too, since
their pass: five of the catalogue's models put up the same canvas.

`deck` came off the list without being written, which is the third way an entry
leaves it: the beach club **is** a deck, and its deck turned out to be
`plinth` handed `PALETTE.teak`. A plinth is a slab with a darker lip round its
top edge, which is exactly a boarded deck with a skirt, so the part that was
wanted already existed under another name. Before writing a part, check whether
one of the fifteen above is it in a different material.

The lesson is worth keeping separately from the part: **anything tall standing
between the camera and a building's front is a thing the building loses.** The
villa can carry an arcade because a terrace is over it rather than in front of
it; a one-storey pavilion cannot carry anything at all on its terrace above
about a metre.

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

  The restaurant pass is the same trade a third time. Its terrace was paved in
  a two-tone checker and its four parasols were built as stepped domes of two
  alternating reds; redrawn as one flat course of paving and four flat squares
  of canvas, the model gained 900 voxels — a whole arcaded dining room, hollow
  and furnished — and came out **5 378 triangles a placement cheaper**, which
  over its nine placements took 48 k triangles off the overview frame.

  The beach club had both faults at once and paid the same price for them: a
  deck checkerboarded voxel by voxel over 3 000 cells and four parasols of
  stepped rings made a 26 000-voxel deck cost more triangles than the hotel's
  221 000. Redrawn as one flat deck and four flat canopies, with a thatched bar,
  a lounge, seven daybeds, a lit bar and a beach added on top of that, it came
  out at the same voxel count and **5 192 triangles a placement cheaper** — 47 k
  off the overview frame again, from nine placements again. Two models, the same
  two mistakes, the same 5 k each: this is what a dithered plane costs, every
  time.

  The supermarket had all three at once and is the other end of the same scale.
  Its storefront was highlighted `(x + y) % 4` across a 56x14 pane, its blind's
  front lip alternated `x % 2` over 62 voxels and each of its five crates laid
  three fruits `(dx + dz + i) % 3` across a 4x4 top: three surfaces that were
  **three quarters of the whole model's triangles**, the largest share of a
  model yet. Flat, they take it from 1 576 triangles to 372. What it came out
  at is 762 — the difference is the pass itself, which spent about a third of
  what the dither gave back on a plinth, a `stuccoWall` with its skirting and
  cornice, openings cut into the render instead of painted on it, a blind, six
  crates, a roof deck and its planting. Net, `pnpm bench` took **6 624
  triangles off the overview frame** over its nine placements — 736 a
  placement — for a far better shop.

  The two bars are the same trade at the two ends of one family, and the
  resort bar is the largest share of a model a single plane has ever taken.
  Its deck was checkerboarded `(x + z) % 2` across 44x28 cells — 1 052 of the
  model's 1 567 quads, **two thirds of the whole model on one surface** — and
  its bottle shelf laid 40 bottles `(x + y) % 3` shoulder to shoulder down one
  run. Flat, the two take a scratch build from 3 062 triangles to 1 084; what
  it came out at is 1 216, and the difference is a servery, three parasol
  tables and a thatched roof where the model had had a light rail. `pnpm bench`
  read the balance as **19 778 triangles off the overview frame** — 1 798 a
  placement over the eleven placements that make it the most-placed building in
  the catalogue, and the largest saving any pass has taken.

  The poolside bar is the case worth keeping separately, because its fault was
  not a plane at all. Its counter was a crescent found with `Math.hypot` and
  slatted `Math.floor(ang / (PI / 24)) % 2` in two browns around its own arc. A
  curve on a 25 cm grid is already a staircase, and a two-tone curve is a
  staircase no two treads of which share a colour — the dithering rule applied
  to the one surface in a model that had no flat plane to merge into in the
  first place. Redrawn straight, from the same parts as its sibling, it came
  out at 870 triangles against 1 366 and gave back **3 480 triangles over six
  placements**, 580 each. It is the smaller number and the plainer lesson: a
  shape this grid cannot draw costs the same as a pattern it cannot merge.

  That is the useful shape of the cases together: what a dithered plane
  costs is roughly fixed per plane, so the saving is set by how many planes a
  model dithered rather than by how large it is. The restaurant and the beach
  club each dithered a whole terrace and each gave back about 5 200 triangles a
  placement; the supermarket dithered three smaller surfaces on a model that
  was only 1 576 triangles to begin with, so the ceiling on the trade was 1 200
  and it kept 736 of that after paying for the pass. Both are worth taking.
  Neither is a reason to expect the same number twice — and the count a scratch
  build gives you is a proxy, so the number that goes in a table here is the one
  `pnpm bench` read off a frame.

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

| Pass                                                      | State                                     |
| --------------------------------------------------------- | ----------------------------------------- |
| Palette, and the parts to compose a building              | done                                      |
| `cottage`, `house`, `restrooms`, `first-aid`              | done                                      |
| `villa`, `hotel`, `bungalow` — the lodging range          | done                                      |
| `swimming-pool` — the pool terrace, and `poolWater`       | done                                      |
| `game-hall` — the open front, and what is behind it       | done                                      |
| `restaurant` — the arcaded hall, and the terrace it faces | done; asked for no new part               |
| `beach-club` — the deck, the bar over it, and `parasol`   | done; `deck` turned out to be `plinth`    |
| `supermarket` — the shopfront, and `awning`               | done; the last name off the parts list    |
| `resort-bar`, `poolside-bar` — the two bars, in one pass  | done; asked for no new part               |
| `waterpark`                                               | next; wants the pool pass's `poolWater`   |
| The 1×1 props, and the ground tiles                       | last: cheapest to change, and mass-placed |

Every id still on the exempt list in `voxel-gen/palette.test.ts` is a model that
has not had its pass. The list only ever shrinks.
