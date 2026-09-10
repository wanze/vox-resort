# Rendering, lighting and measurement

The detail behind the [README](../README.md): the scale everything is authored
at, how the pipeline fits together, what is optimised and what is not, what a
frame costs, how the lamps are baked, and how any of it is measured.

## Scale

One tile is `TILE_VOXELS` (16) voxels and stands for **4 m**, so a voxel is 25 cm
and a storey is 12 voxels. Every model is authored at that scale and fills the
footprint it declares, which is what keeps a palm, a bungalow and a hotel in
proportion once they stand on the same plot.

One **level** of elevation is `LEVEL_VOXELS` (8) voxels — **2 m**, two-thirds of
a storey. Both constants live in `voxel-gen/voxelgen.ts` rather than in `src/`,
because both are facts the art has to agree with: the stair model is authored to
climb exactly one level across exactly one tile, in eight treads of one voxel
rise by two of going. Steps of 25 by 50 cm are steep, and are the shallowest a
grid this coarse can express.

The plot is 112 × 100 tiles — **448 × 400 m**.

## What is on the plot

The authored plan is flat and has no coast — it is the plot a `?bench=1` run
measures, and a run only compares with the one before it if the scene has not
moved. A generated plot is the one with a beach and terraces on it.

|                                             |                                      |
| ------------------------------------------- | ------------------------------------ |
| Authored objects                            | 517, of 29 types                     |
| Lamps and hedges the layout scatters itself | 897                                  |
| Paved tiles                                 | 2 427 (22% of the plot)              |
| Instances drawn                             | 3 841                                |
| Draw calls                                  | 528, over 43 chunks                  |
| Triangles submitted per frame               | 2.18 M (1.25 M at eye level, culled) |
| Triangles uploaded to the GPU               | 84 k, merged down from 526 k         |
| Voxels the resort is made of                | 15.0 M                               |
| Voxels actually meshed                      | 773 k (one copy of each model)       |
| Lamps                                       | 422, all of them baked into a volume |

Note the two numbers that did _not_ move when the plot last doubled: 769 k
voxels meshed and 84 k triangles uploaded. The catalogue is meshed once whatever
the plan does with it, so growing the resort costs matrices, not geometry — the
east wing and the two southern bands added 279 objects, 1 894 instances and
7.9 M voxels for exactly zero extra meshing.

Measured in Chrome on the WebGPU backend, at 2880 × 1626 device pixels on an
M2 Pro: **120 fps (vsync) in daylight and after dark alike**. `pnpm bench`
reproduces it — see _Measuring_ below.

> The draw-call, triangle and frame-cost rows above were measured before the
> terraces landed and have not been re-run since. The terrain grew four static
> surfaces (about 20 k quads and four draw calls on a plot with a coast and a
> hill, and nothing at all on the flat authored plan the bench measures), which
> should not move them — but that is a claim, not a measurement, until
> `pnpm bench` says so.
>
> The counted rows moved a little when dressing stopped growing spurs: 103 fewer
> paved tiles on the authored plan, and the 23 lamps and hedges that used to line
> them. The triangle rows have not been re-run since either, and they can only
> have come down.

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
   folds the colour into a **vertex attribute**, and splits the colours a model
   declares emissive or water into sets of their own. All of it is plain typed
   arrays, which is what lets it run in the worker and be transferred back
   rather than copied.
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
plaza or two. Everything else is derived, in four stages:

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
   is a build error, not a silent gap. Two things grow none: **dressing**, the
   grounds shelf of the catalogue, because nobody walks to a palm; and anything
   standing on **sand**, because sand is walked on — see _The coast_.
3. **Dressing** — street lamps are taken from the ring of free tiles touching a
   path, at an even minimum spacing; hedges then fill the straight runs left
   over, skipping anything pressed against a building so the planting reads as a
   border rather than as undergrowth.
4. **Rails** — a handrail along every paved edge with a drop beyond it, and a
   balustrade up both flanks of every flight of stairs. See _Stairs and paths get
   handrails_.

