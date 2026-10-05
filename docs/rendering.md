# Rendering

How models get from `voxel-gen/` onto the screen, plus layout, terrain, building
tools, lighting and benchmarks.

## Scale

A voxel is 25 cm. Constants in `voxel-gen/voxelgen.ts`: `TILE_VOXELS` 16 (4 m
tile), `LEVEL_VOXELS` 8 (2 m terrain step), `PAVING_VOXELS` 2, `BRIDGE_VOXELS` 6.
A storey is `STOREY_VOXELS` 12. A render chunk (`CHUNK_VOXELS`) is 16 tiles. The
authored plan is 112 × 100 tiles (448 × 400 m).

## Pipeline

1. **Catalogue**: `OBJECT_TYPES` builds every model once and creates one material
   per colour. `PAINTED_MODELS` adds people, staff, balloons, boats, litter and
   balls.
2. **Layout**: `layoutResort` turns `RESORT_PLAN` (or a generated plan) into
   placements, paving, props and rails.
3. **Scratch regions**: `scratchLayoutFor` gives each model its own slice of the
   voxel world, plus a second one for its coarse copy (`coarseVoxels.ts`).
4. **DVE**: `dveEngine.ts` registers one voxel per colour, paints the regions and
   runs DVE's mesher in a worker (`meshWorker.ts`), falling back to the main
   thread.
5. **Attributes**: `buildModelAttributes` groups submeshes per model, greedy-merges
   coplanar faces of one colour (`greedyMesh.ts`) and splits out emissive and
   water faces.
6. **Geometry**: `buildModelGeometries` wraps the arrays in buffer geometries.
7. **Instances**: `buildInstancedWorld` creates instanced buckets per model,
   material and chunk (and per region and district for distant drawing), with
   spare capacity so placing is a matrix write.
8. **Lighting**: lamps baked into a light volume, sky visibility, blob shadows.
9. **Frame**: three materials for the catalogue (lit, unlit, water), plus terrain,
   sea, figures and moving objects. Litter on the paths is a moving field too
   (`litter/adapters/litterField.ts`): one instanced mesh per litter model,
   rewritten only when the litter changes. The ball field beside it
   (`choreography/adapters/ballField.ts`) is one instanced mesh per ball, 16
   slots each, rewritten every frame, a court with no game packed out. The map
   overlay
   (`overlays/adapters/overlayField.ts`) is one instanced quad per paved tile,
   coloured per instance, 2.1 voxels up over the blob shadows, and hidden (no
   draw call) while it is off.
   The resort's name (`naming/adapters/nameplateField.ts`) is one plain lit
   mesh per finished gate whose model declares a `nameplate`, set in a 5-pixel
   font finer than the world grid and shared per model and name. It is left
   out of the light bake and the blob shadows, and not drawn under a bench.

