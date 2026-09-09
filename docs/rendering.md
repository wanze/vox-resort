# Rendering, lighting and measurement

The detail behind the [README](../README.md): the scale everything is authored
at, how the pipeline fits together, what is optimised and what is not, what a
frame costs, how the lamps are baked, and how any of it is measured.

## Scale

One tile is `TILE_VOXELS` (16) voxels and stands for **4 m**, so a voxel is 25 cm
and a storey is 12 voxels. Every model is authored at that scale and fills the
footprint it declares, which is what keeps a palm, a bungalow and a hotel in
proportion once they stand on the same plot.

The plot is 112 × 100 tiles — **448 × 400 m**.

## What is on the plot

|                                             |                                      |
| ------------------------------------------- | ------------------------------------ |
| Authored objects                            | 515, of 28 types                     |
| Lamps and hedges the layout scatters itself | 920                                  |
| Paved tiles                                 | 2 529 (23% of the plot)              |
| Instances drawn                             | 3 964                                |
| Draw calls                                  | 528, over 43 chunks                  |
| Triangles submitted per frame               | 2.18 M (1.25 M at eye level, culled) |
| Triangles uploaded to the GPU               | 84 k, merged down from 526 k         |
| Voxels the resort is made of                | 15.1 M                               |
| Voxels actually meshed                      | 769 k (one copy of each model)       |
| Lamps                                       | 425, all of them baked into a volume |

Note the two numbers that did _not_ move when the plot last doubled: 769 k
voxels meshed and 84 k triangles uploaded. The catalogue is meshed once whatever
the plan does with it, so growing the resort costs matrices, not geometry — the
east wing and the two southern bands added 279 objects, 1 894 instances and
7.9 M voxels for exactly zero extra meshing.

Measured in Chrome on the WebGPU backend, at 2880 × 1626 device pixels on an
M2 Pro: **120 fps (vsync) in daylight and after dark alike**. `pnpm bench`
reproduces it — see _Measuring_ below.

## How the pipeline fits together

1. **Catalogue** — `OBJECT_TYPES` builds every model in `voxel-gen/models/index.ts`
   once at module load, and derives one material per distinct colour plus the set
   of colours each model draws unlit.
2. **Layout** — `layoutResort` reads the authored `RESORT_PLAN` and produces the
   whole plot; see _Laying the resort out_ below.
3. **Scratch regions** — `scratchLayoutFor` gives every _model_ its own
   section-aligned slice of the voxel world, padded by an empty section so no
   two models share a section or cull each other's faces.
4. **DVE** — `dveEngine.ts` registers one voxel and one rendered material per
   colour, paints the scratch regions and runs DVE's face-culling mesher over
   them. This runs once over 769 k voxels, not once over the 3.2 M the resort
   would contain if it were painted out in full — and it runs **in a worker**,
   so the second it takes is a second the page spends painting rather than
   frozen. `meshCatalogue.ts` falls back to the main thread if the worker will
   not start.
5. **Attributes** — `buildModelAttributes` groups the mesher's submeshes back per
   model, **merges coplanar faces** of the same colour into maximal rectangles,
   folds the colour into a **vertex attribute**, and splits the emissive colours
   into a second set. All of it is plain typed arrays, which is what lets it run
   in the worker and be transferred back rather than copied.
6. **Geometry** — `buildModelGeometries` wraps those arrays in buffer geometries
   on the thread that owns the renderer. That is all it does.
7. **Instances** — `buildInstancedWorld` creates one `InstancedMesh` per model,
   material kind and **chunk of the plot**, and fills it with one translation
   matrix per placement. The chunking is what gives the renderer something it can
   cull. Each of those meshes is allocated with room above what it draws, so the
   scene can be changed afterwards a matrix at a time — see _Placing at runtime_.
8. **Lighting** — every lamp on the plot is baked into an irradiance volume once
   (`lightGrid.ts`) and read back with two texture fetches
   (`bakedLightVolume.ts`), instead of being evaluated as point lights per
   fragment. How much sky each cell can still see is baked into the spare
   channel of the same volume (`skyVisibility.ts`), and the shadows objects throw
   across the ground are one quad each (`blobShadows.ts`). See _Shading_ below.
9. **HUD** — labels are projected with `projectToScreen` and positioned directly
   on the DOM nodes each frame, so React never re-renders inside the render loop.

## Laying the resort out

`RESORT_PLAN` is data: a list of plots, a graph of street nodes and edges, and a
plaza or two. Everything else is derived, in three stages:

