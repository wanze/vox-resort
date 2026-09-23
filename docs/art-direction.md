# Art direction

What the models should look like and what they're built from. The authoring API
and scale are in [voxel-gen/README.md](../voxel-gen/README.md).

## References

[references/](references/README.md) holds the reference renders. Follow the matte
Mediterranean set, with `villa.jpg` as the main reference. Use the golden-hour
and photoreal renders for massing and dressing only, never for colour.

## Palette

`voxel-gen/palette.ts`. Each family is a four-step ramp (`light`, `base`, `shade`,
`deep`). Base tones:

`stucco` `#e8dcc6` · `terracotta` `#c46a42` · `teak` `#8a5f36` · `thatch`
`#c9a05a` · `sand` `#dcbe95` · `stone` `#cfc3b8` · `slate` `#9aa0a3` · `grass`
`#7d9a3c` · `foliage` `#4f7f3a` · `glass` `#8fb8c4` · `metal` `#474d57` · `water`
`#4fc6de` · `bloom` `#d2483c` · `amber` `#e8a33c`. `skin` has four complexions
instead of a ramp: `#f6c4b0`, `#d9a173`, `#a9704a`, `#6b4034`.

- Colours are flat albedo. No light or shadow painted in.
- Use a different ramp step for a different material (kerb vs. paving, shutter
  vs. wall), not for shading.
- Colours from different families must stay distinct (`palette.test.ts`).
- Prefer an existing ramp step over a new family; each colour costs a DVE voxel
  and a material.
- Max **250 colours** in the catalogue. Colour 251 silently renders with the
  wrong material.

`LEGACY` in `voxel-gen/palette.test.ts` lists models that haven't had their style
pass yet and are exempt from the palette check. The list should only shrink.

## Parts

`voxel-gen/parts/`. A part paints into the builder and returns the first free
layer above it, so parts stack:

```ts
const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
gableRoof(b, { ...BODY, y: eaves, ridge: 'z' });
doorway(b, { face: 'z+', at: FRONT, along: 14, y: ground });
```

| Part                                                       | Draws                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `ground.plinth`                                            | slab with a lip (also a teak deck)                      |
| `ground.steps`                                             | solid flight, 1 rise to 2 going                         |
| `wall.stuccoWall`                                          | wall body with skirting, string course, quoins, cornice |
| `wall.shutteredWindow`                                     | recessed pane with sill, lintel, shutters               |
| `wall.doorway`                                             | door recessed into a stone frame                        |
| `wall.awning`                                              | awning off one wall, with a valance                     |
| `roof.gableRoof`                                           | pitched roof with ridge and two gables                  |
| `roof.hipRoof`                                             | roof sloping on four sides                              |
| `roof.flatRoof`                                            | slab with a parapet                                     |
| `roof.thatchRoof`                                          | steep hipped palm roof                                  |
| `veranda.arcade`                                           | piers with round arches                                 |
| `veranda.balustrade`                                       | balusters between rail and coping                       |
| `pool.poolWater`                                           | basin sunk into a deck                                  |
| `props.pottedPlant`                                        | plant in a terracotta pot                               |
| `props.flowerBox`                                          | planter, flowering or green                             |
| `props.parasol`                                            | square canopy on a pole                                 |
| `span.spanDeck`, `spanPiles`, `spanParapet`, `spanLantern` | bridge deck, trestles, rails, lantern                   |
| `boat.hull`, `boat.pedalo`                                 | boat hulls                                              |

Parts are pure and tested. Only write a new part once a second model needs it,
and check first whether an existing part in another material already does the
job. `faceCell` in `wall.ts` makes openings work on all four faces.

## Rules

- **Fill the footprint.** Underfilled models look like the wrong scale.
- **Fixed scale.** 16 voxels per 4 m tile, 12 per storey, 8 per terrain level.
- **Don't dither patterns across a face.** The mesher merges flat single-colour
  rectangles, so checkerboards, stripes, grid-drawn curves and single-voxel frames
  all get expensive. Use geometry (a course, a recess, a band) or the shader.
- **Keep mass-placed models cheap.** Cost is triangles times placements, so
  `path`, `hedge`, lamps and trees matter most.
- **Nothing tall in front of a façade.** The camera looks down at about 30°.
- **Cut openings into walls**, don't paint them. Roofs overhang. Everything
  stands on a plinth. Put planting by the entrance.
- **Declare water, don't paint it.** Colours listed in `water` get the water
  shader everywhere in that model, so a blue flume needs a different colour
  (`water.light`, `glass`). Water must be horizontal; the shader can't do falling
  water, so cascade between tiers.
- **Light surfaces from above.** Lamps are baked as points. A floodlight puts its
  light over the surface it lights, not at the fitting.
- **Bridges own their rails**, on trestles, each with a lantern.
- **Seats need room.** Legs reach about three voxels forward at knee height;
  `seats.test.ts` checks clearance.

## Workflow

```bash
pnpm preview --sheet    # all models on one sheet
pnpm preview cottage    # one model
pnpm preview --audit    # footprint fill and voxel counts
pnpm test
pnpm bench              # when changing something mass-placed
```

Work in passes by family (roofs, then walls, then ground, then props) and
compare models against each other.

## Status

- **Done**: palette, building parts and most buildings and amenities.
- **Draft** (`DRAFT_SOURCES`, not in the app): `waterpark`.
- **To do**: everything on the `LEGACY` list, mostly 1×1 props, trees and ground
  tiles.