Each paved tile is then given its paving from the ground under it rather than
from the route over it: flagstones on grass, a `boardwalk` on sand, and `stairs`
where the tile's paved neighbour stands a level higher. Every placement also
carries the height of the ground it stands on, so nothing downstream — the
instance matrix, the occluder box, a lamp's position, the shadow it throws, its
HUD label — has to know which terrace it is on. See _Elevation_.

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

The water only reaches a fifteenth of the plot's depth inside it, because those
tiles buy nothing: the sea carries on to the horizon whatever the plot says, so
all an inset costs is ground. The sand is the number that matters, and it is
capped as well as floored — a beach that grew with a 160-tile plot would be forty
tiles of sand, which is a desert. On the reference plot it is 14 rows deep, about
56 m of sand: three lines of loungers, a band of palms and clubs behind them, and
the two rows nothing stands on. The rows it used to have went to the hill.

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
- **Nothing on sand is paved to, and nothing is routed across it.** Sand is
  walked on: `layoutResort` grows no spur to anything standing on it and its
  breadth-first search will not step onto it either. That one rule is what a
  beach is. Before it, a spur per object paved a row of sand in front of every
  run of loungers, and the two walks that used to cross the beach existed mostly
  to keep those spurs one tile long; now the beach carries the two lanes that
  come down to the water and nothing else.
- **The generator keeps its districts off the sand entirely** and fills it on its
  own terms — three **lines** of loungers and parasols at fixed depths into the
  sand, and a band of beach clubs, bars, palms and torches against the dune
  behind them. A depth follows the water, so each line curves with the bay the
  way the dune behind it does, and the density slider breaks a line into runs
  rather than thinning it tile by tile: a line with every third lounger missing
  reads as a scatter that happens to be in a row. The band at the back is skirted
  per cluster, which is what keeps the clubs and the palms clear of each other
  and of the last line. Nobody sleeps on the sand: the lodgings are on the shelf
  on top of the dune behind it — see _Elevation_.

The southern gate moves with the coast, and now with the hill as well: it stands
at the hill's landward foot, facing back up the promenade, because that is where
the resort proper ends. It cannot go on the sand any more — the sand has a dune
rising straight off the back of it, and a gate three tiles wide would stand
across the first step. Every street stops there with it, except the two **sea
lanes** — the service lanes nearest three tenths and seven tenths of the width,
which carry on over the hill as flights of stairs, cross the sand as boardwalk
and are cut off at the shore. Eight lanes used to do that, which paved the beach
in stripes and made the dune a wall of staircases; two is enough to reach the sea
with, and the hill is climbed by walks of its own instead.

## Elevation

The land is not one plane. Behind the beach it rises into a **hill** and comes
back down again, and the resort's streets and districts are the level ground
behind it. A tile's **level** is an integer, 0 at sea level, and one level is
8 voxels up.

From the water inland, the reference plot reads:

| Level   | What it is                 | Made of | Depth   |
| ------- | -------------------------- | ------- | ------- |
| 0       | the beach                  | sand    | 14 rows |
| 1, 2    | the dune, a row per step   | sand    | 2 rows  |
| 3       | the shelf, on top of it    | sand    | 9 rows  |
| 4, 5, 6 | the climb to the crest     | grass   | 21 rows |
| 5 → 1   | the far side, five benches | grass   | 17 rows |
| 0       | the resort behind it       | grass   | 28 rows |

Three things follow from that shape, and each is a decision rather than a
consequence:

- **The dune is sand.** A terrace carries the material it is made of, so the
  beach goes on up behind itself: three steps of sand onto a flat shelf of it.
  `ground.ts` is the one place the question is answered — the coast knows where
  the sand is and the elevation knows how high the ground stands, and a dune is
  the tile both have an opinion about. A path on the shelf is decking for the
  same reason the pier out to the water is.
- **The shelf is where the lodgings are.** A row of bungalows along a sidewalk on
  top of the dune reads as the lodgings _of_ the beach; the same bungalows
  standing in the middle of the sand read as buildings somebody had left there.
  Houses go on the grass benches above and behind, at five different heights —
  two palms to every house, because a hill this size filled with houses came out
  as a housing estate on a slope rather than as a wooded headland with a few
  houses in it.
