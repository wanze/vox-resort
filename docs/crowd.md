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

**Except on a flight, which holds two** — one at the foot of the climb and one at
its head, on the tile's own two edges. This is the one place the tile centre is
the wrong place to stand, and it was found by looking at the resort rather than
by thinking about it: a flight's ramp runs from the paving it continues to the
paving above across the width of its own tile, so a node in the middle of it,
carrying the height of the ground _under_ the flight, sits half a level below the
treads — and the crowd waded up every staircase buried to the shoulders. With a
node at each end the polyline is the true surface: flat to the foot, the climb
across the tile, flat on from the head. Where two flights meet they share the
landing between them, so the graph never holds two nodes at one point.

A flight is entered at its foot and left at its head. A path that runs into the
_side_ of one reaches its foot as well, and that is necessity rather than
neatness: `stairs.ts` makes a flight of any paved tile with paved ground a level
above it, corridor tiles included, so a path sometimes crosses a flight at right
angles to the climb. Refusing that pair stranded 46 nodes of the reference plot
behind it. Going round the foot is what a person would do with the same obstacle,
and it happens at the height they were already walking at.

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

## Sitting down, and lying down

The first thing a person on this plot does that is not walking, and it is built
so that it still is.

A seat is declared by the **art**, beside the lights: `bench.ts` names three
columns of its own plank, the layer a person's hips rest on and which way their
legs point, and `coffee-shop.ts` names the six chairs on its terrace. Nothing
in `src/` holds a list of what can be sat on, so a model that grows a second
bench grows two more seats in the same edit — the rule the catalogue has held
since the beginning, applied to a second kind of fact about a model.

Which is what made the pass over the rest of the catalogue cheap. Eleven models
already drew furniture nobody could use — stools at three bars, chairs on the
taverna's terrace, sofas and daybeds on the beach club's deck, benches in the
playground, beds in the spa, and 21 loungers across the pool terrace, the water
park and the sun lounger itself. Declaring their seats is a field on each model
and no change anywhere else: 992 seats on the authored plot, 803 on a generated
one. `voxel-gen/seats.test.ts` is what keeps them honest — every seat has to
have something solid under it and room for a body over it, because a seat is
two numbers written in one file about voxels painted in another.

`crowd/domain/seating.ts` turns those into points in the world, which is the
same journey `rotateLights` makes a lamp take, with one thing added: the turn
the object stands at is **added to** the seat's own facing. Miss that and every
turned bench seats people looking into its back rail.

`walkNetwork.ts` then hangs each seat off the one node a person can reach it
from — the nearest paved node on the seat's tile or one of its four neighbours,
within half a level — and **drops the ones with no paving within reach**. That
is the design, not a failure: a chair in the middle of a lawn is a chair nobody
crosses the grass to. On the reference plot 287 of 297 declared seats are
reachable; on a generated one, 223 of 252, the difference being coffee-shop
terraces the streets happen not to run past.

A seat is **not a node** and no edge is laid to it, so the walk is exactly the
walk it was: the onward pick at a junction counts exits, and a seat is not one.

And the sit itself is **a segment like any other**: `from` and `to` are the same
point, `rate` is `1 / seconds`, so `t` measures how much of the rest is left and
the per-frame loop learns nothing. When `t` passes 1 the ordinary arrival branch
stands the person up. A `sitting` flag tested per person per frame would have put
a branch in the one loop that exists to have none, for the hundred-odd people who
are resting at any moment.

Two columns pay for all of it: the seat a person holds, and who holds each seat.
The claim is taken when they **set off**, not when they arrive, or two people
walk to the same plank.

### The loungers are reached off the sand

Not one tile of a beach is paved — that is the design, see _The walk network_ —
so a lounger on the sand hangs off no node, and the rule above would drop every
one of them. The rows of loungers the beach is laid with would be furniture
nobody could ever use.

