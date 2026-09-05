# Vox Resort — Milestone 2: A Resort, Instanced

A voxel resort-builder prototype. Milestone 1 stood one instance of every object
type on a plot to prove the pipeline. This milestone turns that into an actual
resort — a hundred-odd buildings on streets rather than on paving, dressed with
lamps and hedges, lit by a day/night cycle — and rebuilds the renderer around
instancing so the scene can grow without the frame budget growing with it.

## Scale

One tile is `TILE_VOXELS` (16) voxels and stands for **4 m**, so a voxel is 25 cm
and a storey is 12 voxels. Every model is authored at that scale and fills the
footprint it declares, which is what keeps a palm, a bungalow and a hotel in
proportion once they stand on the same plot.

The plot is 60 × 52 tiles — **240 × 208 m**.

## What is on the plot

|                                             |                                   |
| ------------------------------------------- | --------------------------------- |
| Authored objects                            | 115, of 31 types                  |
| Lamps and hedges the layout scatters itself | 285                               |
| Paved tiles                                 | 701 (22% of the plot)             |
| Instances drawn                             | 1 101                             |
| Draw calls                                  | 34                                |
| Triangles submitted per frame               | 3.1 M                             |
| Triangles uploaded to the GPU               | 524 k                             |
| Voxels the resort is made of                | 3.2 M                             |
| Voxels actually meshed                      | 769 k (one copy of each model)    |
| Light anchors                               | 85, of which at most 16 ever burn |

Measured in Chrome on the WebGPU backend: 60 fps (vsync) in daylight, and the
night cost is entirely the point lights — see _Lighting_ below.

## Stack