1. **Streets** — each edge is routed as an orthogonal L between its two nodes and
   thickened to its width, with the corner squared off so a wide street does not
   pinch as it turns. Plazas are paved wholesale. A tile an object stands on is
   never paved, which is how the fountain sits in the middle of its plaza
   without cutting it in two.
2. **Spurs** — every object no street already touches grows the shortest
   one-tile path to the network, breadth-first over the free tiles. This is what
   keeps the paving sparse and the resort legible: a cottage village is reached
   by one lane and eight short spurs, not by paving the whole block. It also
   means reachability holds by construction — an object that cannot be reached
   is a build error, not a silent gap.
3. **Dressing** — street lamps are taken from the ring of free tiles touching a
   path, at an even minimum spacing; hedges then fill the straight runs left
   over, skipping anything pressed against a building so the planting reads as a
   border rather than as undergrowth.

Because the plan stands two dozen cottages on the plot, a placement carries both
its type (`id`) and a unique `key`.

The plot is a grid: eight districts across, six bands down, with the promenade,
two ring lanes, six service lanes and five cross streets in the gaps between
them. Every object sits inside a district, so growing the resort is a matter of
adding districts and lanes rather than re-threading the whole network — which is
literally all the east wing (columns G and H) and the two southern bands were:
new plots, two more service lanes, two more cross streets, and the south gate
moved to the new edge. Nothing outside `resortPlan.ts` changed.

## The coast

A generated plot's southern end is sea, with a band of sand across the full
width of the plot in front of it. The south edge rather than a corner, so the
beach is a strip every district can reach instead of a wedge only the two
districts nearest one corner ever see; the isometric camera opens standing over
the south-east corner, which puts that strip across the front of the frame with
the resort behind it.

`shoreline.ts` describes the coast **per tile column**, not as a line:
`waterStartZ(x)` is the first water tile in column `x`, a straight edge with a
seeded two-sine wobble on it. Everything else is derived from that one number,
and describing it in columns is what makes the whole feature line up — the
layout classifies tiles and the renderer emits one span per column, so the
staircase the tile grid makes of a wandering coast is the _same_ staircase in
both.

The water only reaches a tenth of the plot's depth inside it, because those
tiles buy nothing: the sea carries on to the horizon whatever the plot says, so
all an inset costs is ground. The sand is the number that matters, and it is
capped as well as floored — a beach that grew with a 160-tile plot would be
forty tiles of sand, which is a desert.

Three things follow from a tile being water, sand or land:

- **Water is not ground.** No object stands on it, no street crosses it — a
  street runs into the shore and stops there rather than the plan being refused —
  and no spur routes through it. In the app the tiles are seeded into the live
  occupancy index as reserved, so the build pointer turns red over the sea by the
  ordinary rule rather than by a second one written beside it.
- **Sand is ordinary buildable ground with one difference**: a path laid on it
  comes out as a `boardwalk` rather than as flagstones. The paving is a fact
  about the ground under a tile, not about the route over it, so the same street
  is stone on grass and decking on sand.
- **The generator keeps its districts off the sand entirely** and fills it
  afterwards on its own terms — loungers and parasols in runs along the water,
  bungalows and beach clubs behind them. A run is skirted once rather than per
  object, which is the difference between a beach and a car park; the skirt is
  what guarantees the free tiles between them stay one connected piece, so
  `layoutResort` can always walk a boardwalk out to everything standing there.
  The default plot ends up with about 130 things on its beach, half of them
  loungers.

The southern gate moves with the coast: it straddles the promenade where it runs
out onto the sand rather than at the plot's own edge, which is under water. The
service lanes keep running south and are cut off at the shore, so each arrives at
the beach as a boardwalk pier.

### Drawing the water

The sea and the sand are **not** tiles, which is the one place the resort's
"ground is an object" rule is broken, twice for different reasons. The sea cannot
be a tile object because it does not end at the plot — it has to reach the
horizon, which is fifty times the plot's area. The sand could be and is not,
because a tile the sand occupied would be a tile nothing could be built on, and
standing bungalows on the beach is the point.

So `terrainSurface.ts` builds each as one static mesh of a few thousand quads,
two per tile column apiece: a shallow band and a deep one for the water, a wet
strip and a dry one for the sand, each with a small per-column colour wobble.
Both run the full width of the ground plane, so the coast carries on past the
resort instead of stopping at the plot's edge.

They are stacked between the grass and the paving — grass at -0.05, sea at 0.1,
sand at 0.3, path and boardwalk slabs from 0 to 2 — and the sea runs a tile in
_under_ the sand, so the shoreline is a seam between two surfaces that overlap
rather than a gap between two that abut. The sea sitting above the grass is
upside down as hydrology and invisible as rendering: the ground plane is infinite
and would otherwise poke through the water.

