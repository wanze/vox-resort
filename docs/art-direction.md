# Art direction

Reference for what the objects look like and what they are built from. The
authoring API and scale are in [voxel-gen/README.md](../voxel-gen/README.md);
what happens to a model after authoring is in [rendering.md](rendering.md).

## References

`docs/references/` holds the reference renders, with prompts in
[references/README.md](references/README.md). The resort follows the matte
Mediterranean set, with `villa.jpg` as the anchor. The golden-hour and
photoreal-tile renders are used for massing and dressing only, never for colour.

## The palette

`voxel-gen/palette.ts`. Every family is a four-tone ramp — `light`, `base`,
`shade`, `deep` — and every model paints from it. Base tones:

`stucco` `#e8dcc6` · `terracotta` `#c46a42` · `teak` `#8a5f36` · `thatch`
`#c9a05a` · `sand` `#dcbe95` · `stone` `#cfc3b8` · `slate` `#9aa0a3` · `grass`
`#7d9a3c` · `foliage` `#4f7f3a` · `glass` `#8fb8c4` · `metal` `#474d57` · `water`
`#4fc6de` · `bloom` `#d2483c` · `amber` `#e8a33c`. `skin` is four complexions
rather than one ramp: `#f6c4b0`, `#d9a173`, `#a9704a`, `#6b4034`.

- A colour is an albedo: flat, no light or shadow painted in.
- A ramp step is for a different material (kerb against paving, shutter against
  render), not for light.
- Cross-family pairs are held more than 17 apart on the channel sum
  (`palette.test.ts`).
- A new family is four more DVE voxels and materials. Prefer a step of an
  existing ramp.
- The catalogue may hold at most **250 colours**; the 251st silently renders in
  the wrong material (`catalog/domain/objectTypes.test.ts`).

### The `LEGACY` list

`LEGACY` in `voxel-gen/palette.test.ts` names models exempt from the palette
check: every model on it has not had its style pass yet. The list only shrinks.
Currently: `path`, `boardwalk`, `stairs`, `railing`, `stair-railing`,
`street-lamp`, `palm`, `pine`, `cypress`, `olive`, `oak`, `blossom`, `willow`,
`statue`, `sun-lounger`, `beach-umbrella`, `tikitorch`, `icecream`, `snack-bar`.

## The parts

`voxel-gen/parts/`. A part paints into the builder and returns the first free
layer above what it drew, so a building stacks:

```ts
const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
gableRoof(b, { ...BODY, y: eaves, ridge: 'z' });
doorway(b, { face: 'z+', at: FRONT, along: 14, y: ground });
```

| Part                                                       | What it draws                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `ground.plinth`                                            | a slab with a lip round its top edge (also a deck, in teak) |
| `ground.steps`                                             | a solid flight, 1 voxel of rise to 2 of going               |
| `wall.stuccoWall`                                          | a body with skirting, string course, quoins, cornice        |
| `wall.shutteredWindow`                                     | a recessed pane with sill, lintel and shutters              |
| `wall.doorway`                                             | a leaf recessed into a stone frame                          |
| `wall.awning`                                              | a blind cantilevered off one wall, with a valance           |
| `roof.gableRoof`                                           | a pitched roof with a ridge and two gables                  |
| `roof.hipRoof`                                             | a roof falling away on four sides                           |
| `roof.flatRoof`                                            | a slab with a parapet                                       |
| `roof.thatchRoof`                                          | a steep hipped palm roof with a ridge pole                  |
| `veranda.arcade`                                           | piers with round arches, under a cornice                    |
| `veranda.balustrade`                                       | balusters between a rail and a coping                       |
| `pool.poolWater`                                           | a basin sunk into a deck, rimmed and filled                 |
| `props.pottedPlant`                                        | greenery in a terracotta pot                                |
| `props.flowerBox`                                          | a planter, flowering or green                               |
| `props.parasol`                                            | a flat square canopy on a pole                              |
| `span.spanDeck`, `spanPiles`, `spanParapet`, `spanLantern` | a raised crossing's planking, trestles, rails and lantern   |
| `boat.hull`, `boat.pedalo`                                 | the bay's hulls                                             |

