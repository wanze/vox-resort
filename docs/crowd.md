# People on the plot

Reference for what moves on the plot: the crowd on the paving and the beach, the
boats in the bay, and the people sitting in them. See the milestones at the end
for what has landed.

## What is there

|          |                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| People   | 0.25 per paved tile, at most 10 000 (`crowdSize.ts`); `?people=n` sets it. 600 on the authored plot. Four models: three adults, a child |
| Poses    | walking, sitting, lying                                                                                                                 |
| Boats    | 12 craft (`CRAFT_COUNT`), plus buoys and the pedalo rental's boats                                                                      |
| Balloons | 36 (`BALLOON_COUNT`)                                                                                                                    |

The crowd is built with the resort and thrown away with it, but it does follow
hand edits: a quarter of a second after the last one (`REANCHOR_DELAY_MS`) the
walk network is rebuilt from what now stands, and everybody is put back on it
(`reseatCrowd`). People keep where they are, which way they face and who they
are, and give up their seat; a roamer stays on the sand, everybody else walks to
the nearest node. The crowd's size does not change with an edit. The balloons
and the bay still do not follow edits, and have nothing to lose by not doing.

## Code

| What                                   | Where                                        |
| -------------------------------------- | -------------------------------------------- |
| Walk network                           | `crowd/domain/walkNetwork.ts`                |
| Crowd state and step                   | `crowd/domain/crowd.ts`                      |
| Avoidance between people               | `crowd/domain/avoidance.ts`                  |
| Obstacles on the sand                  | `crowd/domain/sandGrid.ts`                   |
| Seats in world space                   | `crowd/domain/seating.ts`                    |
| Putting people back on a rebuilt graph | `crowd/domain/nearestNode.ts`, `reseatCrowd` |
| A venue's doors                        | `sim/domain/doors.ts`                        |
| One sweep of the graph                 | `sim/domain/flowField.ts`                    |
| Where everybody is heading             | `sim/domain/goals.ts`                        |
| Choosing, routing and arriving         | `sim/domain/router.ts`                       |
| Guest registry                         | `guests/domain/guests.ts`                    |
| Parties and who is a child             | `guests/domain/parties.ts`                   |
| Beds                                   | `guests/domain/homes.ts`                     |
| Names                                  | `guests/domain/names.ts`                     |
| Which person a click is on             | `inspect/domain/pickPerson.ts`               |
| What is selected, worded for the HUD   | `inspect/domain/selection.ts`                |
| The inspector's click                  | `inspect/adapters/inspectPointer.ts`         |
| The inspector panel                    | `hud/components/InspectPanel.tsx`            |
| Drawing the crowd                      | `crowd/adapters/crowdField.ts`               |
| Figure geometry and poses              | `rendering/adapters/figureField.ts`          |
| Boats and piers                        | `sea/domain/piers.ts`, `stepFlotilla`        |
| Passengers                             | `sea/domain/passengers.ts`                   |

## The walk network

Built per resort from the layout, and rebuilt whole from the plot as it stands
after a hand edit.

- **Nodes** — one per paved tile, at its centre and height. A flight of stairs
  has two: at the foot and at the head. Adjoining flights share a landing.
- **Edges** — between 4-neighbour paved tiles whose levels differ by at most one;
  a difference of one only where the lower tile is stairs. A path meeting a
  flight side-on joins its foot. A bridge ramp gets two nodes like a flight; a
  deck node stands `BRIDGE_VOXELS` up.
- **Seats** — declared by the art (`ModelSeat`), turned into world positions by
  `seating.ts` (the object's turn is added to the seat's facing), and hung off
  the nearest paved node on the seat's tile or a neighbour within half a level.
  Seats with no paving in reach are dropped. Seats are not nodes.
- **Beach seats** — seats on sand go into `network.beachSeats` and are reached by
  roamers instead.
- **The beach is a region.** A roamer picks a point on the sand within a few
  columns, a tile short of the water, walks straight to it, and leaves by a gate
  node with a small chance per arrival. On arrival they may take a free lounger
  within three columns.

The per-frame step never queries the terrain, the occupancy index or the layout.

## Movement

- A person is on a segment `from → to` at parameter `t`. A frame advances `t` and
  lerps; height comes from the endpoints.
- A sit or lie is a zero-length segment with `rate = 1 / seconds`. Seats are
  claimed on setting off. Tuning: `ONTO_SEAT`, `SIT_SECONDS`, `LIE_SECONDS` in
  `crowd.ts`.
- `cameFrom` stops people turning straight back at a junction.
- **On the sand**, `sandGrid.ts` rasterises everything standing there into a
  bitmap once per resort. A roamer tries up to eight candidate spots and takes the
  first that is free with a clear line (`clearLine`); with none, they wait 1.5 s.
- **Between people**, a spatial hash of at least 4 096 slots, two per person
  (`proximityFor`), is rebuilt each frame
  and scanned 3 × 3 around each walker. `side` offsets a walker to the right of
  their line (at most four voxels); `pace` slows them (never below 15%). At a
  crossing the higher index waits.
