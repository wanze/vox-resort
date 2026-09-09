# People on the plot

The resort is built, lit and dressed, and nothing in it moves. This is the plan
for the first thing that does: a few hundred people walking the paths and the
beach.

Everything below is a design and a build order, not a description of what is
there — see the milestones at the end for what has actually landed. The numbers
in _What it should cost_ are arithmetic, and stay claims until `pnpm bench` says
otherwise.

## The problem this has to solve

Every fast thing in this resort is fast because it is static. The catalogue is
meshed once whatever the plan does with it; the lamps and the sky visibility are
baked into a volume at load; instances are bucketed by chunk so Three.js has a
bounding sphere small enough to cull; blob shadows are rewritten only when the
sun moves. See [rendering.md](rendering.md) for all of it.

People break every one of those assumptions if they are let anywhere near them.
And the budget is not where a first guess puts it: `pnpm bench` already reports
the overview as **CPU**-bound well before it is GPU-bound — 21.7 ms of GPU inside
a 49.9 ms frame at nine times this plot. So the number that matters for a crowd
is **work per person per frame on the CPU**, and the triangles are close to free.

Four rules follow, and they are the whole design.

### A person is thirty voxels, not a building

At four voxels to the metre a person is seven voxels tall and three wide: **28
painted voxels** as authored, 24 for a child, and on the order of 50 triangles
once the greedy merge has had them. Six hundred people is around 30 k triangles
against the 2.18 M the resort already submits — a rounding error, and the same
order as the 2 870 the blob shadows cost.

That single fact is what licenses the next rule.

### One mesh per person model, and **not** chunked

This deliberately inverts `domain/spatialChunks.ts`, so it is worth saying why.

Chunking exists to give a static mesh a bounding sphere the renderer can reject.
A person crosses a 64 m chunk every forty seconds or so, and keeping the crowd
bucketed would mean a remove, an add and a bounding-sphere recompute per
crossing — which is exactly the per-frame churn the mutable scene was designed to
pay only when something is actually built. Six hundred people wandering would
pay it continuously, to save 30 k triangles.

`blobShadowField.ts` already settled the same trade from the other side: one
mesh, no culling, because two triangles per object is cheaper than a draw call
per chunk. A person is the same shape of problem. Four person models is four
draw calls, never culled, and that is the right answer until the crowd is in the
thousands.

### Walk a graph, so a frame is arithmetic and nothing else

The per-frame step must not call `groundAt`, `levelAt`, `terraceAt`, or touch the
occupancy index. Those are questions about a plot that is not changing, so they
are answered once, when the resort is built, into a **walk network**.

A person is then never "somewhere on the plot"; a person is **on an edge, at a
parameter `t`**. A frame is `t += speed · dt / length`, a lerp between the edge's
two endpoints, and one matrix write. Height falls out for free: each node carries
its own `y`, so lerping across a stair edge _is_ the climb up the flight, and
nothing ever asks the terrain how high it is.

### People claim no ground, and nothing bakes them

The same rule handrails already follow, for the same reason — see
[rendering.md](rendering.md), _Stairs and paths get handrails_. A person is not a
`Placement`. People are not in `layout.placements`, `props`, `paths` or `rails`;
not seeded into `tileOccupancy`; not diffed by `diffPlacements`; given no HUD
label anchor; and above all **not splatted into the lamp bake or the
sky-visibility bake**, both of which are static by construction and would have to
be rebuilt every frame.

What people _do_ get for free is the light. They are drawn with the ordinary lit
material, so `bakedLightVolume` samples the volume at whatever position the
instance matrix put them at — which means a crowd walks correctly through the
pools of light the street lamps cast, at no cost at all, because the fetch was
already happening.

They get no blob shadow. A blob's quad is rewritten when the sun moves, which is
rarely; a walking person's would be rewritten every frame, for every person. That
is a fill-rate and a matrix-write bill with no feature behind it.

## The walk network

Derived from the layout once per resort, in `domain/`, and it falls out of
invariants the layout already holds rather than needing new ones.

**Nodes** — one per paved tile, at the tile's centre, carrying that tile's own
`y`. `layout.paths` is exactly that list already.

**Edges** — between two 4-neighbour paved tiles where the levels differ by at
most one, and where a difference of one is only walkable if the lower tile is a
**stairs** tile. Nothing has to be checked beyond that: `stairs.ts` guarantees a
flight exists only where the higher neighbour is paved, and `elevation.ts`
guarantees neighbouring tiles never differ by more than a level. So the rule
cannot produce a walk up a wall, and it needs no special case for a terrace edge.

**The beach is a region, not a set of nodes.** Grid-walking a 112 × 14 field of
sand reads as a chessboard, and the beach is the one place people should move
freely. So sand gets the one extra state: pick a random point in the sand band,
walk straight to it, pick another, and leave by a boardwalk node with some small
probability per arrival. The target needs no query either — `shoreFor` gives
`waterStartZ(x)` per column, and the beach is level 0 by an invariant
`elevation.ts` enforces, so `y = 0` and the z range is arithmetic.