Steps 2 and 8 and the terrain mesh run in a worker (see
[Preparing a resort](#preparing-a-resort)).

## Layout

- **Streets** are L-shaped routes between plan nodes. Plazas are paved whole.
  Tiles with objects on them are never paved.
- **Spurs**: every object not touching a street gets the shortest path to one,
  starting from its door where possible. Decoration (`grounds`) and objects on
  sand get none. An unreachable object is a build error.
- **Decoration**: street lamps beside paths, hedges along straight runs, a bench
  every nine tiles (every four in parks, which get no hedges).
- **An object stands on one level.** Authored plans throw, build mode shows red,
  the generator avoids it (`straddledTile`).
- **Styles**: the generator only ever sees originals. `layoutResort` styles a
  generated plot afterwards through `styleMix`: one style per family per
  district, a tenth of placements on their own, 16-tile cells outside districts.
  `classic` turns it off.

### Paving

Players place `path`, `staircase` or `mosaic`. The ground decides the actual
paving (`paving.ts`):

| Ground                                  | Paving                                             |
| --------------------------------------- | -------------------------------------------------- |
| grass                                   | `path`                                             |
| grass, laid with a mosaic style         | the style's piece, by its neighbours (`mosaic.ts`) |
| sand                                    | `boardwalk`                                        |
| sea (edge declared `overWater`)         | `jetty`                                            |
| inland water                            | `bridge` / `bridge-ramp` (`spans.ts`)              |
| lower tile of a step, higher tile paved | `stairs`, facing up the step                       |

#### Mosaic

- Four styles (`voxel-gen/mosaics/`), each six generated pieces: `single`,
  `end`, `strip`, `corner`, `edge` and `centre`. The style's own model is its
  `single`; the other five are `groundDecides`. Each declares the sides it
  borders unturned (`mosaic.borders`, north is `z = 0`).
- A tile borders every side whose neighbour is not the same style: a plain
  path, another style, a flight or bare ground. Only the four neighbours are
  read, so a concave corner shows a notch where two bands meet.
- `mosaicFit` picks the piece and the lowest turn whose borders match.
  `remosaicked` re-lays a neighbour only where the edited tile, or a climb the
  edit moved, joined or left its style, after `relaidBy` / `unlaidBy`: the turn
  is not on the occupancy index, so it compares before and after.
- A field turns with its piece, so every field is drawn four-fold symmetric.
- A mosaic tool laid over a plain path or another style repaves it in one
  click: the new tile's price, half the old one refunded.
- Pieces are held to 128 triangles (`meshBudget.test.ts`; the plain path is
  88). A plaza draws three buckets per chunk (corner, edge, centre) where a path
  draws one.
- The generator never stands a piece (the ids are in `DERIVED_IDS`). Instead
  `prepareResort` dresses a generated plot after layout (`mosaicDressing`):
  every path tile in a park, on a plaza holding a fountain, or within one tile
  of a fountain or statue, one hashed style per area, parks first. A `classic`
  plot and the authored plot stay plain, so the bench is unchanged; the sim
  report lays out with `layoutResort` directly and stays plain too.

### Rails

`railings.ts` places them, `handrails.ts` updates them after hand edits.

- A rail goes along every paved edge next to a lower, unpaved tile (open water
  counts).
- One-tile-wide stairs get a balustrade on both sides.
- Over the sea it's `pier-railing`; on bridges, `bridge-railing` and the ramp
  variants.
- Rails claim no tile and are left out of occupancy, blob shadows and sky
  visibility.

### Coast, districts and hills

- `shoreline.ts` defines the coast per column. Water isn't buildable except
  `overWater` edges, which become piers. Sand is buildable but never paved.
- The generator fills the beach with a grid of loungers and parasols, a band of
  clubs, bars and palms behind, and lifeguard towers between bays.
- `placement.ground` restricts a model to the `beach` or the `shore`
  (`placementGround.ts`); `placement.perResort` caps how many a generated resort
  gets.
- Every district has streets on all four sides. Gates only stand on the plot
  edge. `districtLayouts.ts` lays out **parks** (pond, bank walks, bridged path,
  trees) and **blocks** of one lodging type.
- `elevation.ts` defines terraces. Level 0 is sea level, neighbours differ by at
  most one level, and the beach is always level 0. The generated hill runs from
  the beach up a dune to a sand shelf with bungalows, grass benches to a crest,
  and back down to the resort.

## Terrain

- `terrain.ts` holds per-tile level and surface. Everything that reads the ground
  reads this.
- `river.ts` cuts a two-tile channel, banked in sand. Inland water is flush with
  its banks.
- `terrainSurface.ts` meshes the ground. Edges above lower tiles get a ramp;
  occupied tiles keep a flat top and a vertical wall.
- The terrain rebuilds at most once per frame, and a terrain edit rebuilds the
  whole mesh on the main thread (about half a second on a 400-tile plot).
- The sea is its own surface out to the horizon (`seaMaterial.ts`). Pools and
  rivers use `poolWaterMaterial.ts` and `riverMaterial.ts`, sharing
  `waterSurface.ts`.
- **Owned land** (`land/adapters/ownershipMask.ts`): on a bare game the ground and
  riser materials, and the far plane, take their colour through `ownershipShade`.
  An R8 texture holds a tile mask (unowned, owned, for sale). Land not owned is
  dimmed and greyed, land for sale is tinted warm while the land tool is armed,
  and a dashed chalk line runs inside owned tiles along any side that borders
  land not owned. No geometry and no draw call. The mask exists from scene
  creation, and a purchase or a new resort only rewrites its data or swaps the
  texture node's `value`, so the materials never recompile. Without land (a
  generated or authored plot) the shade is switched off by a uniform and the
  ground draws exactly as before.

## Cameras

Toggle with `C` or the View panel.

- **Perspective**: `OrbitControls`, 55° FOV. Left orbits, right pans, wheel
  zooms.
- **Isometric**: orthographic from one of four corners. `Q`/`E` rotate, left
  pans, wheel zooms. No fog.
- With a build tool active, left belongs to the tool and right does what left
  normally does (shift-right pans).
- Benchmarks always use perspective.

### Venue signs

Every venue but a lodging has a DOM sign over its first door, a storey up
(`signAnchorOf`, `hud/domain/signs.ts`), or over its roof if it has no door. The
icon is the model's `venue.sign`, else its role's, read off the family's
original (`signOf`). The signs are positioned per frame like the problem markers
(`createMarkerSpots`, capacity `MAX_SIGNS` 160), and only while a tile at the
camera's target spans 20 CSS pixels (hidden again under 16), in either camera
mode. Hovering a sign or holding Alt shows the venue's name; a click selects it.
A sign gives way to a problem marker on the same building. "Building signs" in
the Map view menu (or `N`) turns them off. They are never placed under a bench. Measured
on the generated plot with the camera swaying so every sign moves each frame:
about 0.5-0.9 ms a frame for 70-103 signs on screen. Each sign spot needs its
`will-change: transform` layer: without it, the canvas repaints and the frame
rate falls to 50-84 fps.

## Level of detail

**Draw calls are the bottleneck, not triangles.** Three.js spends about 14 µs of
main thread per draw, so each placement goes into four layers of buckets and
`InstancedWorld.updateDetail` picks one per frame (`levelOfDetail.ts`):

| Layer    | Cell                   | Mesh                       | Used when                      |
| -------- | ---------------------- | -------------------------- | ------------------------------ |
| near     | chunk (16 tiles, 64 m) | full                       | a voxel covers ≥ 3 px          |
| mid      | region (4 × 4 chunks)  | full                       | neither near nor far           |
| far      | region                 | coarse copy, if it has one | a coarse voxel covers ≤ 1.5 px |
| district | 4 × 4 regions (1 km)   | coarse copy, if it has one | a coarse voxel covers ≤ 1.5 px |

- A bucket is hidden once the model is under 3 px on screen (`HIDDEN_PIXELS`).
- Thresholds have 20% hysteresis.
- **Coarse copies are generated**: `coarsenVoxels` turns every 2×2×2 block into
  one voxel with the majority colour. A coarse copy with more than 60% of the
  original's triangles is dropped (`worthCoarsening`).
- **People** aren't bucketed. Anyone under 3 px is packed out of the draw.
- Construction sites, the placement ghost, terrain, balloons, litter and the bay
  aren't levelled.
- Toggle in the Camera window or with `?lod=0`. The _Debug_ window (F3, or
  Menu → Debug info) shows draws, frame times, GPU time, buckets per layer and
  shader count.

### Shader builds

Three.js's WebGPU renderer builds a shader per `InstancedMesh`, which cost
milliseconds each for thousands of buckets. So a bucket is a plain `Mesh` over an
`InstancedBufferGeometry` that shares the catalogue's attributes, with the
instance matrix read in `positionNode` (`standOnInstances`). All buckets with the
same material share one shader. The crowd, bay and balloons still use
`InstancedMesh` (only a few per resort).

## Preparing a resort

Generating, laying out and baking a large plot takes seconds.
`resort-prep/domain/prepareResort.ts` does it as one pure function, and
`resortPreparer.ts` runs it in a worker (`prepWorker.ts`) with a main-thread
fallback.

- The worker returns the plan, layout, lamp anchors, moorings, the baked light
  volume and terrain meshes (buffers are transferred, not copied).
- Instances, textures, the walk network, crowd and indexes stay on the main
  thread.
- Generate and Clear are async. The current resort keeps running and accepting
  edits until the new one is swapped in. The newest request wins.
- At load, meshing the catalogue and preparing the first resort run in parallel.

## Building

All tools share `tileStroke.ts`: picking, filling between pointer samples, and
Escape to cancel.

- **Picking**: `groundPick.ts` tests the pointer ray against each level, top down.
- **Placing**: click to place, drag for one-tile objects. The ghost is green or
  red.
- **Bulldozer**: removes anything on a tile, including paving. Rails and stairs
  update accordingly.
- **Terrain brushes**: raise, lower, grass, sand, water. The tile must be empty
  and neighbours can differ by at most one level. Brushes reach one plot-width
  beyond the plot.
- **Owned land**: on a bare game, building, paving, digging and zoning stop at
  the edge of the land owned (`ownsTile`), and the ghost turns red there; a click
  says why. An entrance must face the edge when placed (`facesUnowned`). The
  **land tool** (`landPointer.ts`, key `L`) shows the parcel under the pointer
  and buys it, or every parcel a drag crosses. See
  [crowd.md](crowd.md#land).

### Construction

A new building starts as a foundation and grows over a few seconds.
`construction.ts` owns the timing (`buildSeconds` from model size,
`revealHeightOf`), `constructionField.ts` draws it, `showcase.ts` ticks it.

- The stages aren't separate meshes. The finished geometry is cut per fragment on
  `maskNode` (shadows too), so every model gets an animation for free.
- Two hashes, per voxel column and per voxel, make it grow voxel by voxel rather
  than as a flat cut.
- Only `lodging` and `amenities` over 3 000 voxels get a site. Paving never does.
- Tiles are claimed immediately; the instance, shadow and lamps appear when it's
  finished. Bulldozing a site cancels it.

## Lighting

- **Lamps**: `lightGrid.ts` bakes every lamp into a 3D texture at startup
  (irradiance plus direction), read through `emissiveNode`. The volume budget is
  48 MB up to a 160-tile plot, growing to 128 MB. The volume is reserved over
  the plot, or over the bounding box of the land owned on a bare game, so a
  256-tile world is lit at 5 voxels a cell while it owns its starting block and at
  7 once it owns everything. `liveLightGrid.ts` re-bakes only
  the affected block when a lamp is placed or removed.
- **Sky visibility**: `skyVisibility.ts` bakes how much sky each cell sees into
  the volume's alpha, used as ambient occlusion. Terrain isn't in it.
- **Blob shadows**: `blobShadows.ts`, one quad per tall enough object, in one
  mesh, updated when the sun moves.
- **Day/night**: `skyStateFor(time)` returns sun, ambient, sky, fog and lamp
  level.

## Weather

`sim/domain/weather.ts` decides the weather and its effect on guests (see
[crowd.md](crowd.md#weather)). `features/weather/` draws it. They only share the
`Weather` value.

- **Rain** is one never-culled `InstancedMesh` of streaks (`rainField.ts`), up to
  4 200 in a storm. A clear day hides the mesh and skips the per-frame update.
- Drop size and speed are in **screen pixels**, so rain looks the same at every
  zoom. The rain column covers what the camera sees and follows the camera.
  Positions are computed from elapsed time, so it's frame-rate independent.
- Streaks are faint (about 1.6 px wide, 0.15–0.22 alpha), unsorted, with no depth
  write. Wind shears them.
- **Lightning** (`lightning.ts`) is a pure function of time, so pausing doesn't
  bank strikes and bench runs are reproducible. `flashSky` brightens ambient and
  background only, not lamps or windows.
- Balloons aren't launched on wet days.
- The weather can be pinned from the bar or `?weather=`; it isn't saved.

## Fireworks

A show (`fireworks/`) is a pure function of a seed and a playhead in real
seconds, like the lightning, so it plays on while the game is paused and a
load replays the same night.

- **Plan** (`show.ts`): 60, 75 or 90 s by size. An opening of single shells,
  a body with mirrored pairs from opposite sites, a finale at five a second,
  closing with a ring from every site. Launched from up to five points eight
  tiles out to sea over the middle of the owned beach (`launch.ts`), bursting
  150 to 260 voxels up.
- **Stars** (`stars.ts`): worked out from age, never integrated. A star fades by
  shrinking and darkening, never by transparency, and one that would fall into
  the sea is not drawn. `writeStars` walks only the shells alive (a binary
  search), oldest first, and allocates nothing.
- **Field** (`fireworksField.ts`): one never-culled `InstancedMesh` of unlit,
  fogless cubes with per-instance colour, up to `MAX_INSTANCES` (4 096; a grand
  finale peaks near 750): one draw call while a show is in the air, none
  otherwise. Built once at mount, like the rain, and cleared on a new resort.
  It follows the running fireworks run every frame (`syncFireworks`): a run
  with no show starts one at the playhead its progress implies; a run gone
  stops the launches and lets what is in the air burn out.
- **Light** (`light.ts`): while anything is in the air a warm glow lifts the
  ambient light (`AIRBORNE_GLOW`), so the crowd on the sand can be seen between
  bursts, and each burst adds a flare in its own colour that fades over two
  seconds. Both go through `litSky`, the function the lightning's `flashSky`
  now calls, at up to about half a flash. Lamps and shadows are not touched.
- **Show pace** (`pace.ts`): while a run's show plays, the simulated clock is
  slowed so the run's 30 minutes last as long as the show on screen. It never
  speeds the clock up, does nothing while paused, and leaves the lightning on
  real seconds. `showPace` returning 1 is the alternative: no pace, and a show
  cut short when its run ends.
- The lanterns stay on the sand on a fireworks night.
- **Bench**: `?fireworks=small|medium|grand` (`pnpm bench --fireworks grand`)
  plays a show with no sim effect, no sound and no pace, timed so the last
  measured frame is the finale's peak. The authored bench plot has no shore,
  so it has nowhere to launch from and draws nothing.

## Benchmarks

`pnpm bench` drives Chrome against a running dev server using `?bench=1`, which
pins the camera and clock. A run only compares with the previous one if the scene
hasn't changed, so everything in a bench run must be deterministic.

```bash
pnpm dev &                         # bench doesn't start the server
pnpm bench                         # all four cases
pnpm bench -- --case night-street  # one case
pnpm bench -- --repeat 1,2,3       # tile the plot to test larger resorts
pnpm bench -- --no-worker          # mesh on the main thread
pnpm bench -- --no-lod             # disable level of detail
pnpm bench -- --weather storm      # pin the weather
pnpm bench -- --no-vsync           # uncapped frame rate
pnpm bench -- --webgl              # WebGL2 fallback
pnpm bench -- --shots ./shots      # screenshot per case
```

The same options work as URL parameters
(`?bench=1&view=street&time=0.02&repeat=3&lod=0&weather=storm`). `?people=n` sets
the crowd size.

In a bench run everything moves by a fixed `MAX_STEP` per frame and the crowd
walks at real time.

Last measured on an M2 Pro at 2880 × 1626, `day-overview`, `--no-vsync`:

| Weather | Draw calls | Triangles | CPU median | GPU median |
| ------- | ---------- | --------- | ---------- | ---------- |
| clear   | 282        | 1.16 M    | 1.70 ms    | 4.78 ms    |
| storm   | 283        | 1.22 M    | 2.60 ms    | 5.24 ms    |

The litter field adds 2 draw calls and about 22 000 triangles (278 and 1.14 M
before it). The ball field adds 3 draw calls and about 770 triangles, at no
measurable cost (287 and 1.18 M before it, both medians unchanged). The lifeguard and animator figures add 2 more, one per staff model
(280 before). The medians were taken on a busier machine than the rows before
them: the tree without the new figures measured 1.70 ms and 5.11 ms in the same
session.

The storm difference includes the 617 lamps that come on under cloud.

Model variants (`pnpm bench -- --styles mixed|scatter`), same machine and case,
2026-09-29. `--styles` styles the authored plot, which otherwise keeps the
originals; with no districts on it, `mixed` falls back to 16-tile cells.
`startup` and `mesher` are the first of two runs, the second agreed within 10%:

| Tree                         | Draw calls | Triangles | CPU median | GPU median | Startup | Mesher  |
| ---------------------------- | ---------- | --------- | ---------- | ---------- | ------- | ------- |
| before variants (`cbca9a1`)  | 282        | 1.15 M    | 1.90 ms    | 8.91 ms    | 3219 ms | 2529 ms |
| variants, originals only     | 282        | 1.15 M    | 1.50 ms    | 7.86 ms    | 5984 ms | 3854 ms |
| variants, `--styles mixed`   | 412        | 1.18 M    | 3.00 ms    | 8.00 ms    | 6124 ms | 3838 ms |
| variants, `--styles scatter` | 432        | 1.19 M    | 2.20 ms    | 6.62 ms    | 6081 ms | 3846 ms |

The GPU medians were taken on a busier machine than the weather table. Both
budgets in plan 040 were exceeded (`mixed` +46% draw calls against 20%, startup
+86% against 50%); the maintainer accepted them after the game held 120 fps.
Meshing variants on first placement is the lever if startup matters later.

Mosaic paving (`pnpm bench -- --mosaic`), same machine, `--no-vsync`,
2026-10-04. `--mosaic` paves the authored plot's 2 353 path tiles wall to wall,
one style per 16-tile cell, cycled so neighbouring chunks differ. Each run twice,
in both orders; the second agreed, and the rows give the first:

| Tree, `day-overview`            | Draw calls | Triangles | CPU median | GPU median | Startup | Mesher  |
| ------------------------------- | ---------- | --------- | ---------- | ---------- | ------- | ------- |
| before mosaic (`893ef24`)       | 292        | 1.19 M    | 1.30 ms    | 3.41 ms    | 5712 ms | 4994 ms |
| mosaic, plot as authored        | 292        | 1.19 M    | 1.30 ms    | 3.41 ms    | 6075 ms | 5300 ms |
| mosaic, `--mosaic` wall to wall | 372        | 1.14 M    | 1.50 ms    | 3.41 ms    | 5685 ms | 4971 ms |

On `day-street`, `--mosaic` draws 527 against 436 and takes 2.00 ms of CPU
against 1.70 ms. Draw calls and triangles before and after are identical in all
four cases; startup and mesher agree within 7% (the second runs, 5604 and
5673 ms startup, within 2%). Wall to wall mosaic costs +27% draw calls and
+0.2 ms CPU, inside plan 067's budgets of +50% and +1 ms; triangles fall, since
most pieces are cheaper than the plain path's 88.

The generator goes up to 480 × 480 tiles (`PLOT_TILES`): about 60 000
placements and 8 000 people at full density.

## Adding an object

1. Write the model in `voxel-gen/models/` and add it to `models/index.ts` (see
   [voxel-gen/README.md](../voxel-gen/README.md)).
2. Declare `tiles` and `category`, plus `emissive`, `water`, `lights`, `seats`,
   `venue` and `placement` as needed.
3. Check it with `pnpm preview <id>` and `pnpm preview --audit`.
4. Use only palette colours (`palette.test.ts`).
5. Add it to `RESORT_PLAN` in `src/features/layout/domain/resortPlan.ts`.
6. Run `pnpm test` (`dveEngine.test.ts` meshes the whole catalogue), and
   `pnpm bench` if it's placed a lot.

Nothing in `src/` needs to change. A new style of an existing model goes in
`voxel-gen/variants/` instead (see the README). The catalogue has 93 models plus
54 variants, which roughly doubles the voxels meshed at load.

## DVE integration

- Only DVE's data model and mesher are used, from our own worker. The output goes
  to Three.js.
- `dveEngine.ts` dynamically imports ten unversioned internal subpaths of
  `@divinevoxel/vlox` after `EngineSettings.syncSettings`. `tsc` won't catch
  breakage there; only `dveEngine.test.ts` will. Run it after every DVE upgrade.
- `vite.config.ts` resolves the extensionless ESM imports of `@divinevoxel/vlox`
  and `@amodx/*`.
- DVE gets a single placeholder texture; colour comes from materials.
- DVE winds triangles clockwise; `flipWinding` fixes that for Three.js.
- DVE stores submesh materials as `Uint8` and uses six itself, hence the
  250-colour limit. Colour 251 silently renders as `dve_solid`.
- DVE's world is module-level state. Scratch regions use roughly the first 2 000
  voxels of x, so tests should paint well past that.

## Not done

- Occlusion culling, bigger batches (`BatchedMesh`, indirect draws).
- Dynamic resolution (pixel ratio is capped at 2, with MSAA).
- Chunked terrain.
- Textures.
- Shadow maps. The sun isn't occluded and lamps cast no shadows.
- Physics, multiplayer.
- Objects on slopes.
- Undo, and saving across reloads.
- Balloons and the bay don't follow hand edits.
