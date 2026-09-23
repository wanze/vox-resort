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
   per colour. `PAINTED_MODELS` adds people, staff, balloons and boats.
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
   sea, figures and moving objects.

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

### Paving

Players only place `path`. The ground decides the actual paving (`paving.ts`):

| Ground                                  | Paving                                |
| --------------------------------------- | ------------------------------------- |
| grass                                   | `path`                                |
| sand                                    | `boardwalk`                           |
| sea (edge declared `overWater`)         | `jetty`                               |
| inland water                            | `bridge` / `bridge-ramp` (`spans.ts`) |
| lower tile of a step, higher tile paved | `stairs`, facing up the step          |

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

## Cameras

Toggle with `C` or the View panel.

- **Perspective**: `OrbitControls`, 55° FOV. Left orbits, right pans, wheel
  zooms.
- **Isometric**: orthographic from one of four corners. `Q`/`E` rotate, left
  pans, wheel zooms. No fog.
- With a build tool active, left belongs to the tool and right does what left
  normally does (shift-right pans).
- Benchmarks always use perspective.

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
- Construction sites, the placement ghost, terrain, balloons and the bay aren't
  levelled.
- Toggle in the Camera panel or with `?lod=0`. _Details_ shows draws, frame
  times, GPU time, buckets per layer and shader count.

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
  48 MB up to a 160-tile plot, growing to 128 MB. `liveLightGrid.ts` re-bakes only
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
| clear   | 278        | 1.14 M    | 1.50 ms    | 3.08 ms    |
| storm   | 279        | 1.19 M    | 1.70 ms    | 3.60 ms    |

The storm difference includes the 617 lamps that come on under cloud.

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

Nothing in `src/` needs to change.

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
