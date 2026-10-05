# Art direction

What the models look like and what they're built from. The authoring API and
scale are in [voxel-gen/README.md](../voxel-gen/README.md).

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
instead of a ramp.

- Colours are flat albedo, with no light or shadow painted in.
- A different ramp step means a different material (kerb vs. paving), not
  shading.
- Families must stay distinct (`palette.test.ts`).
- Prefer an existing step over a new family: each colour costs a DVE voxel and
  a material. Max **250 colours**; colour 251 silently renders wrong.

`LEGACY` in `palette.test.ts` lists models exempt from the palette check until
their style pass. It should only shrink.

## Parts

`voxel-gen/parts/`. A part paints into the builder and returns the first free
layer above it, so parts stack:

```ts
const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
gableRoof(b, { ...BODY, y: eaves, ridge: 'z' });
doorway(b, { face: 'z+', at: FRONT, along: 14, y: ground });
```

| Module    | Parts                                                 |
| --------- | ----------------------------------------------------- |
| `ground`  | `plinth`, `steps`                                     |
| `wall`    | `stuccoWall`, `shutteredWindow`, `doorway`, `awning`  |
| `roof`    | `gableRoof`, `hipRoof`, `flatRoof`, `thatchRoof`      |
| `veranda` | `arcade`, `balustrade`                                |
| `pool`    | `poolWater`                                           |
| `props`   | `pottedPlant`, `flowerBox`, `parasol`                 |
| `span`    | `spanDeck`, `spanPiles`, `spanParapet`, `spanLantern` |
| `boat`    | `hull`, `pedalo`                                      |

Parts are pure and tested. Write a new one only once a second model needs it.
`faceCell` in `wall.ts` makes openings work on all four faces.

## Rules

- **Fill the footprint.** Underfilled models look like the wrong scale.
- **Fixed scale.** 16 voxels per 4 m tile, 12 per storey, 8 per terrain level.
- **No dithered patterns.** The mesher merges flat single-colour rectangles, so
  checkerboards, stripes and single-voxel frames get expensive. Use geometry or
  the shader.
- **Keep mass-placed models cheap.** Cost is triangles × placements, so paths,
  hedges, lamps and trees matter most.
- **Mosaics are four-fold symmetric.** A field turns with its piece: paint one
  quarter in shapes at least 2 voxels across.
- **Nothing tall in front of a façade.** The camera looks down at about 30°.
- **Cut openings, don't paint them.** Roofs overhang, everything stands on a
  plinth, planting goes by the entrance.
- **Declare water, don't paint it.** Colours listed in `water` get the water
  shader, which only does horizontal water, so cascade between tiers.
- **Light surfaces from above.** Lamps are baked as points, so a floodlight's
  light sits over what it lights.
- **Bridges own their rails**, on trestles, each with a lantern.
- **Seats need room.** Legs reach about three voxels forward (`seats.test.ts`).

## Workflow

```bash
pnpm preview --sheet    # all models on one sheet
pnpm preview cottage    # one model
pnpm preview --audit    # footprint fill and voxel counts
pnpm bench              # when changing something mass-placed
```

Work in passes by family (roofs, walls, ground, props) and compare models
against each other. Still to do: everything on the `LEGACY` list, mostly 1×1
props, trees and ground tiles. `waterpark` is a draft (`DRAFT_SOURCES`).
