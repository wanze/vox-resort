# Rendering, lighting and measurement

Reference for the [README](../README.md): the pipeline, the layout and tool
rules, lighting, what a frame costs, and how to add an object.

## Scale

A voxel is 25 cm. In `voxel-gen/voxelgen.ts`: `TILE_VOXELS` 16 (a 4 m tile),
`LEVEL_VOXELS` 8 (a 2 m level), `PAVING_VOXELS` 2 (top of a path slab),
`BRIDGE_VOXELS` 6 (top of a bridge deck). A storey is `STOREY_VOXELS` 12
(`voxel-gen/parts/wall.ts`); a render chunk is `CHUNK_VOXELS`, 16 tiles. The
authored plan is 112 × 100 tiles, 448 × 400 m.

## What is on the plot

Measured by `pnpm bench` on the authored plan (flat, no coast), which is the plot
a `?bench=1` run loads:

|                         |                                    |
| ----------------------- | ---------------------------------- |
| Instances               | 3 839                              |
| Light volume            | 34.3 MB, baked in ~640 ms          |
| Startup                 | ~2.2 s, of which ~1.2 s is meshing |
| Models in the catalogue | 59 (`voxel-gen/models/index.ts`)   |

Lamps, draw calls and triangles are in _What a frame costs_. A generated plot adds
a beach, a hill, a bay and a river; the crowd, balloons and boats are in
[crowd.md](crowd.md).

## The pipeline

1. **Catalogue** — `OBJECT_TYPES` builds every model once at module load and
   derives one material per distinct colour. `PAINTED_MODELS` is the catalogue
   plus the people.
2. **Layout** — `layoutResort` turns `RESORT_PLAN` (or a generated plan) into
   placements, paving, props and rails. This, the plan, the bakes of step 8 and
   the terrain mesh run in a worker; see _Preparing a resort off the main thread_.
3. **Scratch regions** — `scratchLayoutFor` gives every model its own
   section-aligned slice of the voxel world, padded by an empty section. Every
   catalogue model gets a second region holding its coarse copy
   (`coarseVoxels.ts`); see _Level of detail_.
4. **DVE** — `dveEngine.ts` registers one voxel per colour, paints the scratch
   regions and runs DVE's face-culling mesher, in a worker (`meshWorker.ts`).
   `meshCatalogue.ts` falls back to the main thread if the worker will not start.
5. **Attributes** — `buildModelAttributes` groups submeshes per model, merges
   coplanar same-colour faces into rectangles (`greedyMesh.ts`), puts colour in a
   vertex attribute, and splits emissive and water colours into sets of their own.
   Plain typed arrays, transferred back from the worker.
6. **Geometry** — `buildModelGeometries` wraps the arrays in buffer geometries
   and hangs each coarse copy off its model, dropping any that save too little.
7. **Instances** — `buildInstancedWorld` creates one instanced mesh per model,
   material kind and chunk, with spare capacity so placements are a matrix write,
   and again per region and per district for drawing further out; see _Level of
   detail_ and _Shader
   builds_.
8. **Lighting** — lamps baked into an irradiance volume (`lightGrid.ts`), sky
   visibility in its alpha channel (`skyVisibility.ts`), one blob-shadow quad per
   object (`blobShadows.ts`). See _Lighting_.
9. **Frame** — three materials for the whole catalogue (shaded, unlit, water),
   plus the terrain, sea, figure and moving fields.

## Layout rules

- **Streets** are routed as an orthogonal L between two plan nodes, thickened to
  their width. Plazas are paved whole. A tile an object stands on is never paved.
- **Spurs**: every object no street touches gets the shortest one-tile path to the
  network. Dressing (the `grounds` category) and anything on sand get none. An
  unreachable object is a build error.
- **Dressing**: street lamps on free tiles beside paths at a minimum spacing,
  hedges along the remaining straight runs, a bench every nine tiles — every
  four inside a plan's `parks`, which get no hedges.