- **Boats** look ahead six seconds plus their radius and turn away from piers and
  other craft, are pushed out of any overlap, and are clamped to the bay last.
  Rental boats ignore each other near their berths. All pairs are checked.

## Storage

Structure of arrays, fixed capacity, no allocation per frame:

```
Float32Array  x, y, z, heading, phase        // position and facing
Float32Array  fromX/Y/Z, toX/Y/Z, t, rate    // current segment
Float32Array  speed
Int32Array    node, cameFrom, gate, variant
Int32Array    seat                           // held seat, or -1
Float32Array  dirX, dirZ, side, pace         // avoidance
Uint8Array    lane                           // resting, to a seat, paving, sand
Int32Array    cellHead (4 096), cellNext     // spatial hash
```

`node` is `-1` while on the sand. New attributes are new columns.

## Who the people are

`createGuests` builds a registry parallel to the crowd, keyed by person index:
guest `i` is the walker at `crowd.x[i]`. It is not columns on `Crowd`, because
nothing in it is read per frame, `reseatCrowd` would have to tell graph indices
from biography, and a name is a string. Party, home, arrival day, stay length,
age band and variant are typed columns; names are records.

People arrive in parties, drawn from `PARTY_MIX` and trimmed to fit the count
(adults first, so a party of one is never a lone child):

| Kind    | Share | Adults | Children |
| ------- | ----- | ------ | -------- |
| family  | 0.40  | 2      | 1–3      |
| couple  | 0.30  | 2      | 0        |
| friends | 0.18  | 3–4    | 0        |
| solo    | 0.12  | 1      | 0        |

A child is drawn with the `child` model; `crowd.variant` is set from the
registry through `CrowdOptions.variantOf`, with the crowd's own draw still made
so the seeded sequence does not shift. Beds come off the art through `bedsOf`,
from `layout.placements`; parties are housed biggest first into the biggest
lodging. A party with no room gets `NO_HOME`, which is the bed-shortage signal;
the HUD's Details panel shows beds taken of total. An edit reseats the crowd
and leaves the registry alone. Nothing about a guest changes what they do yet.

## Inspecting

A click on the canvas with no build tool armed selects what is under it. The
inspector does not take the left mouse button from the camera: a press and
release within 4 px and 400 ms is a click, anything else was a drag and is
ignored (`inspectPointer.ts`).

A person is tried first. `pickPerson` projects everybody forward through the
view-projection, aimed at hip height, and the nearest in screen pixels within
`PICK_PIXELS` wins, ties to the lower index. It does not pick on the ground:
from the plot's high angle a click on somebody's head lands the ground ray past
their feet, on whoever stands behind them. With nobody hit, `pickTile` and the
occupancy index name the placement on the tile; empty ground clears the panel,
as do Escape, a regenerate and demolishing the selected object.

`selection.ts` turns the pick into a flat, worded view that `App` holds as
React state, set once per click and re-worded once a simulated day. What a guest
is doing is the one per-frame line, written to a DOM node by `hudOverlay.ts`.
A lodging lists who sleeps there, and a guest's panel shows their five need
levels as bars and where they would go next. The live line names the
destination once they are walking to one - `Hungry · Walking to the Bakery ·
tile 12, 7`. Who is inside a venue is not tracked yet, and the panel says so
rather than showing a zero.

## Drawing

- One `InstancedMesh` per person model, not chunked, never frustum culled.
- Anybody under `HIDDEN_PIXELS` tall on screen is left out of the draw, not the
  walk: the visible are packed into the front of the buffers, walk phase included,
  and `count` is cut. See _Level of detail_ in [rendering.md](rendering.md).
- The CPU writes a translation and yaw per person. The walk cycle, the sit and
  the lie are folded in the shader's `positionNode`, built on `positionLocal`,
  from one baked per-vertex `figure` vec4 (leg weight, height above the hip,
  thickness, hip) and one instanced `pose` vec4 (facing sin and cos, resting
  state, walk phase). Packed because WebGPU allows eight vertex buffers: past
  1 024 people in one model, Three.js moves the instance matrix into a vertex
  buffer too, and one attribute per number came to nine — a big resort then drew
  no guests at all. `crowdField.test.ts` counts the buffers.
- People use the ordinary lit material, so they pick up the baked lamp light.
- People get no blob shadow, are not placements, claim no tiles, and are not in
  `diffPlacements` or either bake.
- A seated figure's legs reach about three voxels forward of the hips; a seat
  needs that clearance.
- Passengers are a separate figure field: their seat offsets are in the craft's
  frame and posed per frame. Aboard rows are packed to the front and
  `InstancedMesh.count` is cut; zero-scaling does not hide a folded figure.

## Determinism

The benchmark only compares runs if the scene is identical. So spawning and every
choice use a seeded PRNG (`createRandom`), bench mode uses a fixed timestep, and
outside bench mode the frame delta is clamped (`MAX_STEP`).

## The clock

`sim/domain/simClock.ts`. The whole state is `ticks`, whole simulated minutes
since the resort opened, plus the speed and a sub-tick carry. Day, hour and time
of day are derived from it; `skyStateFor` still takes only the time of day.