So a seat standing on beach terrain goes into a list of its own,
`network.beachSeats`, and the roamers pick from it: on reaching the spot they
walked to, a person takes a free lounger within three columns of them instead of
picking another spot, and gets up onto the sand again rather than onto a path.
Three columns is the same bound a roamer's next spot is drawn within, and for
the same reason it is a correctness rule there — they walk in a **straight
line**, and a target across a wandering coast has water in the way.

The scan is a loop over the loungers on the plot, which is fine and is worth
saying why: it runs when somebody arrives somewhere on the sand, every few
seconds per roamer, not per person per frame. 183 beach seats on a generated
plot, with a window three columns wide.

### Lying down is the same seat with a different pose

`pose: 'lie'` on the seat, declared by the art, because it is a fact about the
furniture: a bench is sat on and a sun lounger is lain on, and no model has
both. Everything up to the shader is unchanged — a lounger is claimed, walked
to, held and given up exactly as a bench is. Two things differ, and both are one
line: the rest is longer (a minute to five, against twenty seconds to ninety —
somebody stretched out in the sun is _supposed_ to be still, where somebody
motionless on a bench looks like a bug), and the pose the renderer is handed.

The hips are the anchor for both, which is what makes one seat serve two poses.
A lying figure runs from four voxels behind them to three in front, so a
mattress is drawn round the same point a cushion would be, and the head lands on
the raised end of a lounger without the art having to say so.

### Both poses are a shader, not a second model

A figure at rest is the same geometry as a walking one, folded by the same
`positionNode` the walk rides on.

**Sitting**: the body drops by the height of its own hips, and the vertices
below the hip — the ones the walk already knows about, because they are the ones
it swings — swing forward and down about it, half the leg's length down and nine
tenths of it forward, which is a leg that keeps its own length.

**Lying**: the same figure turned on its back about the same hips. It is three
substitutions and no trigonometry: the body's long axis becomes the direction
the legs point, its thickness becomes its height, and the two contributions the
instance matrix already made along those axes are taken back out. An adult comes
out 7 voxels long, 3 wide and 2 high, resting on the layer the seat named —
which is the check that stood in for a browser while this was written.

That costs three floats a vertex, baked once: how far up the body from the hip a
vertex is, how far through its thickness, and where this model's hip is. Baked
rather than computed because past the instance matrix the figure's own axes are
gone, and because a uniform would be a uniform per model on a material every
model shares — which is also what keeps the adult and the child on one material.

One instanced float per person says which of the three states they are in, and
the shader takes it apart with two multiplies, so a vertex pays for all three
and is displaced by one.

A second and third geometry are what that avoids, and the cost is not the
geometry: a person sitting down would have to move from one mesh's instance
slots to another's, every time anybody sat, lay down or got up, on a field whose
slots are handed out once and never change.

### The figure is drawn by more than the crowd

The geometry above, the three baked per-vertex attributes and the one material
that folds all three poses are not the crowd's. They are a **figure field**,
`rendering/adapters/figureField.ts`, and two features build one: the crowd on
the paving, and the bay, which sits a couple of dozen people in its boats. See
_People in the boats_ under the milestones.

It sits beside the other two shapes of field the renderer has, and the three are
worth naming together. A **chunked field** buckets static instances so a whole
bucket can be rejected (`rendering/domain/spatialChunks.ts`). A **moving field**
hangs a model on its own middle and rewrites a matrix per instance per frame
(`rendering/adapters/movingField.ts`); the balloons and the boats are two. A
**figure field** is a moving field hung on its instances' feet instead, carrying
the attributes the three poses are folded from.

One consequence is worth knowing before drawing anything somebody sits on: a
seated figure's legs reach nearly three voxels _forward_ of its hips, and half a
voxel down below the surface its feet would clear from a bench. So a seat is not
just a clear column, it is a clear column with three voxels of room in front of
it at knee height. It is what decided which way round a rowing boat's passenger
faces.

How much of the crowd rests is `ONTO_SEAT`, `SIT_SECONDS` and `LIE_SECONDS`
together, and they were tuned by measurement rather than by feel — see the notes
on them in `crowd.ts`. A quarter chance with sits of up to three minutes put 155
of 600 people on seats, which with the quarter already out on the sand left the
promenade looking closed. Across the whole catalogue's furniture it now settles
at about a hundred: 52 sitting and 49 lying on the authored plot, 51 and 69 on a
generated one, where the extra loungers are the beach's.

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
Int32Array    seat                          // the seat they hold, or -1
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

