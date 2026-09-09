# Reference renders

Twenty-two renders, one per family of object, made with a Scenario model trained
for this resort. They are the art direction: everything in `voxel-gen/models/`
is drawn from these, and [../art-direction.md](../art-direction.md) is the
argument for which of them to follow and how far.

They are stylized 3D renders rather than voxel art, and they are **lit**, which
matters: a colour taken straight off one of these pixels carries a sun in it,
and the renderer here applies its own. See the palette rules.

Kept at 384 px and JPEG on purpose — they are for judging proportion, massing
and colour, not for zooming into.

| File                 | What it is                                               | Follow it for                                           |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| `villa.jpg`          | whitewashed villa, terracotta roof, veranda, plunge pool | everything: this is the reference the resort is held to |
| `house.jpg`          | two-storey house, shutters, terracotta roof              | walls, shutters, roofs                                  |
| `restrooms.jpg`      | small utility block, flat roof, two doors                | the utility buildings                                   |
| `tennis-court.jpg`   | fenced court, green and terracotta surface               | playing surfaces, fences                                |
| `supermarket.jpg`    | flat-roofed shop, awning, glass front                    | shopfronts                                              |
| `arcade.jpg`         | flat-roofed hall, neon, glazed front                     | the game hall, and glow                                 |
| `entrance-gate.jpg`  | stone piers, blank nameplate, iron gates                 | the entrance                                            |
| `market-kiosk.jpg`   | kiosk, striped awning, crates                            | the snack bar                                           |
| `taverna.jpg`        | terrace restaurant, parasols, potted plants              | massing and dressing only (golden-hour lane)            |
| `hotel.jpg`          | multi-storey block with balconies                        | massing only (saturated lane)                           |
| `pool-deck.jpg`      | pool, timber deck, loungers, ladder                      | decks and pool edges                                    |
| `beach-bungalow.jpg` | thatched hut on stilts                                   | thatch and stilts                                       |
| `tiki-bar.jpg`       | thatched bar, counter, stools, string lights             | the bars                                                |
| `playground.jpg`     | slide, swings, climbing frame, matting                   | the playground                                          |
| `minigolf.jpg`       | greens, obstacles, winding paths, flags                  | the mini-golf                                           |
| `waterslide.jpg`     | slide tower, flumes, splash pool                         | the water park                                          |
| `icecream-cart.jpg`  | wheeled cart under a parasol                             | the 1x1 props                                           |
| `plaza-stone.jpg`    | pale stone plaza tile with a kerb                        | paving and plinths                                      |
| `path-cobble.jpg`    | cobbled path with a grass verge                          | paths                                                   |
| `grass-kerb.jpg`     | lawn tile with a stone kerb                              | grass, kerbs                                            |
| `sand.jpg`           | sand tile                                                | the beach                                               |
| `water.jpg`          | water tile                                               | sea and pool colour                                     |

The last four are the photoreal lane: read them for colour and edge treatment,
never for surface detail, which at 25 cm a voxel does not survive the trip.

## The prompts

The model was trained towards one scene, and each asset was then generated on
its own against a plain background. Kept verbatim as the record of what was
asked for.

### The scene the model was trained towards

```
Isometric 2:1 dimetric view (30-degree top-down angle, parallel projection, no
perspective distortion) of a small tropical beach resort on a square island plot,
game asset art for a resort-builder game.

Style: detailed stylized realism, warm and inviting, soft ambient-occlusion shadows,
clean readable shapes, rich but cohesive color palette, subtle textures — like a
high-end mobile city-builder (SimCity BuildIt / Township). NOT photorealistic, NOT flat
cartoon, NO outlines.

Layout, front (bottom) to back (top): turquoise sea lapping a sandy beach shore along
the near edge; a band of light sand; then a green grass interior that rises one low step
onto a flat grassy plateau (a gentle terraced hill with clean stepped edges, NOT a smooth
slope), crossed by light stone paths and stone-paved plaza squares; with a resort entrance
gate at the back (land) edge. Place clearly separated, readable objects showing the full
lodging range: small rustic thatched-roof beach bungalows on stilts near the sand; a couple
of sturdier whitewashed cottages with tiled roofs; a premium villa with its own garden up on
the plateau; and a larger multi-storey resort hotel block at the back; a rectangular
swimming pool with a wooden deck, a poolside bar with stools and umbrellas, a restaurant
with outdoor terrace seating, a standalone bar, a beach club with lounge seating, a
children's playground, sun loungers with parasols on the sand, an ice-cream stand, a snack
bar, a small supermarket, a tennis court, a mini-golf course, a small spa pavilion, a
water-park slide, an arcade game hall, a first-aid medical hut, a public restroom block,
and a main entrance gate. Dress the grounds with decorative props: a central stone fountain,
a statue on a plinth, tidy flower beds, trimmed green hedges, lit tiki torches, and palm
trees scattered throughout.

Lighting: bright clear midday sun from the upper-left, soft shadows cast to the
lower-right, gentle sky-blue ambient fill. Clean neutral background around the island.
High detail, crisp, centered composition.
```

