# Rendering

How models get from `voxel-gen/` onto the screen, plus layout, terrain, building
tools, lighting and benchmarks.

## Scale

A voxel is 25 cm. Constants in `voxel-gen/voxelgen.ts`: `TILE_VOXELS` 16 (4 m),
`LEVEL_VOXELS` 8 (2 m terrain step), `STOREY_VOXELS` 12, `PAVING_VOXELS` 2,
`BRIDGE_VOXELS` 6. A render chunk is 16 tiles. The authored plan is 112 × 100
tiles; the generator goes up to 480 × 480 (`PLOT_TILES`).

## Pipeline

1. **Catalogue**: `OBJECT_TYPES` reads each model's facts from the committed
   `voxel-gen/facts.json`. Only the mesh worker paints voxels:
   `paintedModelsOf(paintedCatalogue())` in `paintedModels.ts` is every type plus
   people, staff, balloons, boats, litter and balls, one material per colour.
2. **Layout**: `layoutResort` turns a plan into placements, paving, props and
   rails.
3. **Scratch regions**: in the mesh worker, each model gets a slice of the voxel
   world, plus one for its coarse copy.
4. **DVE**: `dveEngine.ts` paints the regions and meshes them in a worker
   (`meshWorker.ts`), falling back to the main thread.
5. **Attributes**: submeshes are grouped per model, coplanar faces greedy-merged
   (`greedyMesh.ts`), emissive and water faces split out.
6. **Instances**: `buildInstancedWorld` creates buckets per model, material and
   chunk, with spare capacity so placing is a matrix write.
7. **Lighting**: lamps baked into a light volume, sky visibility, blob shadows.
8. **Frame**: lit, unlit and water materials for the catalogue, plus terrain,
   sea, figures and moving fields (litter, balls, overlays, nameplates).