- One tick is 60 simulated seconds; a day is 1 440 ticks.
- The fraction of a tick a frame is worth is carried, so no time is lost.
- One advance runs at most 12 ticks, for `MAX_STEP`'s reason. The overflow is
  dropped, so under load the clock runs behind real time.
- Under a benchmark it is stepped by `MAX_STEP`, like the crowd.
- The resort opens paused. Speeds are real seconds per simulated day:

| Speed  | Real seconds per day |
| ------ | -------------------- |
| Slow   | 900                  |
| Normal | 300                  |
| Fast   | 120                  |
| Rush   | 30                   |

Needs are what runs on ticks; see below. The crowd, balloons and sea are
animation and stay on the frame delta.

## What guests want

`sim/domain/needs.ts` holds five levels per guest - hunger, thirst, energy, fun,
hygiene - in columns parallel to `Guests` and keyed by the same person index. 1
is content and 0 is desperate, which is the way round the art's `amount` already
reads.

- `decayNeeds` runs on the clock's ticks, one simulated minute each, at the
  rates in `sim/domain/archetypes.ts`. A family gets hungry fastest and will not
  walk far; a group of friends gets bored fastest and will walk anywhere.
- `strongestNeed` is the weighted loudest need, or nothing while a guest is
  content. It is the word in front of the inspector's live line - `Hungry ·
Walking to the Bakery · tile 12, 7`.
- `sim/domain/chooseVenue.ts` scores every venue that serves that need as
  `relief / (1 + distance / reach)` and picks the best. The venues come off the
  art through `sim/domain/venues.ts`; lodging is left out, being nowhere to walk
  to in the daytime.

## Walking towards it

A guest who wants something walks to it, and a guest who wants nothing wanders
exactly as the crowd always did. `sim/domain/router.ts` is the whole of it, and
it is the only thing the crowd calls.

- **One flow field per venue, not per need.** `doorNodesFor` takes a venue's own
  tiles and the ring one tile around them and collects every walkable node on
  them, sorted; `flowFieldFor` sweeps the graph breadth-first from those doors
  and writes, per node, the neighbour that gets nearer. A guest arriving anywhere
  then costs one array read.

  The field is per venue rather than per need kind because `chooseVenue` weighs
  a good venue further off against a weak one nearby, and a per-need field would
  route everybody to the nearest one serving that need - computing that choice
  and then ignoring it. `plans/README.md`'s decision 2 records the amendment.

- **Built lazily, and thrown away on an edit.** A venue nobody walks to gets no
  field at all; the HUD's `Routes` row is how many exist. One sweep of the
  reference plot's 2 260 nodes measures **0.47 ms**, and eighty of them
  **5.82 ms** - the ceiling `flowField.test.ts` holds it to. On a hand edit the
  venues are re-derived, `Router.rebuild` drops every field and every goal, and
  the crowd is put back on the new graph: a node index means nothing across a
  rebuild.

- **The crowd knows nothing about venues.** `createCrowd` takes one optional
  `routeOf(person, at) -> node`, injected exactly as `variantOf` is. `nextNode`
  consults it first and falls back to the wander when it hands back -1 or names
  the node somebody is standing on. A crowd built without one walks to the voxel
  as it did before there was a router, which `crowd.test.ts` pins.

- **A party goes together.** Whoever arrives somewhere and decides sets the goal
  for everybody in their party, so a family does not split up at the first
  junction. Arriving relieves the need and lets the goal go on the same arrival,
  so nobody stands in a doorway. **A visit takes no time yet**: capacity, the
  queue and the dwell are plan 018, and `router.ts` says where they go.

## Where the art lives

- People: `voxel-gen/people/`, a registry separate from `MODEL_SOURCES`, so they
  are never on the build palette or placed by the generator. `figure.ts` holds the
  shared builder and `hipHeight`. Preview with `pnpm preview --people`.
- Boats and buoys: `voxel-gen/sea/`. Balloons: `voxel-gen/sky/`.
- `PAINTED_MODELS` in `objectTypes.ts` is the union of catalogue and people; the
  material set, emissive lookup and scratch layout read it. `dveEngine.test.ts`
  meshes it.
- People paint from `voxel-gen/palette.ts`; `skin` is the one family they add.
- `voxel-gen/seats.test.ts` checks every seat has something solid under it and
  room for a body over it.

## Cost

Not yet measured. `pnpm bench` does not isolate the crowd; that is step 7.

## Milestones

| #       | Step                                                              | State              |
| ------- | ----------------------------------------------------------------- | ------------------ |
| 1       | The art: `skin`, the figure builder, four people, `--people`      | Landed             |
| 2, 3    | Walk network and crowd, pure and unit-tested                      | Landed             |
| 4, 5, 6 | Meshing, the crowd field, wiring into the showcase                | Landed             |
| —       | Two-node flights                                                  | Landed             |
| —       | Benches and the coffee shop's seats                               | Landed             |
| —       | Seats across the catalogue, lying down, beach loungers            | Landed             |
| —       | Avoidance on the sand, between people, and for boats              | Landed             |
| —       | People in the boats                                               | Landed             |
| 7       | Measure: `?people=n`, a HUD count, a bench case, real costs above | `?people=n` landed |