Two states, one step loop, one branch.

Two rules keep a roamer out of the sea, and the first of them was a bug before it
was a rule. A roamer walks a **straight line** to whatever they pick — so two
points that are both on sand can have water between them, because the coast
wanders, and picking a target anywhere on the beach sent people wading across a
bay. Targets are therefore drawn from within a few columns of where the person
already stands, which keeps the chord shorter than the coast's own meander moves;
and they stop a tile short of the water, which is where the sea washes over the
sand anyway. Both are cheap because they are arithmetic on a number
`waterStartZ` already returns.

## How the crowd is stored

Structure of arrays, fixed capacity, no allocation per frame. This is the same
discipline the mesh attribute arrays already keep, and for the same two reasons:
nothing for the collector to walk sixty times a second, and a layout that a
compute shader could take over later as a port rather than as a rewrite.

```
Float32Array  x, y, z, heading, phase        // where a person is, and facing
Float32Array  fromX/Y/Z, toX/Y/Z, t, rate    // the segment they are walking
Float32Array  speed
Int32Array    node, cameFrom, gate, variant
```

`node` is the node being walked to, or `-1` while out on the sand, and that one
integer is the whole of the path/beach distinction. `cameFrom` is what stops
somebody turning straight back round at every tile, and `gate` is the way back in
off the beach.

No `Person` objects and no array of records. The attributes the crowd will grow
later — sex, name, age, hunger, thirst, energy, a bed — are **more columns**, and
none of them changes anything above.

## Determinism, because the benchmark depends on it

`rendering.md` is explicit that a bench run "only compares with the one before it
if the scene has not moved". A randomly wandering crowd moves the scene, so two
runs would never agree and the whole measurement apparatus would stop
discriminating.

So: a **seeded** PRNG for spawning and for every turn, and in bench mode a
**fixed** simulation timestep rather than the frame's own `dt`. Outside bench
mode the frame's `dt` is used but clamped, so a tab that was in the background
for a minute does not teleport the entire crowd across the plot.

## Animation

The CPU writes a translation and a yaw, and nothing else.

The walk cycle rides an **instanced `phase` attribute** and a time uniform
through TSL's `positionNode`: vertices below knee height are displaced by
`sin(t · speed + phase)`, scaled by how far below the knee they sit. Legs swing,
the CPU pays nothing, and there is no second geometry and no per-frame instance
churn. A body bob can go straight into the matrix the CPU is writing anyway.

## Where the art lives

**A registry of its own**, `voxel-gen/people/`, not `MODEL_SOURCES`.

A person does not fill a tile footprint, must never be offered on the build
palette, and must not be stood on the plot by `resortGenerator.test.ts`, which
asserts that the whole catalogue places. Keeping people in a second registry
leaves `OBJECT_TYPES` meaning exactly what it means today — the things that stand
on tiles — and touches none of those tests. Both registries feed the one meshing
pipeline, because a person is meshed exactly the way a cottage is.

People are painted from the same `palette.ts` as everything else, and that is not
a formality: a crowd dressed in colours the buildings do not use is a crowd that
looks pasted on. Clothing comes from the families already there — stucco, bloom,
amber, water, foliage, slate, teak — and the palette's own advice is to prefer a
step of an existing ramp over a new family. Only **skin** is genuinely absent
from a palette built for buildings, so it is the one family the crowd adds.

## What it should cost

Six hundred people, by arithmetic rather than by measurement:

|                         |                                         |
| ----------------------- | --------------------------------------- |
| Draw calls              | 4, one per person model, never culled   |
| Triangles per frame     | ~30 k, against 2.18 M already submitted |
| Matrix upload per frame | ~38 KB                                  |
| Step loop               | **11 µs**, measured                     |

The last row is the only one that has actually been run: 600 people on the
reference generated plot — 1 870 paved tiles, 4 328 edges, 28 gates onto the
beach — stepped at 11 µs a frame in Node. That is 0.07% of a 16 ms frame, and
two orders of magnitude under the "few hundred µs" this table first estimated,
because the loop turned out to be smaller than the guess: a multiply-add, a
compare and three lerps.

The other three rows are still arithmetic. Nothing is drawn yet, so `?people=n`
and a bench case remain part of the build order below.

## Build order

| #   | Step                                                                                                                          | Where                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | The art: a skin family in the palette, a shared figure builder, four person models, and the preview able to render them       | `voxel-gen/palette.ts`, `voxel-gen/people/`           |
| 2   | The walk network from a layout, shore and elevation, with tests for stair edges, water, and connectivity                      | `crowd/domain/walkNetwork.ts`                         |
| 3   | The crowd: SoA state, seeded spawn, `stepCrowd(state, dt)`, path ↔ beach transitions. Pure, and unit-tested without a browser | `crowd/domain/crowd.ts`                               |
| 4   | Meshing: feed the people registry through the existing scratch and worker path                                                | `voxel-world/adapters/`, `showcase.ts`                |
| 5   | The field: a mesh per model, per-frame matrix writes, the instanced phase attribute and the TSL leg swing                     | `crowd/adapters/crowdField.ts`                        |
| 6   | Wire in: build the network when the resort is built or regenerated, step it in the animation loop, dispose it                 | `showcase.ts`                                         |
| 7   | Measure: `?people=n`, a count in the HUD stats, a bench case, and then this file's cost table replaced with real numbers      | `benchConfig.ts`, `scripts/bench.ts`, `docs/crowd.md` |