- **Steps 4, 5 and 6 — the crowd on screen. Landed.** Treated as one thing,
  because none of the three shows anything on its own. The people are meshed
  through the same pipeline the catalogue is, drawn as one `InstancedMesh` per
  person model in `crowd/adapters/crowdField.ts`, and built, stepped and thrown
  away with the resort they walk.

  Three things came out of building it rather than out of the design:

  - **The union of the registries is named once.** `PAINTED_MODELS` in
    `objectTypes.ts` is the catalogue plus the crowd, and the three places that
    had assumed `OBJECT_TYPES` was the whole world — the material set, the
    emissive lookup and the scratch layout — read it instead. `dveEngine.test.ts`
    meshes it, so the `skin` family being registered is now something a test
    fails about rather than something a person comes out miscoloured about.
  - **A material's `positionNode` is applied _after_ instancing, and assigns.**
    Written against the raw geometry attribute — which is what the plan above
    implies — the walk cycle would have discarded the instance transform and
    stood six hundred people on the origin. It builds on `positionLocal`, which
    is the instanced position; and because past that point the figure's local +z
    is gone, the direction a person is walking is handed over as an instanced
    `facing` vector beside the matrix. It costs the `(sin, cos)` the matrix write
    had already worked out.
  - **The leg weight is baked per vertex, not computed per model.** How far a
    vertex swings — signed by which leg it is on, tapering to nothing at the hip
    — is a static attribute written when the figure's geometry is cloned. That is
    what lets one material draw an adult and a child, whose hips are at different
    heights, and it leaves the shader one `sin` and two multiplies. `hipHeight`
    moved into `people/figure.ts` beside the layer arithmetic it comes from,
    since the walk and the art have to agree about where the legs start.

  The people are drawn with the ordinary lit material, so they walk through the
  lamps' pools of light for nothing; and they are in none of `tileOccupancy`,
  `diffPlacements`, the label anchors, the blob shadows or either bake.

- **The staircase fix.** Looking at the crowd found what no test had: people
  walking up a flight sank into it until only their hair showed. The cause was a
  node at the centre of a tile whose surface climbs across that tile — see _The
  walk network_ above, which now describes the two-node flight and the sideways
  crossing that came with it.

- **Somewhere to sit. Landed.** Two models drawn for the crowd rather than for
  the camera — a bench and a coffee shop — and the four steps between a plank
  and a person on it: `ModelSeat` in the art, `crowd/domain/seating.ts` to place
  it, a seat hung off a node in `walkNetwork.ts`, and a sit stored as a
  zero-length segment in `crowd.ts`. See _Sitting down_ above.

  The bench is **scattered by the layout** rather than planned, which is the
  decision worth recording. Benches belong to paths, not to districts, and
  `resortLayout.ts` is the one thing that knows where the paths ended up — so it
  stands one every nine tiles along the path edges, turned to face the paving,
  exactly as it already scattered the lamps and the hedges. The authored plot
  gets 95 and a generated one 76, neither of which is written down anywhere, and
  every one of them is reachable by construction. It also made the layout turn a
  prop for the first time: a lamp and a hedge look the same from four sides and
  a seat does not.

  Three things came out of building it rather than out of the design:

  - **A seat names the sitter's hips, not their feet.** A seated person's feet
    are off the ground, so the thing the art can actually fix is where the body
    folds. It also makes the pose a shader: the figure drops by its own hip
    height and the legs swing out from there.
  - **The turn has two halves.** Position _and_ facing. The first pass turned
    only the position, and three quarters of the benches on the plot seated
    people facing their own back rail.
  - **The bench lost its planting twice.** A flower box behind the seat is
    hidden completely by the back rail from a camera looking down at 30 degrees,
    and a pot at each front corner stands taller than the bench. The model is a
    seat on a slab, and that is all.