Both surfaces are bound to the same baked light volume the ground is, so the
beach shades with the resort and catches the lamps standing on it.

## Rendering: what is optimised, and what is not

**Face culling, twice.** DVE's mesher drops the faces between two solid voxels,
so a solid building costs only its surface. Three.js then culls back faces on the
GPU — which only works because the winding is corrected for Three.js's
front-facing convention first (see the notes below).

**Colour in the vertices.** Milestone 1 gave each of the 217 colours its own
material and its own mesh. That is 217 draw calls, and each mesh spanned the
whole world, so frustum culling never had anything to cull. Colour now rides in a
vertex attribute and the whole resort shares two materials — one shaded, one
unlit — which is what makes instancing possible at all.

**Instancing.** Every object stands in its own footprint and never touches its
neighbours, so a model can be meshed once and repeated. Adding another fifty
cottages costs fifty matrices and no new geometry.

The trade this makes: two adjacent path tiles no longer cull the faces they share,
because each is meshed alone. That is paid once in a shared geometry, and cheap
next to what a world-sized re-mesh would cost every time anything moves.

**Greedy meshing.** DVE emits one quad per exposed voxel face, which is the right
output for a general voxel world and the wrong one for a resort: a path tile's
underside is 256 identical quads of one colour lying flat in one plane, and there
are 701 path tiles. Paths alone were 29% of every triangle submitted, hedges
another 13%.

A submesh is already one section and one material, so every face in it is the
same flat shade — which is exactly the condition under which coplanar faces can
be merged without anyone being able to tell. `greedyMesh.ts` decomposes each
submesh back into the grid of unit cells it covers and re-covers each plane with
maximal rectangles. Same pixels, same colour, same plane; **524 k uploaded
triangles become 83 k**, and 3.1 M submitted per frame become 540 k. Verified by
pixel-diffing the rendered frame: 0.002% of pixels differ, all of them
antialiased edges.

**Spatial chunking.** One `InstancedMesh` per model draws that model wherever it
stands, so every one of them spanned the whole plot. Three.js culls per mesh, and
a mesh whose bounding sphere covers the whole resort is never off-screen — so
standing in a courtyard cost exactly as much as looking down at everything.
Instances are now bucketed into 16-tile (64 m) chunks, which gives each mesh a
sphere small enough to fail the frustum test. Chunks are sized in world units, not
as a fraction of the plot, so the count grows with the resort's area instead of
the chunks growing with it and culling nothing.

The price is draw calls: 34 became 126. That is the right trade — a WebGPU draw
call is cheap, and at eye level the resort now submits 424 k triangles instead
of 540 k, rising to less than half at four times the size.

**Meshing off the main thread.** The catalogue is meshed once whatever the resort
costs, but "once" is still ~1.1 s of DVE plus the merge, and on the main thread
that is a second in which the page does not paint, respond or answer a click.
None of that work touches the DOM or the renderer, so it runs in a worker and the
attribute arrays are transferred back. Measured by counting the frames the browser
managed to paint during startup: **9 on the main thread, 159 in the worker**, for
the same wall-clock 1.5 s. The 769 k voxel writes are packed into typed arrays
before being sent, because structured-cloning that many small objects cost more
than the meshing it was meant to move.

**Placing at runtime.** The scene used to be built once and frozen: every
`InstancedMesh` was allocated at exactly the count the plan needed, so standing
one more cottage meant reallocating and re-uploading. Each bucket now carries
capacity above what it draws, `mesh.count` says how much of that is live, and a
placement writes one matrix and one update range. A bucket that overflows
doubles — that bucket, not the other 527 — and a chunk gets a mesh the moment
something first lands in it. Removal fills the hole with the last instance rather
than compacting, since instance order carries no meaning; what does is the slot
table, which is keyed on the placement. Every mutation recomputes that bucket's
bounding sphere, without which the frustum test reads a stale one and culls what
is plainly in view.

The other half of it is keys. Derived placements — paths, lamps, hedges — were
numbered by where they landed in the array the layout returned, so paving one
more tile renamed every tile after it and no diff against the live scene meant
anything. They are keyed on the tile they stand on now (`path@12,7`), which is
what makes a diff worth computing at all: adding one cottage to the plan changes
exactly one of the 3 449 derived placements.

The policy — which chunk a placement falls in, how much room a bucket should
hold, what differs between two sets of placements — is pure and lives in
`rendering/domain/spatialChunks.ts`. Only the buffer writes are in the adapter.

## Looking at it: two cameras

The resort is drawn through one of two cameras, switched at runtime from the
**View** panel or with `C`, and the mode survives a resort being regenerated —
that changes what you are looking at, not how.

