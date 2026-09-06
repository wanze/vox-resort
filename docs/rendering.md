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
   cull.
8. **Lighting** — every lamp on the plot is baked into an irradiance volume once
   (`lightGrid.ts`) and read back with two texture fetches
   (`bakedLightVolume.ts`), instead of being evaluated as point lights per
   fragment.
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

**Still not done.** LOD; occlusion culling; GPU-driven or indirect draws; and any
texturing at all.

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
  id: "street-lamp",
  emissive: [GLOW], // colours drawn unlit, so they glow after dark
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b) => {
    /* ... */
  },
});
```

Ten of the thirty-one models cast light: the street lamp and the tiki torch, the
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
wall facing a lamp is bright and the wall behind it is not, but there are no cast
shadows, which there were not before either.

The cost is memory and load time: 5.4 M cells, 42.9 MB, 482 ms for this plot.
Cell count goes with the plot's _volume_, so `lightGridSpecFor` takes the finest
cell size that fits a 48 MB budget rather than refusing to grow. This plot has
already outgrown the finest size and bakes on 5-voxel cells rather than 4; nine
times it bakes to 47.9 MB in 605 ms, coarser again. Lamp light is smooth and the
sampler interpolates, so what that costs is a little definition at the edge of a
pool of light, and nothing else.

The alternative, clustered forward or deferred shading in TSL, is the right
answer for lights that move. None of these do.

## Adding or changing an object

Objects are hand-authored voxel models under `voxel-gen/models/`; adding one is a
new file plus a line in `models/index.ts`, and `voxel-gen/README.md` documents the
authoring API and the conventions. Nothing in `src/` needs to change: the
catalogue, materials, layout, meshing, instancing and HUD labels all derive from
the registry.

The resort is laid out on a fixed grid of `TILE_VOXELS` (16) voxel tiles. Every
model declares the footprint it claims in tiles and must fit inside it;
`pnpm preview --audit` reports how much of that footprint each model actually
fills, which is the number to watch when objects are meant to look right next to
each other. All 31 models currently fill 100% of their footprint.

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

Texture atlases, LOD, occlusion culling, GPU-driven/indirect draws, shadows,
player placement/editing, procedural terrain, physics and multiplayer.
