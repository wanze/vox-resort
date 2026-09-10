> These are the original briefs the models were first drawn from. The reference
> renders the resort's look is now held to, and the prompts they were generated
> with, are in [../docs/references/](../docs/references/) — see
> [../docs/art-direction.md](../docs/art-direction.md).

### Dimensions (W × H × D, voxels — **16 per tile edge**, 1 voxel = 25 cm)

Every model fills the footprint it claims; `pnpm preview --audit` is the check.

| Asset         | Footprint | W × H × D     | Real size                         |
| ------------- | --------- | ------------- | --------------------------------- |
| path          | 1×1       | 16 × 2 × 16   | a 4 m paving tile                 |
| palm          | 1×1       | 16 × 45 × 16  | 11 m trunk, 4 m crown             |
| statue        | 1×1       | 16 × 22 × 16  | plinth + figure, 5.5 m            |
| icecream      | 1×1       | 16 × 15 × 16  | 2 x 1.5 m cart under a parasol    |
| tikitorch     | 1×1       | 16 × 12 × 16  | a 3 m garden torch                |
| street-lamp   | 1×1       | 16 × 21 × 16  | a 5.25 m lamp post                |
| flowerbed     | 1×1       | 16 × 9 × 16   | a 4 x 4 m bed                     |
| hedge         | 1×1       | 16 × 8 × 16   | a 2 m hedge run                   |
| sun-lounger   | 1×1       | 16 × 8 × 16   | lounger + folded parasol          |
| restrooms     | 2×1       | 32 × 17 × 16  | two-WC block, 8 x 4 m             |
| snack-bar     | 2×1       | 32 × 19 × 16  | kiosk + serving counter, 8 x 4 m  |
| entrance      | 3×1       | 48 × 28 × 16  | a 12 m gate, 7 m to the arch      |
| fountain      | 2×2       | 32 × 19 × 32  | an 8 m plaza fountain             |
| first-aid     | 2×2       | 32 × 17 × 32  | 6 x 5 m hut on an 8 x 8 m plot    |
| poolside-bar  | 2×2       | 32 × 24 × 32  | 5 m palapa bar, 6 m to the ridge  |
| bungalow      | 2×2       | 32 × 32 × 32  | 6 x 3 m hut on stilts, 8 m ridge  |
| resort-bar    | 3×2       | 48 × 24 × 32  | 12 x 8 m deck, thatched bar       |
| spa-pavilion  | 3×2       | 48 × 27 × 32  | 12 x 8 m pavilion                 |
| cottage       | 2×3       | 32 × 26 × 48  | 7 x 11 m cottage, 6.5 m ridge     |
| house         | 3×3       | 48 × 43 × 48  | 10 x 10 m, two 3 m storeys        |
| game-hall     | 3×3       | 48 × 24 × 48  | 10 x 8.5 m open games hall        |
| playground    | 4×3       | 64 × 20 × 48  | tower, swings, bars, sandpit      |
| supermarket   | 4×3       | 64 × 23 × 48  | 15 x 8 m minimarket, flat roof    |
| restaurant    | 4×3       | 64 × 24 × 48  | arcaded hall + terrace, 16 x 12 m |
| villa         | 4×4       | 64 × 40 × 64  | 10.75 x 10 m, arcade, plunge pool |
| beach-club    | 4×4       | 64 × 27 × 64  | 16 x 16 m deck, thatched bar      |
| swimming-pool | 6×4       | 96 × 15 × 64  | three pools on a 24 x 16 m deck   |
| minigolf      | 6×5       | 96 × 24 × 80  | 24 x 20 m, ten holes              |
| waterpark     | 5×5       | 80 × 55 × 80  | 20 x 20 m, a 14 m slide tower     |
| hotel         | 6×4       | 96 × 57 × 64  | 21 x 12 m, four 3 m storeys       |
| tennis-court  | 9×5       | 144 × 16 × 80 | 36 x 20 m club enclosure          |

---

The prompts below are the original authoring briefs, kept as a record. Their
group headings are the footprints the models were _first_ drawn at; several have
since been re-declared to match real-world sizes, so the table above is the
authority.

## 1×1 props

```
# palm
voxel model of a tropical palm tree, finely detailed, small crisp voxels, curved cylindrical trunk with a radial crown of broad green fronds spreading on all sides, standing on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# lounger
voxel model of a single sun lounger, finely detailed, small crisp voxels, a low reclined seat slab with a striped cushion, an angled backrest and a small folded parasol, symmetric solid frame, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# icecream
voxel model of a small wheeled ice-cream cart, finely detailed, small crisp voxels, a rectangular cart box on four wheels with a striped parasol overhead, a cold-drink cooler and a small blank chalkboard, boxy massing consistent on all four sides, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# flowerbed
voxel model of a small rectangular flower bed, finely detailed, small crisp voxels, a low solid box of dark soil bursting with red, pink and yellow blossoms across the top, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# street-lamp
voxel model of a resort street lamp, finely detailed, small crisp voxels, a slim dark metal post on a round stone foot carrying a four-sided lantern with warm glowing glass panes and a small pyramid cap, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# hedge
voxel model of a neatly trimmed rectangular green hedge, finely detailed, small crisp voxels, a solid rectangular block of dense foliage with a flat top and even sides, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# tikitorch
voxel model of a single bamboo tiki torch, finely detailed, small crisp voxels, a thin vertical bamboo pole with a lit flame on top and a small round stone base, radially symmetric, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# fountain
voxel model of a small ornate stone fountain, finely detailed, small crisp voxels, a radially symmetric tiered circular basin with gently arcing water jets, even on all sides, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.

# statue
voxel model of a classical white marble statue of a standing figure, finely detailed, small crisp voxels, the figure on a square stone plinth, solid symmetric massing with a defined back, on its own low square platform/base, flat neutral shading, no baked lighting or shadows, consistent detail on all sides, no text, no lettering.
```