**Perspective** is the camera the app opens on, unchanged: `OrbitControls` on a
55° vertical field of view, framed by standing back far enough that the plot's
diagonal fits the view. `cameraFramingFor` solves that distance.

**Isometric** is orthographic and stands over a _corner_ of the plot: azimuth 45°
and an elevation of `atan(1/√2)`, 35.26°, which together are the condition under
which all three world axes foreshorten equally — the definition of an isometric
drawing, and what puts two faces of every building on screen rather than one flat
elevation. The four corners (NE, SE, SW, NW) are turned between with the panel or
with `Q` and `E`, and because the azimuth is 45° in all four, turning the plot
does not resize it. Zoom is free and continuous between a fifth of the plot and
thirty times into it. Free rotation is off: the four corners _are_ the rotation.

An orthographic camera is not framed by standing back — distance changes nothing
about what it draws — so `isometricFramingFor` solves the two things that do
matter instead, and four things follow that a perspective camera never has to
think about:

- **The view box, not the distance.** The framing returns how much world has to
  fit across the screen and up it; the canvas's aspect ratio decides which of the
  two binds, and `camera.zoom` scales the box rather than replacing it — so a
  window resize leaves a zoom exactly where the user put it.
- **Both clip planes go behind the resort.** `nearPlaneFor` exists because an
  integer depth buffer spends its precision non-uniformly under perspective;
  orthographic depth is linear, so there is nothing to buy by cropping the range
  and a great deal to lose. A near plane in front of the camera cuts into the
  plot as soon as the view is zoomed out far enough for the plane's own lower
  edge to drop below the ground — and `groundPointAt` throws away a hit behind
  the near plane, so _placement would silently stop working over part of the
  map_. Both planes are put a plot's diameter clear of anything, in front of the
  camera and behind it. `groundPick.test.ts` picks the ground at every corner and
  zoom, under all three depth conventions this app renders in — WebGPU,
  WebGPU with the reversed depth buffer, and the WebGL2 fallback.
- **No fog.** Fog is measured in view-space distance, and under an orthographic
  camera that distance is a number we picked: the camera stands wherever the
  framing parked it, and moving it would change nothing about the image except
  how foggy the resort came out. There is no horizon in an orthographic view for
  the haze to run out to either — the ground fills the frame edge to edge. So the
  isometric view is drawn clear, by pushing the fog out past the far plane rather
  than by clearing `scene.fog` — that is compiled into every material's shader,
  and toggling it would rebuild the whole resort's materials in the middle of a
  mode switch.
- **Label depth had to be re-derived.** `projectToScreen` sorted labels on the
  homogeneous `w`, which under perspective is the distance along the view
  direction and under orthographic projection is 1 for every point in the scene —
  a sort that silently stops sorting. The camera's view and projection matrices
  are now handed over separately rather than multiplied into one, because view
  space is where the two projections still agree, and the depth is read there.

Two cameras, one set of `OrbitControls`: everything that makes a camera usable —
damping, where it is pointed, which mouse buttons do what, whether the build
pointer has taken the left button off it — is state that would otherwise have to
be kept in sync between two of them. Switching swaps the controls' camera and
restores the target that mode was left pointed at. What the left button does
differs by mode (the perspective view orbits with it, the isometric one pans),
which is why _the scene_ rather than the build pointer owns lending it out: the
mode can change while a type is armed.

**Benchmarks stay perspective.** Both `?view=` presets are perspective framings,
the table above was measured through that lens, and an orthographic camera does
not draw the same pixels — so the showcase refuses a mode change while a bench is
running. Pricing the isometric view means a preset of its own.

**Still not done here:** no LOD, and no fixed zoom steps — zoom is continuous.

## Building on the plot

Placing is the other half of the mutable scene: the renderer could already take
one more object, and this is what points a mouse at it.

**Picking.** The resort stands on one flat plane at `y = 0`, so the tile under
the pointer is solved rather than searched for: `groundPick.ts` unprojects the
pointer through the camera's inverse view-projection and meets the ground plane
at a single point. No raycaster, no scene traversal, nothing allocated per
pointer move — and unlike a raycast against the ground mesh, the answer does not
depend on how large that mesh happens to be drawn. Tiles run negative off the
plot's corner, so the resort can grow west and north of the plan it started with.

**What may stand where.** `layoutResort` checks its own plan for overlaps once
and throws when it finds one, which is right for a plan and useless for a pointer
that spends most of its time over an occupied tile. `tileOccupancy.ts` keeps the
same question live: tile -> the key of whatever covers it, updated one placement
at a time, seeded from the resort as planned. A hover costs one map lookup per
tile of the footprint. One tile holds one thing, which is the invariant the
layout already keeps — paving never runs under a building, and the dressing is
scattered on tiles that are neither.