- **Placements** carry a type `id`, a unique `key` (derived ones keyed by tile,
  e.g. `path@12,7`), and the height of the ground they stand on.
- **An object stands on one level.** `straddledTile` enforces it: authored plans
  throw, build mode shows red, the generator avoids it.

### Paving is decided by the ground

`paving.ts` (hand-drawn) and the layout (generated) apply the same rule. Paving is
never picked; `path` is the only paving on the palette, and the others declare
`groundDecides`.

| Ground under the tile                   | Paving                                           |
| --------------------------------------- | ------------------------------------------------ |
| grass                                   | `path`                                           |
| sand                                    | `boardwalk`                                      |
| sea (edge declares `overWater`)         | `jetty`                                          |
| inland water                            | `bridge` / `bridge-ramp` (`spans.ts`)            |
| lower tile of a step, higher tile paved | `stairs` (`stairs.ts`), turned to face the climb |

A stroke drawn uphill re-lays the slab below as a flight once the tile above is
paved. On an L-bend over a step, the first direction in compass order wins.

### Rails

`railings.ts` places them; `handrails.ts` is the live diff for hand edits, which
re-asks the edited tile and its four neighbours and diffs by key.

- A rail along every paved edge whose neighbour is lower and unpaved. Open water
  counts as a drop.
- A balustrade (`stair-railing`) up both flanks of every one-tile-wide flight.
- A paved neighbour never gets a rail between it and here.
- Over the sea the rail is `pier-railing`; on a crossing, `bridge-railing` and
  `bridge-ramp-railing-left`/`-right`.
- Rails claim no tile: they are not in the occupancy index, the blob shadows or
  the sky-visibility bake. `placeOnEdge` stands them flush against their edge.

### The coast

- `shoreline.ts` describes the coast per tile column: `waterStartZ(x)`.
- Water is not buildable ground and no street crosses it, except an `overWater`
  edge, which becomes a pier. `standsOn` in `paving.ts` says what the sea takes.
- Sand is buildable; nothing is paved to or routed across it.
- The generator lays loungers and parasols as a grid (three lines of
  lounger–parasol–lounger sets, in bays of five), a band of clubs, bars and palms
  behind them, and a lifeguard tower in the gap between bays (every 24 columns).
- A model's `placement.ground` holds it to the `beach` (sand at sea level running
  down to the sea) or the `shore` (the last three rows of it):
  `placementGround.ts`, read by the generator and by `standsOn` in build mode.
  `placement.perResort` caps how many a generated resort stands, from `min` on
  the smallest plot to `max` at 200 tiles. Volleyball courts and the pedalo
  rental (beside a pier) are stood that way.
- Two sea lanes carry on over the hill, across the sand and out onto the water as
  jetties.

### Districts

- Cross streets run along the north edge and the hill's foot, so every district
  has a street on all four sides. Gates stand only on the plot's edges: the
  promenade's north end and both ends of the plaza's cross street.
- `districtLayouts.ts` lays some districts out by design: **parks** (a pond two
  rows deep, a walk along each bank, a bridged path down the middle, trees on a
  mirrored grid) and **blocks** of one lodging type in back-to-back rows facing
  the streets, with lanes between pairs. They only take district area the rest of
  the catalogue can spare. Houses on the hill line the bench walks.

### Elevation

- `elevation.ts` describes terraces per tile column: `stepStartZ(i, x)`. Level 0
  is sea level.
- Neighbouring tiles differ by at most one level. The beach is always level 0.
- A step is anchored to `water` (follows the coast) or `plot` (a straight row).
  The generator anchors the hill to the water, so cross streets and districts are
  held north of it; the hill has its own bench walks and two switchbacks.
- From the water inland the generated hill is: the beach (level 0), a sand dune
  (1–2) onto a sand shelf (3) where the bungalows stand, grass benches up to a
  crest (6) and back down, then the resort at level 0. `ground.ts` decides what
  each tile is made of.

## Terrain