- **The catalogue's own furniture, and the loungers. Landed.** The seats pass:
  eleven models that already drew stools, chairs, sofas, daybeds, benches and
  loungers now declare them, which is a field on each model and nothing else —
  992 seats on the authored plot, 803 on a generated one, of which 452 and 462
  are reachable. `voxel-gen/seats.test.ts` checks the art rather than the logic:
  something solid under every seat, room for a body over it, nobody sitting
  shoulder to shoulder.

  With it, the two things a lounger needed. A `lie` pose, declared by the art
  and drawn by the same shader node the walk and the sit ride on — see _Both
  poses are a shader_ above. And a way to reach a seat that stands on **sand**,
  since no tile of a beach is paved and the rule as written dropped every
  lounger on it: beach seats are a list of their own and the roamers pick from
  it, which is the second time the beach has needed a rule of its own and the
  second time it has been worth it.

  Three things came out of building it rather than out of the design:

  - **The hips are the anchor, and that is what makes one seat serve two poses.**
    A lying figure is drawn about the same point a sitting one is, so a lounger's
    mattress and a bench's plank are declared the same way.
  - **A lying figure lies on the soft furnishings, and should.** The first pass
    of `seats.test.ts` demanded the seat's own cell be empty, and the beach
    club's daybeds failed it: a towel is drawn in exactly the course a body
    occupies. The rule now applies to sitters, where a rail through the chest is
    a fault, and not to liers, where an overlap is the model working as drawn.
  - **Declaring a seat found a model's numbers had drifted out of reach.** The
    ground layer is a local in `build`, and a seat is declared at module scope,
    so five models now name theirs as a constant and `build` throws if the
    plinth hands back anything else. That is the idiom the restaurant already
    used for its arcade and its eaves.

- **People in the boats. Landed.** Somebody is visibly sitting in the bay's
  craft, and the hire pedalos go out carrying a guest and come home empty. It is
  the first thing outside `crowd/` to draw a person, so the figure and its poses
  moved into a field of their own: see _The figure is drawn by more than the
  crowd_ above.

  The design question was whether passengers are rows of `Crowd` or a field of
  their own, and they are their own: `sea/domain/passengers.ts` carries the
  reasoning. In short, a passenger's position is not a segment between two points
  but a function of a hull's pose this frame; a passenger holds no node, no gate
  and no seat of the walk network; and somebody has to be _undrawn_ when a hire
  boat ties up, which a couple of dozen rows can do by compacting their slots and
  six hundred should not.

  Three things came out of building it rather than out of the design:

  - **A boat's seat cannot be baked, and that is why the boats declared none.**
    `crowd/domain/seating.ts` turns a `ModelSeat` into a world position once, off
    a static placement. A hull moves, heels and pitches every frame, so what is
    worked out once is the seat's offset in the craft's own frame and the pose is
    applied to it per frame. The art's own declaration needed no change at all:
    a seat in model coordinates was already the right thing to write down.
  - **Neither obvious way to undraw somebody works here.** A zero-scaled instance
    leaves the seated fold behind as a cross of stray voxels, because
    `positionNode` displaces a vertex after the instance matrix and is not scaled
    by it. And `resting` says which of three poses somebody is in, not whether
    they exist. So the aboard rows are written into the front of the buffer and
    `InstancedMesh.count` is cut to however many that was.
  - **Three voxels of leg decided the art.** A rowing boat's stern passenger
    faces _astern_, because the oars are shipped across the gunwales between the
    two thwarts and a forward-facing passenger's shins go straight through one.
    There is exactly one station between the thwarts that neither figure reaches,
    and a pair of oars needs two. For the same reason a pedalo seats one rather
    than the two it is drawn with: its footwell is five voxels across and a
    figure is three, so two abreast would each put a leg inside a float.

- **Step 7.** Not started. The crowd is on the plot; `?people=n`, a count in the
  HUD, a bench case and the real numbers for the table above are still to come.
  Every row of _What it should cost_ except the step loop is still arithmetic.