- Parts are pure and unit-tested beside themselves.
- A part is written only when a second model needs the same shape. Before
  writing one, check whether an existing part in another material is it.
- `faceCell` in `wall.ts` maps a face, a position across it and a depth into it
  onto a voxel, so openings work on all four faces.

## Rules

- **Fill the footprint.** `pnpm preview --audit` reports fill; a model well under
  100% reads as the wrong scale.
- **Scale is fixed.** 16 voxels to a 4 m tile, 12 to a storey, 8 to a level.
- **Never dither a pattern across a face.** The mesher merges coplanar faces of
  one colour into rectangles, so cost is the number of flat single-colour
  rectangles. Checkerboards, stripes, curves drawn on the grid and open frames of
  single voxels all defeat it. Give variation geometry — a course, a recess, a
  band — or leave it to the shader.
- **Detail is multiplied by placements.** Per-frame cost is a model's triangles
  times its count on the plot. Keep mass-placed models (`path`, `hedge`, lamps,
  trees) cheap.
- **Nothing tall in front of a building's face.** The camera looks down at about
  30°; a pergola or tall planting in front hides the façade.
- **Openings are cut into walls**, not painted on. Roofs overhang. Everything
  stands on a plinth. Planting is the high-frequency detail, by the entrance.
- **Water is declared, not painted.** A model lists its water colours
  (`water: [PALETTE.water.base]`); those faces get the pool shader
  (`poolWaterMaterial.ts`, `waterSurface.ts`). Paint water in one tone. A declared
  colour is water everywhere in that model, so a painted stream or a blue flume
  uses another colour (`water.light`, `glass`).
- **Water that moves is horizontal.** The water shader's normal always points up;
  falling water cannot be shaded. Cascade between horizontal tiers instead.
- **Light a surface from above it.** Lamps are baked as points with windowed
  inverse-square falloff. A floodlight declares its anchors over the surface it
  lights, not at the fitting. Lamps cost nothing per frame and bake time per load,
  growing with their reach.
- **A raised paving owns its rails.** A bridge stands off the ground, has ends
  (`spans.ts` picks ramp or deck), and takes its own railings on trestles, each
  with a lantern.
- **Seats need room.** A seat names the hips; a seated figure's legs reach about
  three voxels forward at knee height. `voxel-gen/seats.test.ts` checks that every
  seat stands on something solid, clears the furniture, and is at least three
  voxels from the next.

## The loop

```bash
pnpm preview --sheet    # every model on one contact sheet, in voxel-gen/out/sheets/
pnpm preview cottage    # one model, into voxel-gen/out/
pnpm preview --audit    # footprint fill and voxel counts
pnpm test               # palette, parts, catalogue, layout
pnpm bench              # once a pass touches something mass-placed
```

Work in family passes (all roofs, then walls, then ground, then props), comparing
models against each other.

## Where the passes have got to

- **Done**: the palette and the building parts; `cottage`, `house`, `restrooms`,
  `first-aid`, `villa`, `hotel`, `bungalow`, `swimming-pool`, `game-hall`,
  `restaurant`, `beach-club`, `supermarket`, `resort-bar`, `poolside-bar`,
  `minigolf`, `playground`, `tennis-court`, `fountain`, `entrance`,
  `hedge`, `flowerbed`, `bench`, `bridge`, `bridge-ramp`, `spa-pavilion`.
- **In the palette from their first commit**: `litter-bin`, `sign-post`,
  `picnic-table`, `lifeguard-tower`, `volleyball`, `jetty`, `pedalo-rental`,
  `buoy`, `rowboat`, `sailboat`, `pedalo`.
- **Withheld as a draft** (`DRAFT_SOURCES`, not in the app): `waterpark`, which
  does not fit the resort yet.
- **To do**: everything on the `LEGACY` list — the remaining 1×1 props and the
  ground tiles. Cheapest to change, and mass-placed.