## 2×1 buildings

```
# snackbar
voxel model of a small snack bar kiosk, finely detailed, small crisp voxels, a rectangular building box with a striped awning over a serving counter and stacked drink crates, solid four-sided massing with a plain back wall, on a 2x1 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# restrooms
voxel model of a small public restroom block, finely detailed, small crisp voxels, a rectangular tiled building with two doors marked with pictogram symbols and a low planter, solid four-sided massing with a plain back wall, on a 2x1 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.
```

## 3×1 structures

```
# entrance
voxel model of a grand resort entrance gate, finely detailed, small crisp voxels, two stone pillars carrying a blank unmarked arch nameplate with open wrought-iron gates between them, flanked by palms, symmetric front-and-back massing, spanning a 3x1 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.
```

## 2×2 buildings

```
# bungalow
voxel model of a rustic thatched-roof beach bungalow, finely detailed, small crisp voxels, a boxy hut raised on four wooden stilts with woven palm walls, a pyramidal thatched roof, a small porch and a ladder, solid four-sided massing, on a 2x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# poolbar
voxel model of a poolside bar, finely detailed, small crisp voxels, a pyramidal thatched roof over a curved counter with stools, blender drinks and hanging lights, solid supporting massing consistent on all sides, on a 2x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# playground
voxel model of a colorful children's playground, finely detailed, small crisp voxels, an open layout with a slide, swings, a climbing frame and soft rubber matting, freestanding equipment readable from all sides, on a 2x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, no text, no lettering.

# spa
voxel model of a small tropical spa pavilion, finely detailed, small crisp voxels, a low pitched roof over an open pavilion with draped linen curtains and potted palms at the corners, solid four-sided massing, on a 2x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# bar
voxel model of a stylish standalone resort bar, finely detailed, small crisp voxels, a wooden deck with a long counter and stools, bottle shelves and string lights, solid massing readable on all sides, on a 2x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# firstaid
voxel model of a small first-aid medical hut, finely detailed, small crisp voxels, a boxy white building with a red cross symbol, a green canopy and a bench by the door, solid four-sided massing with a plain back wall, on a 2x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.
```

## 2×3

```
# pool
voxel model of a rectangular swimming pool, finely detailed, small crisp voxels, a recessed basin of clear blue water set into a surrounding wooden deck, with a ladder and a couple of loungers, flat slab massing, on a 2x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, no text, no lettering.

# gamehall
voxel model of an arcade game hall, finely detailed, small crisp voxels, a flat-roofed rectangular building with glowing blank neon light strips and large windows showing arcade cabinets, solid four-sided massing with a plain back wall, on a 2x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.
```

## 3×2

```
# restaurant
voxel model of an open-air resort restaurant, finely detailed, small crisp voxels, a tiled roof over terrace seating under parasols with potted plants, solid supporting massing readable on all sides, spanning a 3x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# tennis
voxel model of a tennis court, finely detailed, small crisp voxels, a flat green and terracotta playing surface with white line markings, a central net and a surrounding fence, no players, flat slab massing, spanning a 3x2 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, no text, no lettering.
```

## 3×3

```
# waterpark
voxel model of a tall water slide, finely detailed, small crisp voxels, a blue-and-yellow tower with curving flumes wrapping around it, a splash pool at the base and a climbing staircase, tall vertical massing readable from all sides, occupying a 3x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, no text, no lettering.

# beachclub
voxel model of an upscale beach club, finely detailed, small crisp voxels, a raised wooden deck with daybeds and parasols, a bar and lounge seating, solid deck massing readable on all sides, occupying a 3x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# minigolf
voxel model of a mini-golf course, finely detailed, small crisp voxels, several small greens with a windmill and obstacle props, winding paths and flags, the course surface as a flat slab base, occupying a 3x3 footprint, flat neutral shading, no baked lighting or shadows, no text, no lettering.

# supermarket
voxel model of a small resort supermarket, finely detailed, small crisp voxels, a flat-roofed building with a green awning over wide glass storefront windows, crates of fruit and a stacked drinks fridge by the doors, solid four-sided massing with a plain back wall, spanning a 3x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.
```

## Lodging ladder (Phase 2.6)

```
# cottage (2x3)
voxel model of a sturdy whitewashed holiday cottage, finely detailed, small crisp voxels, a terracotta tiled pitched roof, shuttered windows, a small porch and a flower box, solid rectangular massing with a plain back wall, on a 2x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# villa (3x3)
voxel model of a premium resort villa, finely detailed, small crisp voxels, whitewashed cuboid walls, a terracotta roof, an arched veranda along the front and a small rectangular plunge pool inset into a side terrace, solid rectangular building massing with consistent detail on all sides, occupying a 3x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.

# hotel (3x3)
voxel model of a multi-storey resort hotel block, finely detailed, small crisp voxels, several floors of balconied rooms with railings, a grand ground-floor entrance and a rooftop terrace, tall solid rectangular massing with balconies on all facades, occupying a 3x3 footprint on its own low platform/base, flat neutral shading, no baked lighting or shadows, blank unmarked signs, no text, no lettering.
```