**The gesture.** A click places. Holding the button down keeps placing, which is
how a path gets drawn — but only for a one-tile object: dragging a hotel across
the plot would stamp a row of hotels nobody asked for. A drag is filled in with
Bresenham between pointer samples rather than being the samples themselves, since
a quick drag reports every fourth tile and would otherwise come out dotted. A
stroke skips tiles it cannot have instead of stopping at them, so a path paves
around a bench rather than ending at it.

`OrbitControls` owns the left button, and a build mode needs it, so while a type
is selected the left button is taken off the controls and the right button orbits
in its place (shift-right still pans). Deselecting hands back exactly the buttons
the camera had, not the defaults.

**The preview.** The ghost borrows the model's own geometry from the meshed
catalogue, so it costs one draw call and no upload, and it is drawn unlit and
translucent — a shaded ghost goes black after dark. Green where it may stand, red
where it may not, over a patch showing the footprint it would claim.

**The palette.** Every model declares its `category`, so the HUD groups derive
from the registry like everything else: a new model file appears on the right
shelf without a line of `src/` changing.

What is placed is drawn but **not lit**. The light volume is still baked once at
startup, so a street lamp placed by hand casts nothing. The bake's scale is
already frozen for exactly this — see _The lamps are baked_ — so splatting one
lamp into the cells it reaches and re-uploading that corner of the texture is the
next step, not a rebake.

## What it costs now

Same camera, same time of day, 2880 × 1626 device pixels, WebGPU on an M2 Pro.
`fps` is capped by the 120 Hz display, so `gpu` — read from the GPU's own
timestamp queries — is the number that keeps discriminating once a frame fits
inside the refresh interval.

| case                     | fps     | GPU    | draw calls | triangles |
| ------------------------ | ------- | ------ | ---------- | --------- |
| daylight, whole plot     | 120 fps | 6.8 ms | 528        | 2.18 M    |
| daylight, at eye level   | 120 fps | 5.1 ms | 273        | 1.25 M    |
| after dark, whole plot   | 120 fps | 6.8 ms | 528        | 2.18 M    |
| after dark, at eye level | 120 fps | 5.1 ms | 273        | 1.25 M    |

Night costs what day costs, which was not true before this milestone's lighting
work — and it still holds at 425 lamps, having been established at 167. On the
60 × 52 plot this started from, the same four cases measured:

| case                      | before       | after       | before GPU | after GPU |
| ------------------------- | ------------ | ----------- | ---------- | --------- |
| daylight, whole plot      | 120 fps      | 120 fps     | 6.68 ms    | 2.49 ms   |
| daylight, at eye level    | 120 fps      | 120 fps     | 3.41 ms    | 1.44 ms   |
| **after dark**, plot      | **32.3 fps** | **120 fps** | 55.31 ms   | 2.49 ms   |
| **after dark**, eye level | **59.9 fps** | **120 fps** | 25.17 ms   | 1.57 ms   |

And it is doing more, not less: every lamp burns, where the old pool lit the
nearest 16 of them.

Tiling the plot to price a still larger resort (`pnpm bench -- --repeat n`),
after dark:

| resort | instances | lamps | triangles | whole plot | at eye level |
| ------ | --------- | ----- | --------- | ---------- | ------------ |
| 1×     | 3 964     | 425   | 2.18 M    | 120 fps    | 120 fps      |
| 4×     | 15 856    | 1 700 | 8.7 M     | 43 fps     | 86 fps       |
| 9×     | 35 676    | 3 825 | 19.6 M    | 21 fps     | 44 fps       |

Nine times this resort — 35 676 instances and 3 825 lamps on a 1.9 km² plot —
still renders, and after dark still costs what daylight does at every size. The
overview is **CPU**-bound well before it is GPU-bound: at 9× it spends 21.7 ms of
GPU inside a 49.9 ms frame, submitting 4 734 draw calls, and the eye-level view —
which is what a player actually looks at — is still at 44 fps there. So the next
thing to do is fewer, bigger draws (indirect draws, or merging chunk geometry)
and LOD for buildings far enough away to be a box — not more culling.

**Still not done.** LOD; occlusion culling; GPU-driven or indirect draws; any
texturing at all; and real sun shadows — see _Shading_ for what stands in for
them and what that does not do.

## Measuring