- **The hill is not a district.** Its benches are four to eleven rows deep and
  they curve, and a row grid is the wrong shape for that. So the hill and the
  beach are filled first, on their own terms, and whatever they leave bare is
  reserved against the districts wholesale.

`elevation.ts` describes the terraces the way `shoreline.ts` describes the coast,
and for the same reasons: **per tile column**, as a function rather than a stored
field. `stepStartZ(i, x)` is where terrace `i`'s step runs in column `x`, and a
tile's level falls out of that one number — so the layout and the terrain
renderer make the same staircase of a wandering step without having to agree on
anything but the seed.

Two invariants hold, and between them they are what make the rest tractable:

- **Neighbouring tiles differ by at most one level.** A taller drop is two
  terraces a tile apart, which comes out as two flights in a row rather than as a
  cliff no stair model could climb.
- **The beach is always level 0.** Terraces are anchored landward of the sand, so
  a coastline that wanders cannot drag a step across the sand — which is what
  lets the sand stay the flat sheet it is and a boardwalk run out to the water
  without a step in it.

Both are checked when a plan's spec is anchored, per column, against the rounded
lines the layout will actually read. Not against the spec's own numbers: two
steps four tiles apart with three tiles of wobble on each are a spec that looks
fine and crosses itself in one column out of thirty.

### What a step is measured from

A terrace is anchored to the **water** or to the **plot**, and the choice is
visible:

- **`water`** follows the coast. The sand is a fixed depth, so a step a fixed
  distance in from the water keeps a fixed distance behind the sand however the
  coastline wanders — which is what the whole hill wants, because it should read
  as parallel to the beach.
- **`plot`** measures from the plot's southern edge and ignores the coast. With
  no wobble the step falls on one row in every column, which is the only way a
  step can sit on a **street**.

The generator anchors **every** step of the hill to the water and gives none of
them a wobble of its own, and that single decision is what makes the hill work:

- The steps stay exactly as many rows apart as the bench between them is deep, in
  every column, so they can never cross. Two steps crossing is the one thing
  `elevationFor` refuses a plan for, and here it holds by construction rather
  than by a margin — two lines four tiles apart with three tiles of wobble each
  are a spec that looks fine and crosses itself in one column out of thirty.
- The hill still curves, because the coast does. A line a fixed distance in from
  a wandering shore wanders with it, so the dune, the shelf and every bench above
  them run parallel to the beach, and the flights that climb them land on a
  different row in every lane. A hill measured off the plot's own straight edge
  would be a stadium.
- The first step sits exactly on the back of the sand. The beach keeps its whole
  depth at level 0, and the flight up the dune stands on the last row of sand:
  you climb _off_ the beach rather than walking up decking laid against it.

The cost of anchoring everything to the water is that no step lands on a street,
and a straight cross street laid across a curved bench would spend its length
drifting on and off a step — a staircase a hundred tiles long rather than a
street. So the cross streets, and with them every district they bound, are held
**north of the hill**, and the hill gets a network of its own that follows the
coast rather than the grid:

- a **bench walk** down the middle of every bench wide enough to hold one — the
  sidewalk along the shelf the bungalows are laid out on, and one along each
  grass bench above it, over the crest and down the far side. Each is a chain of
  nodes a fixed distance in from the water, one every five columns, so it curves
  with the bay; and each is laid down the _middle_ of its bench, because a walk
  holds one row's z between nodes and the coast drifts a row or two under it —
  on a bench narrower than five rows that is a staircase running the width of the
  plot rather than a path.
- two **switchbacks**, which climb the whole hill in legs rather than head on,
  one either side of the promenade. That falls out of the routing for free: each
  edge is an L, so the leg along x runs along a bench and the leg along z is the
  bit that climbs. They start on the sidewalk along the shelf, which is what
  joins them to everything below, and end on the level ground behind the hill.

Between them the two make one network — every switchback crosses every bench
walk — and the sea lanes tie it back into the street grid.

