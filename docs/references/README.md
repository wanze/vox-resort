# Reference renders

Reference images for the models, generated with a Scenario model trained for this
resort. Everything in `voxel-gen/models/` is drawn from them; see
[../art-direction.md](../art-direction.md) for how to use them.

They are lit 3D renders, not voxel art, so don't pick colours straight from the
pixels: the sun is baked in, and the app adds its own lighting. They're 384 px
JPEGs because they're for proportion, massing and colour, not detail.

| File                 | Shows                                                    | Use for                        |
| -------------------- | -------------------------------------------------------- | ------------------------------ |
| `villa.jpg`          | whitewashed villa, terracotta roof, veranda, plunge pool | everything; the main reference |
| `house.jpg`          | two-storey house, shutters, terracotta roof              | walls, shutters, roofs         |
| `restrooms.jpg`      | small utility block, flat roof, two doors                | utility buildings              |
| `tennis-court.jpg`   | fenced court, green and terracotta surface               | playing surfaces, fences       |
| `supermarket.jpg`    | flat-roofed shop, awning, glass front                    | shopfronts                     |
| `arcade.jpg`         | flat-roofed hall, neon, glazed front                     | game hall, glow                |
| `entrance-gate.jpg`  | stone piers, blank nameplate, iron gates                 | entrance                       |
| `market-kiosk.jpg`   | kiosk, striped awning, crates                            | snack bar                      |
| `taverna.jpg`        | terrace restaurant, parasols, potted plants              | massing and dressing only      |
| `hotel.jpg`          | multi-storey block with balconies                        | massing only                   |
| `pool-deck.jpg`      | pool, timber deck, loungers, ladder                      | decks, pool edges              |
| `beach-bungalow.jpg` | thatched hut on stilts                                   | thatch, stilts                 |
| `tiki-bar.jpg`       | thatched bar, counter, stools, string lights             | bars                           |
| `playground.jpg`     | slide, swings, climbing frame, matting                   | playground                     |
| `minigolf.jpg`       | greens, obstacles, winding paths, flags                  | mini-golf                      |
| `waterslide.jpg`     | slide tower, flumes, splash pool                         | water park                     |
| `icecream-cart.jpg`  | wheeled cart under a parasol                             | 1x1 props                      |
| `plaza-stone.jpg`    | pale stone plaza tile with a kerb                        | paving, plinths                |
| `path-cobble.jpg`    | cobbled path with a grass verge                          | paths                          |
| `grass-kerb.jpg`     | lawn tile with a stone kerb                              | grass, kerbs                   |
| `sand.jpg`           | sand tile                                                | beach                          |
| `water.jpg`          | water tile                                               | sea and pool colour            |

The last four are photoreal: use them for colour and edges only. Surface detail
doesn't survive at 25 cm per voxel.

## Prompts

The model was trained towards one scene, then each asset was generated on its
own. Kept as a record of what was asked for.

### Scene

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

### Assets

Each was generated three times and the first result kept. Every prompt is:

```
isometric 2:1 dimetric game asset tile, single sun upper-left, stylized realism:
<subject>, centered on a plain gray background, the object only with no
surrounding ground, grass, sand or terrain (keep its own platform/base and a soft
contact shadow), blank unmarked signs, no text, no lettering, no words.
```

The minigolf prompt says "the course surface is its own platform; keep a soft
contact shadow" instead. Subjects:

```
palm        a tropical palm tree with a curved trunk and broad green fronds, a 1x1 tile prop
lounger     a single sun lounger with a striped cushion and a small folded parasol, a compact 1x1 tile prop
icecream    a small wheeled ice-cream cart with a striped parasol, a cold-drink cooler and a small blank chalkboard (no writing), a 1x1 tile prop
flowerbed   a small rectangular flower bed bursting with red, pink and yellow blossoms in dark soil, a 1x1 tile prop
hedge       a neatly trimmed rectangular green hedge, dense foliage with a flat top, a 1x1 tile prop
tikitorch   a single bamboo tiki torch with a lit flame and a small stone base, a 1x1 tile prop
fountain    a small ornate stone fountain with a tiered basin and gently arcing water jets, a 1x1 tile prop
statue      a classical white marble statue of a figure on a square stone plinth, a 1x1 tile prop

snackbar    a small snack bar kiosk with a striped awning, a serving counter and stacked drink crates, a building occupying a 2x1 isometric tile footprint
restrooms   a small public restroom block with tiled walls, two doors marked with pictogram symbols and a low planter, a building occupying a 2x1 isometric tile footprint

entrance    a grand resort entrance gate, two stone pillars with a blank unmarked arch nameplate and open wrought-iron gates flanked by palms, a wide structure spanning a 3x1 isometric tile footprint

bungalow    a rustic thatched-roof beach bungalow on wooden stilts, woven palm walls, a small porch and a ladder, a building occupying a 2x2 isometric tile footprint
poolbar     a poolside bar with a thatched roof, a curved counter with stools, blender drinks and hanging lights, a building occupying a 2x2 isometric tile footprint
playground  a colorful children's playground with a slide, swings, a climbing frame and soft rubber matting, occupying a 2x2 isometric tile footprint
spa         a small tropical spa pavilion with a low pitched roof, draped linen curtains and potted palms at the corners, a building occupying a 2x2 isometric tile footprint
bar         a stylish standalone resort bar with a wooden deck, a long counter with stools, bottle shelves and string lights, a building occupying a 2x2 isometric tile footprint
firstaid    a small first-aid medical hut, white walls with a red cross symbol, a green canopy and a bench by the door, a building occupying a 2x2 isometric tile footprint

pool        a rectangular swimming pool with clear blue water, a surrounding wooden deck, a ladder and a couple of loungers, occupying a 2x3 isometric tile footprint
gamehall    an arcade game hall with a flat roof, glowing blank neon light strips and large windows showing arcade cabinets, a building occupying a 2x3 isometric tile footprint
cottage     a sturdy whitewashed holiday cottage with a terracotta tiled roof, shuttered windows, a small porch and a flower box, a building occupying a 2x3 isometric tile footprint

restaurant  an open-air resort restaurant with a tiled roof, terrace seating under parasols and potted plants, a wide building spanning a 3x2 isometric tile footprint
tennis      a tennis court with green and terracotta playing surface, white line markings, a central net and surrounding fence, no players, spanning a 3x2 isometric tile footprint

waterpark   a tall blue-and-yellow water slide with curving flumes, a splash pool at the base and a climbing staircase, occupying a 3x3 isometric tile footprint
beachclub   an upscale beach club with a raised wooden deck, daybeds and parasols, a bar and lounge seating, occupying a 3x3 isometric tile footprint
minigolf    a mini-golf course with several small greens, windmill and obstacle props, winding paths and flags, occupying a 3x3 isometric tile footprint
supermarket a small resort supermarket, flat roof with a green awning over wide glass storefront windows, crates of fruit and a stacked drinks fridge by the doors, a large building spanning a 3x3 isometric tile footprint
villa       a premium resort villa with whitewashed walls, a terracotta roof, an arched veranda and a small plunge pool on its terrace, occupying a 3x3 isometric tile footprint
hotel       a multi-storey resort hotel block, several floors of balconied rooms with railings, a grand ground-floor entrance and a rooftop terrace, occupying a 3x3 isometric tile footprint
```

The footprints here are what the references were generated against. Several
models now use the real-world size instead; `voxel-gen/model-prompts.md` has that
table and the voxel authoring briefs.