Frame rate read off the HUD by hand is not a measurement: the camera is never
twice in the same place and the number shown is a half-second average that hides
the tail. So the app has a benchmark mode that pins the camera and the clock, and
`scripts/bench.ts` drives Chrome over the DevTools protocol and reads the result
back out of the page.

```bash
pnpm dev &                                  # the script does not start the server
pnpm bench                                  # all four cases
pnpm bench -- --repeat 1,2,3,4              # tile the plot, to price a larger resort
pnpm bench -- --no-worker                   # mesh on the main thread instead
pnpm bench -- --webgl                       # exercise the WebGL2 fallback
pnpm bench -- --shots ./shots               # a PNG per case, to check looks against cost
```

It reports frames per second, frame-time percentiles, GPU time per frame from
timestamp queries, and what the renderer actually submitted after culling. The
same knobs are URL parameters (`?bench=1&view=street&time=0.02&repeat=3`), so the
browser can be driven by hand.

## Lighting and the day/night cycle

A model declares the light it casts alongside the voxels it paints, so a street
lamp knows where its own bulb sits:

```ts
export default defineModel({
  id: 'street-lamp',
  emissive: [GLOW], // colours drawn unlit, so they glow after dark
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b) => {
    /* ... */
  },
});
```

Ten of the thirty-three models cast light: the street lamp and the tiki torch, the
fountain and the swimming pool, the entrance gate, both bars, the hotel's
entrance lanterns, the mini-golf bollards and the tennis court's four floodlight
masts. Between them they put 425 lamps on the plot, so the resort is lit by what
stands on it rather than by lamp posts alone.

`skyStateFor(time)` turns a normalised time of day into the sun's direction,
colour and intensity, the ambient fill, the sky and fog colour, and a lamp factor
that is 0 in daylight and 1 after dark. All of it is pure, so the curve is tuned
against a test rather than against a frame.

### The lamps are baked

The 60 × 52 plot this work was done on carried 85 lamps. They used to be a pool
of 16 real `PointLight`s aimed each frame at the anchors nearest the camera, and
that pool was what made night expensive: Three.js compiles the light count into the shader and every lit
fragment walks the whole list, so the cost is lights × lit pixels. Measured on
the 60 × 52 plot at 2880 × 1626 by sweeping the pool size, everything else held
fixed:

| Point lights | fps         | frame   |
| ------------ | ----------- | ------- |
| 0            | 120 (vsync) | 8.3 ms  |
| 4            | 106         | 8.4 ms  |
| 8            | 76          | 15.3 ms |
| 12           | 57          | 16.7 ms |
| 16           | 32          | 32.9 ms |
| 24           | 15          | 67.2 ms |

Zero lights cost exactly what daylight costs, which is what ruled out geometry as
the cause: 3.1 M triangles were free and the lights were not.

The resort does not move and neither do its lamps, so the answer is to stop
re-deriving the same result sixty times a second. `lightGrid.ts` splats every
lamp into a volume covering the plot, once at load, recording per cell:

- **irradiance** — the light arriving there, summed over every lamp that reaches
  it, using Three.js's own point-light falloff so the resort does not change
  brightness;
- **direction** — the luminance-weighted mean direction that light came from,
  plus how much the lamps agree on it. One lamp overhead gives a direction and
  full agreement; a cell between four lamps gives near-zero agreement and shades
  flatly, which is what being between four lamps looks like.

Both go to the GPU as `RGBA8` 3D textures — the irradiance square-root encoded,
because most of a night scene sits far below the brightest cell and a linear
encoding bands visibly there. `bakedLightVolume.ts` reconstructs
`irradiance × mix(isotropic, N·L, agreement)` in TSL and adds it through
`emissiveNode`, clear of the renderer's own lighting loop. Two texture fetches,
whatever the resort's size and however many lamps it has.

What that bought: **55.3 ms of GPU time became 2.49 ms** on the whole-plot night
view, night now costs what day costs, every lamp burns instead of the nearest 16,
and the pool no longer pops as the camera moves. The approximation is a soft one — a
wall facing a lamp is bright and the wall behind it is not, but a lamp casts no
shadow, and nothing under _Shading_ below changes that: what is baked there is
the sun's business, and the lamps are still soft light with no occlusion in it.

The cost is memory and load time: 5.4 M cells, 42.9 MB, 482 ms for this plot.
Cell count goes with the plot's _volume_, so `lightGridSpecFor` takes the finest
cell size that fits a 48 MB budget rather than refusing to grow. This plot has
already outgrown the finest size and bakes on 5-voxel cells rather than 4; nine
times it bakes to 47.9 MB in 605 ms, coarser again. Lamp light is smooth and the
sampler interpolates, so what that costs is a little definition at the edge of a
pool of light, and nothing else.