Layout, lighting and the terrain mesh run in a worker (see
[Preparing a resort](#preparing-a-resort)).

## Layout

- **Streets** are L-shaped routes between plan nodes; plazas are paved whole.
- **Spurs** connect every object to a street, from its door where possible. An
  unreachable object is a build error.
- **Decoration**: lamps beside paths, hedges along straight runs, benches.
- **An object stands on one level.** Build mode shows red otherwise.
- **Styles**: the generator only sees originals; `styleMix` assigns variants
  afterwards per family and district. `classic` turns it off.

### Paving

Players place `path`, `staircase` or `mosaic`; the ground decides what is laid
(`paving.ts`):

| Ground                 | Paving                                |
| ---------------------- | ------------------------------------- |
| grass                  | `path`, or the mosaic style's piece   |
| sand                   | `boardwalk`                           |
| sea (`overWater` edge) | `jetty`                               |
| inland water           | `bridge` / `bridge-ramp` (`spans.ts`) |
| lower tile of a step   | `stairs`, facing up                   |

**Mosaic**: four styles (`voxel-gen/mosaics/`), each with six generated pieces
(`single`, `end`, `strip`, `corner`, `edge`, `centre`). `mosaicFit` picks the
piece and turn from the four neighbours, and `remosaicked` re-lays neighbours
after an edit. Pieces are held to 128 triangles (`meshBudget.test.ts`). On
generated plots `mosaicDressing` paves parks and the area around fountains.

**Rails** (`railings.ts`, updated by `handrails.ts`) run along every paved edge
above a lower, unpaved tile. One-tile stairs get balustrades on both sides.
Rails claim no tile and are left out of occupancy and shadows.

### Coast, districts and hills

- `shoreline.ts` defines the coast. Water isn't buildable except `overWater`
  edges (piers). Sand is buildable but never paved.
- `placement.ground` restricts a model to `beach` or `shore`;
  `placement.perResort` caps it on generated resorts.
- `districtLayouts.ts` lays out parks and blocks of one lodging type, each with
  streets on all sides.
- `elevation.ts` defines terraces: level 0 is sea level, neighbours differ by
  at most one, and the beach is always level 0.

## Terrain

- `terrain.ts` holds per-tile level and surface; everything reads the ground
  from it.
- `terrainSurface.ts` meshes it. A terrain edit rebuilds the whole mesh (about
  half a second on a 400-tile plot), at most once per frame.
- The sea is its own surface to the horizon (`seaMaterial.ts`); pools and rivers
  share `waterSurface.ts`.
- **The flotilla** (`flotilla.ts`, drawn by `seaField.ts`) is buoys, drifting
  craft, then each rental's fleets in placement order. Hire craft step on crowd
  time, in steps short enough to stay under a voxel at the fastest fleet's pace
  (more of them, up to 64, for jet skis). A towed craft follows right after its
  tug and is placed by the rope, never steered. Fleets alone are rebuilt after
  an edit that changes the huts.
- **Owned land** (`ownershipMask.ts`): an R8 tile mask dims unowned land, tints
  land for sale and draws a chalk line at the boundary. No geometry, and
  purchases only rewrite the texture, so materials never recompile.

## Cameras

`C` or the View panel toggles them. **Perspective** uses `OrbitControls`.
**Isometric** is orthographic from four corners, rotated with `Q`/`E`. With a
build tool active, left belongs to the tool and right does what left normally
does. Benchmarks use perspective.

**Venue signs** are DOM elements over each venue's door, shown once a tile spans
20 CSS pixels. They give way to problem markers, and `N` turns them off. Each
needs its own `will-change: transform` layer, or the canvas repaints and the
frame rate drops.

## Level of detail

**Draw calls are the bottleneck, not triangles.** Three.js spends about 14 µs per
draw, so each placement sits in four layers of buckets and
`InstancedWorld.updateDetail` picks one per frame (`levelOfDetail.ts`):

| Layer    | Cell                  | Mesh   | Used when                      |
| -------- | --------------------- | ------ | ------------------------------ |
| near     | chunk (16 tiles)      | full   | a voxel covers ≥ 3 px          |
| mid      | region (4 × 4 chunks) | full   | neither near nor far           |
| far      | region                | coarse | a coarse voxel covers ≤ 1.5 px |
| district | 4 × 4 regions         | coarse | a coarse voxel covers ≤ 1.5 px |

- Buckets under 3 px are hidden. Thresholds have 20% hysteresis.
- Coarse copies merge 2×2×2 blocks by majority colour, and are dropped if they
  keep over 60% of the triangles.
- People under 3 px are packed out of the draw.
- `?lod=0` turns it off. The Debug window (F3) shows draws, timings and buckets.
  GPU time needs `?gpu`.

**Shader builds**: WebGPU builds a shader per `InstancedMesh`, which costs
milliseconds each for thousands of buckets. So a bucket is a plain `Mesh` over an
`InstancedBufferGeometry`, reading the instance matrix in `positionNode`, and
buckets of one material share one shader.

## Preparing a resort

`resort-prep/domain/prepareResort.ts` generates, lays out and bakes a plot as one
pure function; `resortPreparer.ts` runs it in a worker with a main-thread
fallback. Buffers are transferred, not copied. The current resort keeps running
until the new one is swapped in, and the newest request wins.

## Building

All tools share `tileStroke.ts` (picking, filling between pointer samples,
Escape to cancel). `groundPick.ts` tests the pointer ray against each level, top
down.

- **Placing**: click, or drag for one-tile objects. The ghost is green or red.
- **Bulldozer**: removes anything on a tile; rails and stairs update.
- **Terrain brushes**: raise, lower, grass, sand, water, on empty tiles only.
- **Owned land**: building stops at the land owned, and an entrance must face
  the edge. The land tool (`L`) buys parcels. See [crowd.md](crowd.md#land).

**Construction** (`construction.ts`): large lodgings and amenities start as a
foundation and grow voxel by voxel. The finished geometry is cut per fragment on
`maskNode`, so every model animates for free. Tiles are claimed at once; lamps
and shadows appear when it's done.

## Lighting

- **Lamps**: `lightGrid.ts` bakes every lamp into a 3D texture (48 to 128 MB,
  over the plot or the owned land). `liveLightGrid.ts` re-bakes only the
  affected block when a lamp changes.
- **Sky visibility** in the volume's alpha acts as ambient occlusion.
- **Blob shadows**: one quad per tall object, in one mesh.
- **Day/night**: `skyStateFor(time)` returns sun, ambient, sky, fog and lamp
  level.

## Weather

`sim/domain/weather.ts` decides the weather (see
[crowd.md](crowd.md#weather)); `features/weather/` draws it.

- **Rain** is one `InstancedMesh` of streaks, sized in screen pixels so it
  looks the same at every zoom, and computed from elapsed time so it's
  frame-rate independent. A clear day skips it entirely.
- **Lightning** is a pure function of time, so pausing doesn't bank strikes and
  benches are reproducible. `flashSky` brightens ambient and sky only.
- The weather can be pinned with `?weather=`; it isn't saved.

## Fireworks

A show (`fireworks/`) is a pure function of a seed and a real-time playhead, so
it plays on while paused and a load replays the same night.

- **Plan** (`show.ts`): 60 to 90 s, an opening, a body of mirrored pairs and a
  finale, launched from up to five points out at sea.
- **Stars** (`stars.ts`) are computed from age, never integrated, and fade by
  shrinking rather than transparency.
- **Field**: one `InstancedMesh` of unlit cubes, one draw call while a show is
  in the air, none otherwise.
- **Light**: a warm glow plus a flare per burst, through `litSky`.
- **Pace** (`pace.ts`): the sim clock slows so the event's 30 minutes last as
  long as the show.
- `?fireworks=small|medium|grand` benches a show.

## Fires

A fire pit's flames (`bonfire/`) burn only while a bonfire event runs there, so
they are not part of its model: the pit is cold logs and ash.

- **Hearth**: the model's `venue.hearth` names where the flames rise and the
  light they cast (`hearthOf` turns it with the placement).
- **Flames** (`flames.ts`): tongues and sparks, each a function of real time,
  catching and burning down over four seconds. One `InstancedMesh` of unlit
  cubes per resort, one draw call while a fire burns, none otherwise.
- **Light**: added to the baked light volume when the fire is lit and taken out
  when it is put out (`Lighting.burn`), the way a placed lamp is.

## Benchmarks

`pnpm bench` drives Chrome against a running dev server with `?bench=1`, which
pins the camera, and the clock unless `--speed` is given. Everything in a bench
run must be deterministic.

```bash
pnpm dev &                         # bench doesn't start the server
pnpm bench                         # all cases
pnpm bench -- --case night-street  # one case
pnpm bench -- --repeat 1,2,3       # tile the plot
pnpm bench -- --no-worker          # mesh on the main thread
pnpm bench -- --no-lod             # disable level of detail
pnpm bench -- --weather storm      # pin the weather
pnpm bench -- --styles mixed       # model variants
pnpm bench -- --mosaic             # mosaic paving everywhere
pnpm bench -- --plot reference     # the reference resort, with its shore
pnpm bench -- --speed rush         # run the clock: sim, routers, crowd at its real scale
pnpm bench -- --people 5000        # guest slots (capped at 10 000)
pnpm bench -- --no-vsync           # uncapped frame rate
pnpm bench -- --webgl              # WebGL2 fallback
pnpm bench -- --shots ./shots      # screenshot per case
```

The options also work as URL parameters; `?people=n` sets the crowd size.
`?gpu` times the GPU outside a bench, for the Debug window (F3); without it the
GPU field reads n/a.
The authored plot has no shore; `--plot reference` runs the reference resort
([fixtures/README.md](../fixtures/README.md)) instead, with the sea, its boats
and the beach crowd. `--repeat`, `--styles` and `--mosaic` remake the authored
plot and are refused with it.

A running case (`--speed normal|fast|rush`) steps exactly 1/60 s a frame
(paused ones keep 0.1 s), so runs replay: the same command on the same build
ends on the same clock and guest numbers. The `cpu per frame` block is the
whole animation-loop callback (median, p95, p99, max); the frame columns above
it are the interval between frames, which under vsync reads the refresh rate.
The timings block lists the `vox:` measures: `vox:boot:*` always,
`vox:frame:sim` (with ms per tick) and `vox:frame:crowd` under a bench.
`vox:retile` fires on terrain edits only and is read in DevTools
(`performance.getEntriesByName('vox:retile')`).

Last measured on an M2 Pro at 2880 × 1626, `day-overview`, `--no-vsync`:

| Weather | Draw calls | Triangles | CPU median | GPU median |
| ------- | ---------- | --------- | ---------- | ---------- |
| clear   | 310        | 1.22 M    | 1.60 ms    | 3.54 ms    |
| storm   | 311        | 1.27 M    | 1.80 ms    | 3.60 ms    |

`--plot reference`, same machine and resolution, `--no-vsync`, two runs. The
sea's boats, swimmers, buoy lamps and the beach crowd are in it; it has 237
lamps to the authored plot's 628:

| Case           | Draw calls | Triangles | CPU median   | GPU median   |
| -------------- | ---------- | --------- | ------------ | ------------ |
| day-overview   | 346        | 767 k     | 1.60 ms      | 3.60–3.67 ms |
| day-street     | 397        | 674 k     | 1.70 ms      | 1.97 ms      |
| night-overview | 346        | 767 k     | 1.50 ms      | 3.67–3.93 ms |
| night-street   | 397        | 674 k     | 1.60–1.70 ms | 1.97 ms      |

Running, `day-overview`, `--no-vsync`, same machine and resolution, one run
each (CPU per frame):

| Speed  | Median  | p95     | p99      | Max      | Sim per tick |
| ------ | ------- | ------- | -------- | -------- | ------------ |
| paused | 1.50 ms | 4.73 ms | 16.61 ms | 20.70 ms | -            |
| normal | 1.80 ms | 3.31 ms | 18.50 ms | 31.20 ms | 0.42 ms      |
| fast   | 2.20 ms | 3.40 ms | 4.00 ms  | 6.20 ms  | 0.43 ms      |
| rush   | 3.50 ms | 5.00 ms | 6.00 ms  | 7.30 ms  | 0.30 ms      |

`--speed rush --plot reference --people 5000`: 6.00 ms median, 11.10 ms max;
the crowd takes 2.5 ms of it and the sim 0.97 ms a tick.

Variants (`--styles mixed`) cost about +46% draw calls and nearly double
startup; wall-to-wall mosaic about +27% draw calls and +0.2 ms CPU. Meshing
variants on first placement is the lever if startup matters.

## Adding an object

1. Write the model in `voxel-gen/models/` and register it in `models/index.ts`
   (see [voxel-gen/README.md](../voxel-gen/README.md)).
2. Declare `tiles` and `category`, plus `emissive`, `water`, `lights`, `seats`,
   `venue` and `placement` as needed.
3. Check it with `pnpm preview <id>` and `pnpm preview --audit`.
4. Run `pnpm test` (`dveEngine.test.ts` meshes the whole catalogue), and
   `pnpm bench` if it's placed a lot.
5. Put it on the reference resort and re-export it, or add it to
   `NOT_IN_REFERENCE` in `referenceResort.test.ts`
   ([fixtures/README.md](../fixtures/README.md)).

Nothing in `src/` needs to change. Styles of an existing model go in
`voxel-gen/variants/`.

## DVE integration

- Only DVE's data model and mesher are used, from our own worker; output goes to
  Three.js.
- `dveEngine.ts` imports ten unversioned internal subpaths of
  `@divinevoxel/vlox`. `tsc` won't catch breakage there, only
  `dveEngine.test.ts`, so run it after every DVE upgrade.
- `vite.config.ts` resolves the extensionless ESM imports of DVE and `@amodx/*`.
- DVE winds triangles clockwise; `flipWinding` fixes that.
- DVE stores materials as `Uint8` and uses six itself, hence the 250-colour
  limit.
- DVE's world is module-level state. Scratch regions use roughly the first
  2,000 voxels of x, so tests should paint well past that.

## Not done

Occlusion culling, `BatchedMesh`, dynamic resolution, chunked terrain, textures,
shadow maps, objects on slopes, undo. Balloons and the bay don't follow hand
edits.