- `terrain.ts` is a field: per-tile level and surface, with sparse overrides over
  the procedural answer. Everything that reads the ground reads the field.
- `river.ts` floods a two-tile channel at each tile's existing level, banked in
  sand. It travels on the plan as terrain edits.
- Inland water is flush with its banks.
- `terrainSurface.ts` meshes one span per column. A tile with lower ground beside
  it gets a ramp cut into its upper edge; rim heights take the lowest of the tiles
  meeting there. An occupied tile keeps a square top and an upright wall.
- Water takes a corner off sand, and sand off grass, never the reverse.
- The terrain is rebuilt at most once per frame, on a dirty flag. Materials outlive
  the meshes. `overlooksDrop` skips the rebuild for placements that change nothing.
- The sea is a separate surface that reaches the horizon (`seaMaterial.ts`); pools
  and rivers use `poolWaterMaterial.ts` and `riverMaterial.ts`, sharing
  `waterSurface.ts`.

## Cameras

Switched with `C` or the View panel; the mode survives regenerating the resort.

- **Perspective** — `OrbitControls`, 55° vertical FOV, framed by
  `cameraFramingFor`. Left orbits, right pans, wheel zooms.
- **Isometric** — orthographic, over one of four corners at 45° azimuth and
  35.26° elevation, framed by `isometricFramingFor`. `Q`/`E` turn a quarter, left
  pans, wheel zooms continuously. Drawn without fog; both clip planes sit behind
  the resort (`groundPick.test.ts` checks picking at every corner and zoom).
- Benchmarks are perspective only; mode changes are refused during a bench run.
- While a tool is armed, the left button is lent to the tool and the right button
  takes over what left did (shift-right pans).

## Level of detail

Frustum culling skips what is off screen. The level of detail handles what is
on screen but far away or tiny, and it is chosen every frame in
`InstancedWorld.updateDetail` from `rendering/domain/levelOfDetail.ts`.

**Draw calls are the cost, not triangles.** Three.js spends roughly 14 µs of
main thread per draw (a 400-tile plot at 100 %: 16.7 ms for 1 168 draws in the
browser). Every model in every 64 m chunk is a draw of its own — 12 500 near
buckets on that plot — and swapping each for a coarser mesh changes none of
that, so every placement is bucketed four times:

| Layer    | Cell                     | Drawn with                            | Shown when                                              |
| -------- | ------------------------ | ------------------------------------- | ------------------------------------------------------- |
| near     | a chunk (16 tiles, 64 m) | the model as meshed                   | a voxel at its region's nearest point is ≥ 3 px         |
| mid      | a region (4 × 4 chunks)  | the model as meshed                   | its region is neither near nor far                      |
| far      | a region                 | the coarse copy, or the model if none | a coarse voxel at the region is ≤ 1.5 px                |
| district | 4 × 4 regions (1 km)     | the coarse copy, or the model if none | a coarse voxel at the district's nearest point ≤ 1.5 px |

A region is **far** once one coarse voxel at its nearest point covers no more
than `COARSE_VOXEL_PIXELS` (1.5 px), so the swap cannot be seen; a whole
district that far is drawn a district at a time. A region is **chunked**
(`CHUNKED_VOXEL_PIXELS`, 3 px a voxel, about 130 m in perspective) only where
the frustum can throw most of it away; past that it is one draw per model. In
every layer a bucket is **hidden** once the model's largest extent covers less
than `HIDDEN_PIXELS` (3 px). The rules are `regionLevelOf`, `isFar` and
`isHidden` in `levelOfDetail.ts`.

- **Pixels per voxel** is the one number both cameras answer: perspective falls
  off with distance (`focalPx / distance`), orthographic follows the zoom. Drawing
  buffer pixels, device pixel ratio included.
- **Distance** is to the nearest point anything in the cell could reach: the cell
  grown by the model's extent (the largest model's, for a region), from the ground
  to the top of the highest terrace.
- **Hysteresis** — an answer changes only once the number is 20 % past its
  threshold.