| Concern         | Choice                                                           |
| --------------- | ---------------------------------------------------------------- |
| Package manager | pnpm                                                             |
| Build / dev     | Vite 8                                                           |
| Language        | TypeScript 7                                                     |
| Lint / format   | oxlint + oxfmt (no ESLint, no Prettier)                          |
| Renderer        | Three.js `WebGPURenderer` (`three/webgpu`), auto WebGL2 fallback |
| Voxels          | Divine Voxel Engine (`@divinevoxel/vlox`)                        |
| Models          | Hand-authored in `voxel-gen/`, previewed offline as PNGs         |
| UI              | React 19, DOM overlay above the canvas                           |
| Tests           | Vitest                                                           |

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Other scripts: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format`,
`pnpm test`, and `pnpm preview` to render model previews (see
`voxel-gen/README.md`).

Orbit with the left mouse button, pan with the right, zoom with the wheel. The
HUD shows the frame rate, the backend actually in use, the scene counts, and a
time-of-day slider with a checkbox that runs the cycle on its own. Each object
_type_ carries one floating label; the repeats, the props and the path tiles do
not.

## Structure

Code is grouped by feature. Each feature has a `domain/` folder holding pure
functions with no I/O, each covered by a unit test. Everything that touches an
engine, the DOM or the GPU lives outside `domain/`. The models are art, not app
code, so they sit outside `src/` entirely.

```
voxel-gen/                    the model authoring tool
  voxelgen.ts                 VoxelBuilder, model types, TILE_VOXELS
  preview.ts                  offline isometric PNG renderer + size audit (CLI)
  models/*.ts                 one file per object; models/index.ts is the registry
  model-prompts.md            the prompts and dimension table models were authored from
src/
  app/                        showcase orchestration + React root
    showcase.ts               catalogue -> plot -> geometry -> instances -> scene
    App.tsx, main.tsx, styles.css
  features/
    catalog/domain/           adapts the models for the app
      objectTypes.ts          builds every model, derives materials and emissive colours
      materials.ts            colour -> DVE voxel/material identity
    layout/domain/
      resortPlan.ts           the authored plot: plots, street graph, plazas
      resortLayout.ts         plan -> placements, routed paths, spurs, lamps, hedges
      worldBounds.ts          world extent and camera framing
    lighting/
      domain/dayNight.ts      time of day -> sun, ambient, sky, lamp factor
      domain/lightAnchors.ts  which anchors the light pool is aimed at
      nightLights.ts          the pool of point lights itself
    voxel-world/
      domain/                 sector/section arithmetic, scratch regions
      dveEngine.ts            Divine Voxel Engine adapter
    rendering/
      domain/vertexBuffer.ts  DVE vertex stream -> Three.js attributes
      threeScene.ts           WebGPURenderer, camera, ground, sky, OrbitControls
      voxelMeshBuilder.ts     mesher output -> one geometry per model
      instancedWorld.ts       geometries + placements -> InstancedMeshes
    hud/
      domain/                 FPS sampling, world -> screen projection
      Hud.tsx, FpsCounter.tsx, ObjectLabels.tsx
```

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
   would contain if it were painted out in full.
5. **Geometry** — `buildModelGeometries` groups the mesher's submeshes back per
   model, folds the colour into a **vertex attribute**, and splits the emissive
   colours into a second geometry.
6. **Instances** — `buildInstancedWorld` creates one `InstancedMesh` per model
   per material kind and fills it with one translation matrix per placement.
7. **HUD** — labels are projected with `projectToScreen` and positioned directly
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

Because the plan stands fifteen cottages on the plot, a placement carries both
its type (`id`) and a unique `key`.

## Rendering: what is optimised, and what is not

**Face culling, twice.** DVE's mesher drops the faces between two solid voxels,
so a solid building costs only its surface. Three.js then culls back faces on the
GPU — which only works because `flipWinding` reverses DVE's Babylon-wound
triangles first (see the notes below).

**Colour in the vertices.** Milestone 1 gave each of the 217 colours its own
material and its own mesh. That is 217 draw calls, and each mesh spanned the
whole world, so frustum culling never had anything to cull. Colour now rides in a
vertex attribute and the whole resort shares two materials — one shaded, one
unlit — which is what makes instancing possible at all.

**Instancing.** Every object stands in its own footprint and never touches its
neighbours, so a model can be meshed once and repeated. 1 101 objects become 34
draw calls and 524 k uploaded triangles. Adding another fifty cottages costs
fifty matrices and no new geometry.

The trade this makes: two adjacent path tiles no longer cull the faces they share,
because each is meshed alone. That is worth roughly 250 extra triangles per path
tile — paid once in a shared geometry, and cheap next to what a world-sized
re-mesh would cost every time anything moves.

**Still not done.** Greedy meshing (a 16 × 16 path slab is 512 voxels of flat
top that could be a handful of quads); per-instance frustum culling, which needs
instances sorted into spatial chunks; LOD; occlusion culling; and any texturing
at all.

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

`skyStateFor(time)` turns a normalised time of day into the sun's direction,
colour and intensity, the ambient fill, the sky and fog colour, and a lamp factor
that is 0 in daylight and 1 after dark. All of it is pure, so the curve is tuned
against a test rather than against a frame.

The plot carries 85 light anchors, but only `MAX_ACTIVE_LIGHTS` real point lights
ever exist; each frame budget the pool is aimed at the anchors nearest the camera.
The cap matters, because Three.js compiles the light count into the shader and
every lit fragment then walks the whole list. Measured on this scene:

| Active point lights | fps        |
| ------------------- | ---------- |
| 0 (daylight)        | 60 (vsync) |
| 8                   | 60 (vsync) |
| 16                  | 50         |
| 24                  | 23         |

Sixteen is the default. Getting past that ceiling means clustered or deferred
lighting written in TSL, which is a milestone of its own.

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

A new object also needs a plot: add it to `RESORT_PLAN` in
`src/features/layout/domain/resortPlan.ts`. It does not need a corridor — the
spur pass will reach it — but it does need somewhere for a spur to run. The unit
tests fail if the plan leaves an object unplaced, overlapping, off the plot or
walled in.

To make the scene bigger, add plots. Nothing else has to change: repeated types
become extra instances, and the lamps, hedges and paths that dress them are
derived.

## Notes on the DVE integration

- DVE normally spreads world, mesher and generator contexts across web workers
  behind a Babylon.js renderer. Only its data model and mesher are needed here,
  so the engine is driven on the main thread and its output is handed to Three.js
  instead.
- Several DVE modules snapshot engine settings at module-evaluation time, so
  `dveEngine.ts` imports them dynamically, after `EngineSettings.syncSettings`.
- `@divinevoxel/vlox` and `@amodx/*` publish extensionless ESM specifiers, which
  Node's resolver rejects. `vite.config.ts` routes them through Vite's resolver
  for both the app and the test runner.
- Colour comes from the material, not from a texture, so DVE's texture pipeline
  is satisfied with a single flat placeholder entry — no atlas, no image loading.
- DVE winds its triangles for Babylon.js, which treats clockwise as front-facing;
  Three.js treats counter-clockwise as front-facing. `flipWinding` reverses every
  triangle. Without it the renderer culls exactly the faces that should be
  visible and keeps the ones facing away, so objects are see-through from the
  near side — invisible on a convex placeholder box, obvious on anything with an
  overhang or a porch.
- `dveEngine.test.ts` meshes the whole catalogue once. It is the only test that
  boots the engine, and it exists to catch registration drift: a model painting a
  material the DVE registry never heard of would otherwise lose or mis-colour
  those faces silently.
- DVE keeps its world in module-level statics, and the scratch regions occupy
  roughly the first 2 000 voxels of x. Anything else painted into that world for
  a test has to be parked well past them.

## Out of scope for this milestone

Texture atlases, greedy meshing, spatial chunking and per-instance culling,
clustered/deferred lighting, shadows, player placement/editing, procedural
terrain, physics and multiplayer.