`plot` anchoring is still what a step on a **street** needs — with no wobble it
falls on one row in every column — and it is what the elevation spec exists to
express, whether or not this generator reaches for it. A step laid _on_ a
two-wide cross street rather than just past it splits the street lengthwise,
leaving half of it up and half down with a stair wall the full width of the plot
between them: 110 flights in one row.

### Paths become stairs

A path that crosses a step is not a slab, it is the flight up it. This is the
third case of a rule the layout already had — paving is a fact about the ground
under a tile, so the same street is flagstones on grass, decking on sand and
stairs on a step.

`stairs.ts` classifies each paved tile: a flight goes on the **lower** tile of
the step, because there is no tile between two adjacent tiles and the lower one
is the only choice that starts at the paving it continues and ends flush with the
paving above. It is turned to face the higher ground, so **one model and a
quarter turn** cover all four directions — no second geometry, no second bucket,
exactly as a turned cottage costs nothing but a different matrix.

Two rules keep it honest. The higher neighbour has to be **paved** too, or the
flight would end in a lawn. And where a path _turns_ on a step — an L-bend with
higher paved ground on two perpendicular sides — one tile cannot climb both ways,
so the first by compass order wins. That is a deliberate fudge rather than a
refusal: the routing picks those corners without knowing where the steps are, and
a corner is not a reason to refuse a whole resort.

**Paving is never picked, only drawn.** The same rule holds for a path drawn by
hand, and it is what makes the paving tool a single tool: a staircase chosen by
hand can only be wrong — up the middle of a lawn, facing a wall, or buried on the
upper tile of a step — and decking chosen by hand is a jetty over grass. So both
models declare `groundDecides`, the palette offers neither, and `path` is the one
thing you draw with. `paving.ts` is the pointer's half of the rule `stairs.ts`
holds, so a hand-drawn path comes out exactly as a generated one does.

Sand is the easy half of that: what a tile is made of is a fact about that tile
alone, so decking is decided as the tile goes down and never revisited. A step is
a fact about _two_ tiles, and a stroke can cross one either way — so it takes two
halves. Drawing _downhill_, the tile going down is the lower one and comes out as
the flight. Drawing _uphill_, the slab laid a moment ago is lifted and laid again
as one, once there is paving above it to climb to. Between them a step comes out
the same whichever direction it was drawn in, and whether it was one stroke or two
sessions apart.

Only ever more stairs, never fewer: paving a tile can turn a slab into a flight,
and nothing that is already a flight stops being one — so a re-laid tile is
always a slab, and nothing has to work out what a flight would have been if it
were flat. Taking paving back up is the case that would need that, and it belongs
with the bulldozer that introduces it.

### Stairs and paths get handrails

The last of the rules that read the ground rather than the plan, and the same
shape as the two before it: `ground.ts` decides what a tile is paved _with_,
`stairs.ts` decides where that paving climbs, and `railings.ts` decides where it
needs holding on to. Two cases, and they are the two the eye expects:

- **A drop beside a path.** A paved tile whose neighbour stands lower and is not
  paved is a tile you could walk off the side of, so a rail is stood along that
  edge — the balustrade along the top of a terrace, and along the walks that
  follow the hill's benches. One rail per edge, so the corner of a bench comes
  out with two.
- **The flanks of a flight.** A staircase is guarded up both sides whether or not
  the ground beside it drops, which is what a staircase looks like everywhere it
  has ever been built.

**Paving is always the way through**: a neighbour that is paved never gets a rail
between it and here. That is what keeps a flight open at the top and the bottom,
and what lets a walk turn a corner without being fenced off from itself. A
staircase wider than one tile is left open altogether — one model carries both
flanks, because they are mirrors of each other and no quarter turn maps one onto
the other, so a rail on a flight with paving up one side of it would fall down
the middle of the treads.

Two models, both `groundDecides`, so neither is ever picked: `railing`, a run of
posts and a rail along one edge, and `stair-railing`, a stepped parapet up both
flanks of a flight, whose treads are derived from the same two constants
`stairs.ts` is built from so the two cannot drift apart.