- **Coarse copies are derived, not authored.** `coarsenVoxels` turns each 2×2×2
  block into one voxel: solid if anything in it is (a post stays a post), the
  colour most of it is (never mixed, so emissive, water and windows still split by
  colour). It is meshed by DVE in the same pass, in its own scratch region, and
  scaled back up in `modelAttributes.ts`, so it lands in the full model's space.
- **Kept only if worth it** — a coarse copy with more than 60 % of the full
  model's triangles is dropped (`worthCoarsening`), and that model's far buckets
  draw its own geometry. Trees come out at 14–19 %, buildings around 40–55 %, a
  path slab at 14 %; the stairs, hedge, sign post, statue, bench, beach shower,
  lifeguard tower and resort bar are the ones dropped.
- **Both layers are kept current.** Placing or removing an object writes both;
  every bucket stands at the origin, so no mesh transform is updated per frame.
- **People** are not bucketed: `crowdField.ts` packs everybody at least 3 px
  tall on screen into the front of the buffer and cuts `count`, walk phase
  included. They keep walking while not drawn, and near ones stay drawn. They are
  four draw calls either way.
- **Not covered**: construction sites and the placement ghost draw full geometry;
  the terrain, balloons and the bay are not levelled.
- **Toggle** — _Level of detail_ in the Camera panel, or `?lod=0` on a bench run.
  _Details_ shows what the last frame actually drew, the main-thread cost of the
  frame (latest, the render submission's share, worst of the last second), the
  GPU's own time from timestamp queries, buckets per layer and hidden, people
  drawn, and how many shaders the renderer has built.

### Draws per zoom

Measured in Node (no GPU) on a generated 400 × 400 plot at 100 % (43 270
placements, 16.7 M triangles in full), real meshed catalogue, perspective camera
on the opening diagonal at 2880 × 1626, zooming in; draws counted after the
level of detail and a frustum test on each bucket's bounding sphere.

| camera distance | chunks and far regions only | four layers | triangles (four layers) |
| --------------- | --------------------------- | ----------- | ----------------------- |
| 2 400 m         | 2 532                       | 295         | 5.7 M                   |
| 1 200 m         | 2 426                       | 303         | 6.1 M                   |
| 600 m           | 3 307                       | 1 767       | 6.6 M                   |
| 300 m           | 3 260                       | 1 279       | 5.4 M                   |
| 150 m           | 2 725                       | 1 616       | 4.3 M                   |
| 37 m            | 2 655                       | 1 246       | 4.0 M                   |

With two layers the browser showed 50 fps zoomed out, 15–20 fps at mid zoom and
60 close in, which is the draw column at ~14 µs a draw. The mid layer costs
some culling (a region is drawn whole, so up to 20 % more triangles at mid
zoom). `updateDetail` walks all four layers, 1–5 ms per moving frame; the crowd
step is ~1.2 ms for 5 800 people. Doubling `CHUNK_VOXELS` is the next cut if
600 m is still slow.

### Shader builds

Three.js's WebGPU renderer caches a built shader under a key that includes the
uuid of every `InstancedMesh` (`RenderObject.getMaterialCacheKey`), so each one
costs a full node build — TSL to WGSL, milliseconds of main thread — the first
frame it is drawn. The world had one per bucket: 15 000 on the plot above, and
zooming in turned thousands of near buckets visible for the first time within a
few frames.

A bucket is therefore a plain `Mesh` over an `InstancedBufferGeometry`: the
catalogue's attributes and index shared, and the instance matrix as four
columns of one interleaved instance buffer, which `standOnInstances` reads in
the materials' `positionNode`. Every bucket with the same material and
attribute layout shares one build, so the whole world is a handful. Disposing a
bucket's geometry makes the renderer re-upload the shared catalogue attributes
the next time another bucket draws them; that is a few buffers per model on an
edit that empties or outgrows a bucket. The crowd, the bay and the balloons are
still `InstancedMesh`es: a few per resort.

## Preparing a resort off the main thread

Growing, laying out and baking a plot is seconds of work on a large one
(measured in Node on a 400 × 400 plot at 100 %: generate 1.1 s, layout 0.7 s,
lamp bake 2.1 s, sky visibility 0.5 s, terrain mesh 0.5 s). None of it needs the
renderer, so `resort-prep/domain/prepareResort.ts` does all of it as one pure
function, and `resortPreparer.ts` runs it in a long-lived worker
(`prepWorker.ts`) with a main-thread fallback.

- **What crosses back**: the plan, the laid-out lists, the lamp anchors and
  moorings, the baked volume (sky visibility already in its alpha) and the terrain
  surfaces. The volume and the terrain buffers are transferred, not copied.
- **What stays on the main thread**: instance buffers, textures, the walk network
  and crowd, the occupancy and rail indexes, the fields that move. The live light
  and sky grids adopt the finished bake rather than redoing it.
- **Generate and Clear are asynchronous.** The resort on screen keeps drawing, and
  taking edits, until the new one is swapped in; those edits go with it. A later
  request wins over an earlier one still in flight.
- **At load**, the catalogue is meshed and the first resort prepared at the same
  time, each in its own worker.
- **A terrain edit still meshes on the main thread**, over the whole plot: half a
  second per brush stroke on a 400-tile plot.

## Building

All tools share `tileStroke.ts`: the pick, a Bresenham fill between pointer
samples, pointer capture, Escape to put the tool down. Tiles are applied one at a
time, in order. `BuildTool` holds exactly one armed tool.

- **Picking** — `groundPick.ts` intersects the pointer ray with each level's
  plane, top down, and keeps the first crossing that lands on a tile at that level.
- **Occupancy** — `tileOccupancy.ts` maps tile → key of whatever covers it.
- **Placing** — click places; drag keeps placing for one-tile objects (✎). The
  ghost is the model's own geometry, unlit and translucent, green or red.
- **Palette** — grouped by each model's `category`.
- **Bulldozer** — `demolishAt` returns whatever claims a tile. Anything that
  claims a tile can be removed, including paving; rails follow the paving
  (`handrails.ts`), stairs revert via `unlaidBy` in `paving.ts`. Removal takes
  down the instance, blob shadow, lamps and sky visibility.
- **Terrain brushes** — raise, lower, grass, sand, water. The tile must be clear,
  neighbours differ by at most one level, sea tiles may be raised (to sand) but
  not painted, level 0 is the floor. Brushes reach the plot plus a plot's width
  all round.

### Buildings take time to go up

A building placed is a foundation that fills in over a few seconds, not a
building. `construction/domain/construction.ts` owns the clock — `buildSeconds`
derives a duration from the model's size, `revealHeightOf` says how far up the
model the work has reached — and `constructionField.ts` draws what is there so
far. `showcase.ts` holds the sites and ticks them from the one render loop.

- **The stages are computed, never authored.** The catalogue is meshed through
  DVE once per page load and there is no runtime re-mesh path, so a stage cannot
  be a geometry of its own. The finished geometry is drawn with a cut instead,
  and a model added to `voxel-gen/` gets a construction animation by existing.
- **The cut is per fragment**, on `maskNode`, against the interpolated
  model-space height. The greedy merge makes a wall one quad many voxels tall,
  so hiding vertices could only take the wall away entire; a fragment discard
  cuts through the middle of a merged quad. The shadow pass honours `maskNode`
  too, so a half-built wall throws a half-built shadow.
- **Two hashes make it read as voxels.** One per voxel _column_ gives structure
  — a corner post up while the wall beside it is knee high — and one per voxel
  _cell_ gives grain, so single voxels appear along the frontier rather than a
  clean stair edge. Both hold a column _behind_ the reveal, which is why the
  reveal travels past the model's own top before a building is whole.
- **A site is a plain `Mesh` per surface**, drawn with the catalogue's own
  geometry and one of two shared materials; how high the cut stands rides on the
  mesh's `userData`, which a reference node reads per render object. Four draw
  calls for as long as the crane is up, against the resort's forty.
- **Which objects** — `lodging` and `amenities` above 3 000 voxels. Paving is
  painted by dragging, and `paving.ts` lifts and re-stands a slab under one key
  as a path crosses a step, so a slab must never become a site.
- **`stand` has two halves.** The tiles, the plot's list and the square ground
  under the footprint are claimed at once; the instance, the blob shadow and the
  lamps wait for `raise`, when the work is done. `lift` mirrors whichever half
  ran, so bulldozing a site cancels it and frees the tile.

## Lighting

A model declares its lights beside its voxels:

```ts
export default defineModel({
  id: 'street-lamp',
  emissive: [GLOW], // drawn unlit, so they glow after dark
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b) => {
    /* ... */
  },
});
```

- **Lamps** — `lightGrid.ts` bakes every lamp into a volume at startup:
  irradiance and a weighted direction, as `RGBA8` 3D textures, sampled by
  `bakedLightVolume.ts` through `emissiveNode`. `lightGridSpecFor` picks the finest
  cell size inside `gridBudgetFor`: 48 MB up to a 160-tile plot, growing with the
  area to `MAX_GRID_BUDGET_BYTES` (128 MB), so a 480-tile plot bakes ~8-voxel
  cells rather than ~11.
- **Kept live** — `liveLightGrid.ts` re-bakes only the block a placed or removed
  lamp reaches and re-uploads those slices. The scale is frozen at the first bake,
  and `lampReservationFor` sizes the grid so a lamp placed anywhere on the resort
  lands inside it; a lamp placed beyond lights only the part of the grid it reaches.
- **Sky visibility** — `skyVisibility.ts` bakes per cell how much sky the objects
  above take away, into the alpha channel, applied via `aoNode` (ambient only).
  Kept live by `createLiveSkyVisibility`. Terrain risers are not in it, and
  terrain edits do not re-bake it.
- **Blob shadows** — `blobShadows.ts`, one quad per object tall enough, swept away
  from the sun, all in one mesh at paving level. Rewritten only when the sun
  moves; faded out at sunset.
- **Day/night** — `skyStateFor(time)` gives sun, ambient, sky, fog and the lamp
  factor. Pure and tested.

## What a frame costs

`pnpm bench`, WebGPU, 2880 × 1626 device pixels, M2 Pro, vsync on:

| case           | lamps on | draw calls | triangles | fps | GPU median |
| -------------- | -------- | ---------- | --------- | --- | ---------- |
| day-overview   | 0        | 814        | 1.15 M    | 120 | 4.06 ms    |
| day-street     | 0        | 420        | 637 k     | 120 | 1.90 ms    |
| night-overview | 608      | 814        | 1.15 M    | 120 | 4.65 ms    |
| night-street   | 608      | 420        | 637 k     | 120 | 3.87 ms    |

`fps` is capped by the display, so the GPU column is the one that discriminates.

These numbers predate the level of detail and the paving-scaled crowd; rerun
`pnpm bench` and `pnpm bench -- --no-lod` to refresh them.

## Measuring

The script launches Chrome over the DevTools protocol against a running dev
server and reads the result back from the page's `?bench=1` mode, which pins the
camera and clock.

```bash
pnpm dev &                         # the script does not start the server
pnpm bench                         # all four cases
pnpm bench -- --case night-street  # one case
pnpm bench -- --repeat 1,2,3       # tile the plot, to price a larger resort
pnpm bench -- --no-worker          # mesh on the main thread
pnpm bench -- --no-lod             # everything in full, to price the level of detail
pnpm bench -- --webgl              # the WebGL2 fallback
pnpm bench -- --shots ./shots      # a PNG per case
```

The same knobs are URL parameters (`?bench=1&view=street&time=0.02&repeat=3&lod=0`).
`?people=n` sets the crowd, with or without `bench`. A run only compares with the
previous one if the scene has not changed.

The resort generator goes up to 480 × 480 tiles (`PLOT_TILES`), nine times the
area of the old maximum. At 100 % density that is ~60 000 placements, ~32 000
paved tiles and ~8 000 people. Generating, laying out and baking it runs in a
worker, so the page keeps drawing while it does; see _Preparing a resort off the
main thread_. Every terrain edit still rebuilds the whole terrain mesh on the main
thread, which is the next cost a plot that size will show.

## Adding or changing an object

1. Write the model under `voxel-gen/models/` and add it to
   `voxel-gen/models/index.ts`. `voxel-gen/README.md` is the authoring API;
   [art-direction.md](art-direction.md) is the palette, the parts and the rules.
2. Declare its footprint in tiles and a `category` (which build-palette shelf it
   appears on). Declare `emissive`, `water`, `lights` and seats if it has them,
   and `placement` if it belongs only on the beach or the shore, or a resort
   should only hold a few.
3. Check it: `pnpm preview <id>` renders it, `pnpm preview --audit` reports
   footprint fill. Every model fills 100% except `beach-umbrella` (a round
   canopy) and the rails, which stand along an edge.
4. Paint only from `voxel-gen/palette.ts`; `palette.test.ts` fails otherwise. The
   catalogue may hold at most 250 colours (`objectTypes.test.ts`).
5. To put it on the authored plot, add a plot to `RESORT_PLAN` in
   `src/features/layout/domain/resortPlan.ts`. It needs room for a spur, not a
   corridor. The tests fail if an object is unplaced, overlapping, off the plot or
   walled in.
6. Run `pnpm test` (`dveEngine.test.ts` meshes the whole catalogue) and, if the
   object is mass-placed, `pnpm bench`.

Nothing in `src/` needs to change: catalogue, materials, layout, meshing,
instancing and the build palette all derive from the registry.

To make the scene bigger, add plots. `pnpm bench -- --repeat 3` prices a resort
nine times the size without authoring it.

## DVE integration

- Only DVE's data model and mesher are used, driven directly from our own worker;
  its output is handed to Three.js.
- **`dveEngine.ts` imports ten unversioned internal subpaths of
  `@divinevoxel/vlox`, dynamically**, after `EngineSettings.syncSettings`, because
  those modules snapshot settings at evaluation time. `tsc` cannot see a break in
  them; `dveEngine.test.ts` is the only thing that will. Run it after any DVE
  upgrade.
- `@divinevoxel/vlox` and `@amodx/*` publish extensionless ESM specifiers;
  `vite.config.ts` routes them through Vite's resolver for the app and the tests.
- DVE's texture pipeline gets a single flat placeholder entry; colour comes from
  materials.
- DVE winds triangles clockwise (Babylon.js); Three.js expects counter-clockwise.
  The greedy merge emits its own winding from the normal; `flipWinding` handles
  the triangles it passes through.
- DVE writes a submesh's material as a `Uint8` and registers six materials of its
  own, hence the 250-colour ceiling. Colour 251 silently renders as `dve_solid`.
- DVE keeps its world in module-level statics; scratch regions occupy roughly the
  first 2 000 voxels of x. Park anything else a test paints well past them.

## Out of scope

- Occlusion culling, and fewer, bigger draws still (larger chunks, a
  `BatchedMesh` per region, indirect draws). A far region is one draw per model;
  merging models would be the next factor. See _Draws per zoom_.
- Dynamic resolution. The drawing buffer is the device pixel ratio capped at 2,
  with MSAA.
- Chunked terrain: a terrain edit rebuilds the whole terrain mesh.
- Texture atlases, or any texturing.
- Shadow maps. Sun light is not occluded; lamps cast no shadows.
- Physics and multiplayer.
- Slopes under objects: an object stands only on level ground.
- Undo, and persistence across a reload.
- Live crowd, balloons and bay: they are built with the resort, so hand-laid
  paving is not walked.
- `decorationsFor` re-derives dressing over the whole plot on generate/clear.