The alternative, clustered forward or deferred shading in TSL, is the right
answer for lights that move. None of these do.

## Shading

Neither of these is a shadow map. There is still no sun-shadow pass, no
silhouette and nothing per-fragment about either of them — that is the point.
Both are baked or amortised so that turning them on costs the frame nothing it
was not already paying.

### Sky visibility, baked into the volume that was already there

The lamps are baked because they do not move; so is everything that blocks the
sky, and for the same reason. `skyVisibility.ts` records, per cell of the light
grid, how much of the sky hemisphere the resort has taken away — which is what
darkens a courtyard, the gap between two cottages, the ground under a palm's
canopy and the corner where a wall meets the ground.

It is **independent of the sun's direction**, which is the whole reason to bake
it: it survives the day/night cycle with no re-bake at all. And it is free twice
over. The direction volume is `RGBA8` and only ever used three of its channels,
so this rides in the fourth — no extra memory, no extra fetch, no second
sampler. The two bakes share the volume and share nothing else: the lamps own
RGB and the visibility owns A, and neither writes the other's, which is what lets
a lamp go up without re-shading the resort and an object be built without
re-lighting it.

Every object is treated as one box, and the sky it takes is that box's solid
angle from the cell — the projected area of a box along a direction is four terms
of its half-extents, so this is arithmetic rather than ray marching. Two
corrections keep it honest:

- **Density.** A street lamp's bounding box is a whole tile and twenty voxels
  tall, and the lamp is a pole. Each box's contribution is scaled by the fraction
  of it the model's voxels actually fill, derived from the registry, so a pole
  does not shade like a pillar and a new model needs no rule written for it.
- **Only what stands above.** Sky is up, so a box contributes in proportion to
  how far its _top_ rises above the cell. Without this every rooftop on the plot
  bakes dark.

It reaches the shader as `aoNode`, which is the one place Three.js applies a term
to the ambient light and nothing else. That is deliberate and it is the honest
limit of the feature: **sky visibility dims sky light**. The sun is direct light,
and dimming that without a real shadow map would darken the lit side of every
building as much as the shaded one.

Cost, on this plot: **149 ms** of bake, against the 639 ms the lamps take, and
nothing at all per frame. It is proportional to what is standing rather than to
the plot: boxes are splatted over the cells each one reaches, the reach is solved
from the distance at which the box's own contribution falls under a threshold —
about 19 voxels for a lamp post, the 48-voxel cap for a hotel — and anything
under four voxels tall is dropped before the loop, which is what excludes 2 529
path slabs that would otherwise be most of the work and none of the effect.

Like the lamps, it is live: `createLiveSkyVisibility` re-bakes the block one
object shades and re-uploads only the slices that block lies in, so an object
placed by hand shades the ground beside it immediately.

### The shadows objects throw

`blobShadows.ts` gives every object tall enough one soft quad on the ground.

The usual reason to draw a blob is a contact patch — a dark ellipse _under_ an
object, to plant a thing that would otherwise read as a sticker on the grass.
This catalogue does not need one, and finding that out changed the feature:
**every one of the 33 models paints its own ground plate over the whole footprint
it claims**, so the ground an object stands on is already the object, and a patch
drawn under it would be inside opaque geometry. What is missing is the ground
_around_ it.

So these are cast, not contact. The shadow of a box `w x d x h` under a sun at
elevation `e` is that footprint swept `h / tan(e)` away from the sun, so the quad
is the footprint grown by half the sweep and shifted by the other half: it starts
under the object and runs out onto the grass, and the half still underneath is
hidden by the object, which is where a real shadow is hidden too. A palm's
shadow reaches further than a hedge's because it is taller, not because its tile
is bigger.

Three things about the way it is drawn:

- **One mesh, not one per chunk.** A shadow is two triangles, so the plot's 1 435
  of them are 2 870 against the 2.18 M the resort already submits — less than
  chunking them would cost in draw calls. What it costs instead is fill.
- **Moving the sun rewrites every quad.** A shadow's shape depends on the height
  casting it, so it cannot be a uniform the way the lamp factor is. That is one
  matrix write per shadow on a sky change — 1 435 of them, well under a
  millisecond — and none at all on a frame where the clock did not move, which is
  every frame while the cycle is stopped.
- **They lie at paving level, not ground level.** Paths stand two voxels proud,
  and a shadow at ground level would be cut off at every kerb it crossed on a plot
  that is 23% paved. The price is that a shadow floats half a metre over bare
  grass: nothing from above, slight at eye level.

The sweep is capped at three times the caster's height rather than running to the
horizon at sunrise, and the whole thing fades out as the sun sets — so no sun
shadow is ever drawn while the lamps are fully lit.