A rail is the one thing on the plot that **claims no ground**. It stands on the
paving it guards, at that tile's own height, and the tile is already spoken for
by the slab under it — so the layout keeps rails in a list of their own. The
scene draws them with everything else; the occupancy index, the blob shadows and
the sky-visibility bake all leave them out, because the answer for their tile is
the paving. It is also the one thing not centred in its footprint: `placeOnEdge`
stands it flush against the edge its turn points at, while everything else on the
plot is centred in the tiles it claims.

**A path drawn by hand is railed too**, and that is a diff rather than a list —
`handrails.ts` is the pointer's half of the rule the way `paving.ts` is the
pointer's half of the stairs. Paving one tile does not only rail that tile, it
re-rails the ground around it, and some of what stood there has to come back
down: pave below a railed walk and that edge is a way down rather than a fall;
pave the upper half of a step and the slab below it becomes a flight, trading its
edge rails for a balustrade; pave alongside an existing flight and the two are one
wide staircase, which is left open. Every one of those is the same rule read from
the other side — paving is always the way through.

So the tile and its **four neighbours** are each re-asked from scratch what rails
they want, and the answer is diffed by key against what is standing on them. Four
neighbours and no further: what rails a tile is what it stands next to, and a tile
two steps away has no neighbour whose paving changed. Recomputing rather than
adjusting means nothing has to know which of the cases above it is looking at, or
which gesture is running — and because a rail's key holds everything a rail is
(its model, its tile and the edge it guards), a rail that already stands where one
belongs is left alone rather than lifted and stood again. The build ghost previews
the paving only: a rail as often lands on the tile beside the pointer as on the one
under it.

### An object stands on one level

A voxel model is a box with a flat underside. Across a step, half of it hangs in
the air and the other half is buried, and there is no height that would be right
— the anchor tile's is wrong for the rest of it. So an object may only stand
where every tile of its footprint is on one terrace, and that is enforced in
three places from one implementation (`straddledTile`):

- **Authored plans throw.** Alongside the check that nothing stands in the sea: a
  plan that does it is a mistake in the plan.
- **Build mode blocks**, in `buildPlan.ts` rather than in the occupancy index —
  straddling is a fact about a footprint, so it cannot be seeded as a reserved
  tile the way water is. The cursor goes red and the ghost still shows where the
  object would have gone.
- **The generator avoids it.** `fits` requires level ground under a whole
  footprint, so districts lay their rows on one bench.

Cutting a building to the ground under it is a different feature, and a much
bigger one. Until then the ground has to be level.

### Drawing the terraces

Land above sea level is the same problem the coast is, a third time, and it gets
the same answer: **one span per tile column** at whichever bench that column is
on. Sea level is left to the infinite grass plane, so only benches above it are
emitted — a quad laid over that plane would be two surfaces fighting for the same
fragments.

What it adds is the **risers**, the vertical faces between one bench and the
next, and they are the only geometry in the terrain that does not lie flat — so
they are the only geometry that carries its own normals. A riser lit as though it
were a floor is a riser the sun cannot pick out, and a step you cannot see is not
a step.

A bench is drawn in **whatever it is made of**, because a terrace _is_ the plot,
just two metres up: a grass bench is the plot's own green and a dune is the
beach's own sand. Each goes into the mesh for its own material, and a riser takes
the material of the bench _above_ it — a cut through turf is bare earth, and a
cut through a dune is sand a shade down. Drawing the dune green put a lawn where
the beach should have carried on, which is the whole reason the two are separate
surfaces.

The awkward part is closing the risers along **x** as well as **z**. A step line
wanders, so two neighbouring columns round it to different tiles, and between
those rows one column stands a level above the other — a vertical slot at the
boundary they share, the staircase the tile grid makes of the step seen end-on.
Each pair of neighbouring columns is walked and exactly the z ranges where their
heights disagree are closed, adjacent spans merged so a long slot is one quad.

On the reference generated plot that is about nine bench quads and eleven risers
per column — the hill has nine benches above sea level and a step between each —
on top of one sea quad and one sand quad each. Six static meshes now rather than
four, since the benches and the risers are each split by material; call it 20 k
quads over the whole framed box, built once per resort and drawn in six calls.

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