### Per asset

Each of these was generated three times; the variation kept here is the first.
Every one of them ends in the same instruction — the object only, on a plain
grey background, with its own platform and a soft contact shadow, and no text
anywhere — which is what makes them usable as single assets.

```
# palm
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a tropical palm tree with a curved trunk and broad green fronds, a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# lounger
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a single sun lounger with a striped cushion and a small folded parasol, a compact 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# icecream
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small wheeled ice-cream cart with a striped parasol, a cold-drink cooler and a small blank chalkboard (no writing), a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# flowerbed
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small rectangular flower bed bursting with red, pink and yellow blossoms in dark soil, a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# hedge
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a neatly trimmed rectangular green hedge, dense foliage with a flat top, a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# tikitorch
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a single bamboo tiki torch with a lit flame and a small stone base, a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# fountain
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small ornate stone fountain with a tiered basin and gently arcing water jets, a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# statue
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a classical white marble statue of a figure on a square stone plinth, a 1x1 tile prop, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# snackbar
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small snack bar kiosk with a striped awning, a serving counter and stacked drink crates, a building occupying a 2x1 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# restrooms
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small public restroom block with tiled walls, two doors marked with pictogram symbols and a low planter, a building occupying a 2x1 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# entrance
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a grand resort entrance gate, two stone pillars with a blank unmarked arch nameplate and open wrought-iron gates flanked by palms, a wide structure spanning a 3x1 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# bungalow
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a rustic thatched-roof beach bungalow on wooden stilts, woven palm walls, a small porch and a ladder, a building occupying a 2x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# poolbar
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a poolside bar with a thatched roof, a curved counter with stools, blender drinks and hanging lights, a building occupying a 2x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# playground
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a colorful children's playground with a slide, swings, a climbing frame and soft rubber matting, occupying a 2x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# spa
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small tropical spa pavilion with a low pitched roof, draped linen curtains and potted palms at the corners, a building occupying a 2x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# bar
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a stylish standalone resort bar with a wooden deck, a long counter with stools, bottle shelves and string lights, a building occupying a 2x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# firstaid
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small first-aid medical hut, white walls with a red cross symbol, a green canopy and a bench by the door, a building occupying a 2x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# pool
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a rectangular swimming pool with clear blue water, a surrounding wooden deck, a ladder and a couple of loungers, occupying a 2x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# gamehall
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: an arcade game hall with a flat roof, glowing blank neon light strips and large windows showing arcade cabinets, a building occupying a 2x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# restaurant
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: an open-air resort restaurant with a tiled roof, terrace seating under parasols and potted plants, a wide building spanning a 3x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# tennis
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a tennis court with green and terracotta playing surface, white line markings, a central net and surrounding fence, no players, spanning a 3x2 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# waterpark
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a tall blue-and-yellow water slide with curving flumes, a splash pool at the base and a climbing staircase, occupying a 3x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# beachclub
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: an upscale beach club with a raised wooden deck, daybeds and parasols, a bar and lounge seating, occupying a 3x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# minigolf
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a mini-golf course with several small greens, windmill and obstacle props, winding paths and flags, occupying a 3x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (the course surface is its own platform; keep a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# supermarket
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a small resort supermarket, flat roof with a green awning over wide glass storefront windows, crates of fruit and a stacked drinks fridge by the doors, a large building spanning a 3x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.

# cottage (2x3)
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a sturdy whitewashed holiday cottage with a terracotta tiled roof, shuttered windows, a small porch and a flower box, a building occupying a 2x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# villa (3x3)
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a premium resort villa with whitewashed walls, a terracotta roof, an arched veranda and a small plunge pool on its terrace, occupying a 3x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
# hotel (3x3)
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism: a multi-storey resort hotel block, several floors of balconied rooms with railings, a grand ground-floor entrance and a rooftop terrace, occupying a 3x3 isometric tile footprint, centered on a plain gray background, the object only with no surrounding ground, grass, sand or terrain (keep its own platform/base and a soft contact shadow), blank unmarked signs, no text, no lettering, no words.
```

The footprints in these prompts are the ones the references were generated
against, not the ones the models claim: several were re-declared to the size the
real thing measures. `voxel-gen/model-prompts.md` holds that table and the
original voxel authoring briefs.