**Not measured yet.** Both features are unmeasured in a frame: `pnpm bench` has
not been run against them, so the table above still describes the build before
this. The sky visibility should cost nothing — it is one channel of a fetch that
was already happening — and the shadows should cost one draw call and whatever
1 435 blended quads cost in fill, which is the number worth actually looking at.

## Adding or changing an object

Objects are hand-authored voxel models under `voxel-gen/models/`; adding one is a
new file plus a line in `models/index.ts`, and `voxel-gen/README.md` documents the
authoring API and the conventions. Nothing in `src/` needs to change: the
catalogue, materials, layout, meshing, instancing, HUD labels and the shelf of the
build palette it appears on all derive from the registry — the last of those from
the `category` the model declares.

The resort is laid out on a fixed grid of `TILE_VOXELS` (16) voxel tiles. Every
model declares the footprint it claims in tiles and must fit inside it;
`pnpm preview --audit` reports how much of that footprint each model actually
fills, which is the number to watch when objects are meant to look right next to
each other. All 33 models currently fill 100% of their footprint.

`spreadLabelAnchors` picks which placement of each type carries the HUD caption.
It takes the one furthest from the labels already placed, so a plan that
introduces most of its types along the north frontage — as this one does — still
ends up with its captions spread over the plot rather than stacked in one corner.

A new object also needs a plot: add it to `RESORT_PLAN` in
`src/features/layout/domain/resortPlan.ts`. It does not need a corridor — the
spur pass will reach it — but it does need somewhere for a spur to run. The unit
tests fail if the plan leaves an object unplaced, overlapping, off the plot or
walled in.

To make the scene bigger, add plots. Nothing else has to change: repeated types
become extra instances, the lamps, hedges and paths that dress them are derived,
and the chunking, culling and light bake all size themselves from the result.
`pnpm bench -- --repeat 3` prices a resort nine times this one without anybody
having to author it.

## Notes on the DVE integration

- DVE normally spreads world, mesher and generator contexts across web workers
  behind a Babylon.js renderer. Only its data model and mesher are needed here,
  so the engine is driven directly and its output handed to Three.js instead. It
  runs in a worker of our own (`meshWorker.ts`), which is what keeps the page
  painting while the catalogue is meshed.
- Several DVE modules snapshot engine settings at module-evaluation time, so
  `dveEngine.ts` imports them dynamically, after `EngineSettings.syncSettings`.
- `@divinevoxel/vlox` and `@amodx/*` publish extensionless ESM specifiers, which
  Node's resolver rejects. `vite.config.ts` routes them through Vite's resolver
  for both the app and the test runner.
- Colour comes from the material, not from a texture, so DVE's texture pipeline
  is satisfied with a single flat placeholder entry — no atlas, no image loading.
- DVE winds its triangles for Babylon.js, which treats clockwise as front-facing;
  Three.js treats counter-clockwise as front-facing. Without a correction the
  renderer culls exactly the faces that should be visible and keeps the ones
  facing away, so objects are see-through from the near side — invisible on a
  convex placeholder box, obvious on anything with an overhang or a porch. The
  greedy merge sidesteps it: it reads each face's orientation off the _normal_
  and emits its own winding. `flipWinding` remains for the triangles the merge
  passes through untouched, and for `dveEngine.test.ts`, which asserts what DVE
  actually hands back.
- `dveEngine.test.ts` meshes the whole catalogue once. It is the only test that
  boots the engine, and it exists to catch registration drift: a model painting a
  material the DVE registry never heard of would otherwise lose or mis-colour
  those faces silently.
- DVE keeps its world in module-level statics, and the scratch regions occupy
  roughly the first 2 000 voxels of x. Anything else painted into that world for
  a test has to be parked well past them.

## Out of scope for this milestone

Texture atlases, LOD, occlusion culling, GPU-driven/indirect draws, procedural
terrain, physics and multiplayer.

Shadows are half in scope now: the resort shades itself against the sky and
objects throw a shadow across the ground, but neither is a shadow map. There is
no silhouette in either, the sun's own light is not occluded, and the lamps cast
nothing at all after dark. See _Shading_.

Objects can be placed by hand, but not taken away again: there is no bulldozer,
no undo and nothing persists a plot across a reload. The lamps are still baked
once up front, so an object placed after startup is drawn and not lit, and a type
that first appears at runtime gets no HUD caption — the label anchors are chosen
at startup. `decorationsFor` also still re-derives the dressing over the whole
plot, which is what the coordinate keys make visible — one edit should not be
able to move a lamp on the far side of the resort.