Steps 2 and 3 hold all the logic and both are pure `domain/`, which is what keeps
the simulation testable without a browser — the convention the repo already
holds.

## Notes for step 4

The meshing pipeline is keyed to `OBJECT_TYPES` in more places than the obvious
one, and every one of them has to learn about the second registry. Checked
against the code as it stands:

- **`scratchForCatalogue()`** in `showcase.ts` builds one scratch region per
  model from `OBJECT_TYPES`. People need regions of their own, and the scratch
  extent is already checked against the world's horizontal extent — four figures
  of 3 x 7 x 2 will not trouble it, but the check is there.
- **`allMaterials()`** in `objectTypes.ts` derives one DVE voxel and one rendered
  material per distinct colour **across `OBJECT_TYPES` only**. The `skin` family
  is painted by nothing else, so without this it is never registered — and the
  scratch writes go through `voxelIdFor(materialKeyFor(color))`, which would then
  be asking for a voxel that does not exist. This is the one that bites.
- **`materialColorsById()`** is derived from `allMaterials()`, so it follows.
- **`emissiveByModelId()`** is keyed by model id and no person declares an
  emissive colour, so it needs nothing today — but it is the fourth place the
  registry is assumed to be the whole world.

`dveEngine.test.ts` exists to catch exactly this drift — it meshes the whole
catalogue and would fail on a material the DVE registry never heard of — so the
failure should be loud rather than a person coming out miscoloured. Extending
that test to the people is part of the step.

The shape of the fix is a decision rather than a detail: either these functions
take the union of both registries, or the union is named once (a
`PAINTED_MODELS`, say) and they all read that. The second is the one that stops
a third registry needing four edits.

## What this makes cheap later

Needs, names, ages and a bed to sleep in are more columns beside the ones above,
and none of them touches the movement. The one thing worth designing for now is
that a **destination** eventually replaces a random turn, which means the network
will want to know which paved tile fronts which building — derivable from
`layout.placements` by adjacency, and cheap as long as the node table stays
indexable. It is not built yet, and should not be until something needs it.

The step loop is the other seam. Six hundred people is arithmetic in a typed
array; sixty thousand is a compute shader. The structure-of-arrays layout is the
thing that makes the second one a port of the first.

## Milestones

- **Step 1 — the art. Landed.** One `skin` family in the palette, whose four
  tones are four complexions rather than four tones of one; a shared `figure`
  builder in `voxel-gen/people/`; three adults and a child; and
  `pnpm preview --people` to look at them. Nothing in `src/` changed, and the
  people are in a registry of their own, so `OBJECT_TYPES` is untouched.

  The figure was drawn twice. The first pass gave the head the full three-voxel
  width of the shoulders and hung a hand at either side of the waist, and it
  came out as a chest of drawers with legs: with nothing narrower than anything
  else there is no silhouette, and at seven voxels the silhouette is all there
  is. Narrowing the head to one voxel and dropping the hands is what made it a
  person — and it is the closer of the two to life size, since a head is about
  15 cm across and one voxel is 25.

- **Steps 2 and 3 — the network and the crowd. Landed.**
  `crowd/domain/walkNetwork.ts` and `crowd/domain/crowd.ts`, both pure, with
  unit tests on fixtures and a third file that runs the whole thing against a
  resort the generator actually produced. `createRandom` moved out of
  `resortGenerator.ts` into `layout/domain/random.ts`, and `PAVING_VOXELS` — the
  top of a path slab, which the crowd walks on and the stair model starts a
  tread above — moved out of `models/stairs.ts` into `voxelgen.ts`, beside
  `TILE_VOXELS` and `LEVEL_VOXELS`, for the reason those two are there.

  Three things came out of testing rather than out of the design:

  - **The turn-back rule was inert.** `cameFrom` was being set to the node just
    arrived at rather than the one left, so it never matched an exit and every
    junction was a uniform draw. People covered a quarter of the ground they
    should have.
  - **A straight line across a wandering coast crosses water.** See the note
    under _The walk network_. Only the generated plot found this; a fixture with
    a straight shore never could.
  - **The beach filled far too slowly.** Left to random walk it held one person
    after ten seconds and forty after twenty minutes, because the gates are 28
    nodes among 1 870. A quarter of the crowd now starts on the sand, and the
    leave rate is tuned against the hop length rather than against a feeling —
    shortening the hops for the fix above drained the beach until it was, since
    the same per-arrival chance was suddenly rolled eight times as often. It now
    holds ~150 of 600 across a simulated hour.

- **Steps 4–7.** Not started. Nothing is drawn yet: the crowd walks in tests and
  nowhere else.