**The pools are the same water.** A model may declare which of the colours it
paints are water (`voxel-gen/voxelgen.ts`), and those faces are meshed into a
geometry of their own and drawn with the sea's shader rather than the shaded
material — a wave field bending the normal so the scene's own sun glints off
it, and a Schlick term reflecting the same sky uniform the sea reflects. What
the two share is in `waterSurface.ts`; what only the sea has — a depth gradient
off the shore distances, and foam — stays in `seaMaterial.ts`, and the pools'
shorter, crossing ripples are in `poolWaterMaterial.ts`. It costs one more
material for the scene and one more `InstancedMesh` per chunk that holds a
pool.

## Rendering: what is optimised, and what is not

**Face culling, twice.** DVE's mesher drops the faces between two solid voxels,
so a solid building costs only its surface. Three.js then culls back faces on the
GPU — which only works because the winding is corrected for Three.js's
front-facing convention first (see the notes below).

**Colour in the vertices.** Milestone 1 gave each of the 217 colours its own
material and its own mesh. That is 217 draw calls, and each mesh spanned the
whole world, so frustum culling never had anything to cull. Colour now rides in a
vertex attribute and the whole resort shares three materials — one shaded, one
unlit, one water — which is what makes instancing possible at all.

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

**Picking.** `groundPick.ts` unprojects the pointer through the camera's inverse
view-projection and meets a level of ground at a single solved point. No
raycaster, no scene traversal, nothing allocated per pointer move — and unlike a
raycast against the ground mesh, the answer does not depend on how large that
mesh happens to be drawn. Tiles run negative off the plot's corner, so the resort
can grow west and north of the plan it started with.

With terraces there is no single plane to intersect, so it becomes a short search
rather than one solve: the ray crosses one plane per level, and only one of those
crossings is on ground that is actually there. The levels are tried from the **top
down**, keeping the first crossing that lands on a tile standing at that very
level — which is the whole of the hidden-surface problem here, in four lines of
arithmetic instead of a raycast against a few thousand quads. A ray that grazes a
riser matches nothing and is reported as no pick, rather than as the sea-level
tile behind it: the tile under the cursor decides where the object gets built, so
a wrong tile builds in the wrong place.

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

Twelve of the forty-three models cast light: the street lamp and the tiki torch,
the fountain and the swimming pool, the entrance gate, both bars, the hotel's
entrance lanterns, the mini-golf bollards, the tennis court's four floodlight
masts, the game hall's one room lamp and the restaurant's two. Between them they
put 457 lamps on the bench's plot — the figure `pnpm bench` prints in its `on`
column — so the resort is lit by what stands on it rather than by lamp posts
alone.

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
authoring API and the conventions. What an object is supposed to look like — the
reference renders, the shared palette, the parts a building is composed of, and
the colour ceiling the mesher imposes — is [art-direction.md](art-direction.md). Nothing in `src/` needs to change: the
catalogue, materials, layout, meshing, instancing, HUD labels and the shelf of the
build palette it appears on all derive from the registry — the last of those from
the `category` the model declares.

The resort is laid out on a fixed grid of `TILE_VOXELS` (16) voxel tiles. Every
model declares the footprint it claims in tiles and must fit inside it;
`pnpm preview --audit` reports how much of that footprint each model actually
fills, which is the number to watch when objects are meant to look right next to
each other. All but two of the 36 models fill 100% of theirs: a parasol's canopy
is round, and a handrail is an edge rather than a tile — 16 by 2 of a 16 by 16
footprint, stood flush against the edge it guards rather than centred in it.

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

The terrain has terraces but not slopes: the land steps a level at a time and is
flat between, and nothing is cut to the ground under it. So an object stands only
where the ground is level, a step is always exactly one level, and there is no
digging — the levels are a function of the plot, not something a player edits.
Terrace risers do not shade what stands at the foot of them either; they are not
in the sky-visibility bake, and a blob shadow that runs off the edge of a bench
hangs above the ground below rather than falling onto it.

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
