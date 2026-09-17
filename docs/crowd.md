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
| How fast the crowd walks at each speed | `sim/domain/crowdRate.ts`                    |
| Obstacles on the sand                  | `crowd/domain/sandGrid.ts`                   |
| Seats in world space                   | `crowd/domain/seating.ts`                    |
| Putting people back on a rebuilt graph | `crowd/domain/nearestNode.ts`, `reseatCrowd` |
| A venue's doors                        | `sim/domain/doors.ts`                        |
| One sweep of the graph                 | `sim/domain/flowField.ts`                    |
| Where everybody is heading             | `sim/domain/goals.ts`                        |
| Choosing, routing and arriving         | `sim/domain/router.ts`                       |
| The beach as somewhere to go           | `sim/domain/beach.ts`                        |
| Where a party settles on the beach     | `sim/domain/beachPitch.ts`                   |
| Guest registry                         | `guests/domain/guests.ts`                    |
| Parties and who is a child             | `guests/domain/parties.ts`                   |
| Beds                                   | `guests/domain/homes.ts`                     |
| Names                                  | `guests/domain/names.ts`                     |
| Which person a click is on             | `inspect/domain/pickPerson.ts`               |
| What is selected, worded for the HUD   | `inspect/domain/selection.ts`                |
| The inspector's click                  | `inspect/adapters/inspectPointer.ts`         |
| The inspector panel                    | `hud/components/InspectPanel.tsx`            |
| What the resort is getting wrong       | `sim/domain/advice.ts`                       |
| The advice panel                       | `hud/components/AdvicePanel.tsx`             |
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
- **Beach seats** — seats on sand go into `network.beachSeats`: loungers a party
  settles on, or that a roamer takes.
- **The beach is a region.** In a crowd that roams it (`roamsBeach` omitted,
  which is every fixture and the no-router replay), a roamer picks a point on the
  sand within a few columns, a tile short of the water, walks straight to it, and
  leaves by a gate node with a small chance per arrival; on arrival they may take
  a free lounger within three columns. **The resort's crowd does not roam**
  (`roamsBeach: false` in `showcase.ts`): nobody is spawned on the sand or strolls
  onto it, and a stray - somebody an edit or a forgotten errand leaves out there -
  walks straight back to the nearest gate.
- **The beach is also a venue** (`sim/domain/beach.ts`): one for the whole band,
  serving fun 0.7 and energy 0.3, for 45 to 120 simulated minutes, with no
  capacity worth counting. Its flow field is swept from every gate. Arriving at a
  gate on a visit is the start of a stay at a pitch; see "Staying on the beach".
  The numbers live in `beach.ts` rather than on the art, because sand has no model
  to put them on.

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
- **At the clock's pace.** The crowd walks `crowdScaleFor(speed)` times faster
  than real time (`sim/domain/crowdRate.ts`), so that crossing the reference plot
  takes a tenth of a simulated day at every speed: 3.6× at slow, 10.7× at normal,
  26.7× at fast. `stepCrowd` runs a long step as whole steps of `MAX_STEP` and a
  remainder, with avoidance run once per step, so a sidestep is still decided
  for about a body's width of walking and an arrival carries at most one
  segment's leftover. A crowd stepped once by `n · MAX_STEP` is the crowd
  stepped `n` times by `MAX_STEP`.
- **Capped at `MAX_SUBSTEPS`, 32.** That is the most steps one call runs, so the
  most avoidance passes a frame pays for, and the scale's ceiling comes from the
  same constant. On the reference plot with 600 people a frame costs 0.08 ms at
  real time and 2.6 ms at the cap, a ratio of 1.01 over the cap's own factor;
  `resortWalk.test.ts` holds it under 1.15. `rush` wants 107× and gets 32, so
  at rush guests fall behind the day, crossing the plot in eight simulated
  hours. The frame's delta is clamped to `MAX_STEP` before it is scaled, so a
  backgrounded tab still costs at most one clamped frame. The walk cycle is
  stepped by the same scaled step.
- **A paused resort stands still.** The animation loop hands the crowd a frame
  of no time while paused. It still writes the instances, so the level of detail
  follows the camera. `crowdScaleFor('paused')` is 1, so the scale is not what
  stops it.
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
tile 12, 7` - and says what they are doing once they get there:
`Hungry · Third in the line at the Bakery`, then `Inside the Bakery`. Somebody
standing still gets no tile, since it does not change. A venue's own panel shows
how many are inside against what it holds, and how long the line at its door is.

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
choice use a seeded PRNG (`createRandom`), bench mode uses a fixed timestep and
pins the crowd's scale to 1, and outside bench mode the frame delta is clamped
(`MAX_STEP`) before it is scaled.

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

Needs are what runs on ticks; see below. The crowd stays on the frame delta but
walks at a multiple of it taken from the speed (see _Movement_), and stands
still while paused. Balloons, the sea and the build site are scenery and stay on
the frame delta at real time.

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
  `relief / (1 + distance / reach) / (1 + queue / capacity)` and picks the best.
  The venues come off the art through `sim/domain/venues.ts`; lodging is left
  out, being nowhere to walk to in the daytime.

## Walking towards it

A guest who wants something walks to it, and a guest who wants nothing wanders
exactly as the crowd always did. `sim/domain/router.ts` is the whole of it, and
it is the only thing the crowd calls.

- **One flow field per venue, not per need.** `doorsFor` collects the walkable
  nodes a venue is entered from, sorted - its declared doors, or the ring round
  it where it has none (see the next section); `flowFieldFor` sweeps the graph breadth-first from those doors
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
  junction.

## Capacity, and the line at the door

Arriving at a venue is the start of a visit rather than the whole of it.
`sim/domain/occupancy.ts` holds who is inside each venue and who is waiting at
it, and `Router.tick` runs it once per simulated minute.

- **A visit takes the dwell the art declared.** `dwellSeconds` is drawn per
  visitor off the router's own seeded generator, divided by the tick's sixty
  simulated seconds, and never rounds to zero: a beach shower is 30 simulated
  seconds and still takes a whole tick, because a zero-tick visit would admit
  and release somebody in the same call and no line would ever form.

- **The relief happens on the way out, not on the way in.** A guest who queues
  twenty minutes is fed twenty minutes later, which is the number plan 020 turns
  into unhappiness.

- **A door is declared on the art and turned with the building.** `ModelVenue`
  carries `doors`, a column in the doorway and the quarter turn somebody walks
  out in, exactly as a seat carries its `facing`. `venuesOn` turns them with the
  placement (`layout/domain/doorStep.ts`), and the door node is a walkable node
  on the tile each door opens onto: the first tile outside the footprint,
  straight out along its facing. Models with no way in shown on the art - the
  pool, the courts without a gate - declare none. The buildings on the beach
  declare the side they are walked up to over the sand; see the next section.

- **The layout gives every door a way in.** The generator picks a turn before
  any paving exists, and its mixed districts stand whole rows with their backs
  to the street. `growSpurs` settles it plot by plot, in plan order: of the turns
  that claim exactly the same tiles - a half turn always, a quarter turn only on
  a square footprint - it takes one whose door already opens onto paving, and
  otherwise the one whose door the shortest spur can be grown from, and grows
  that spur from the tile in front of the door. Only where every door is built
  against does it fall back to the shortest spur from any side. On the reference
  plot every building on the grass that declares a door opens onto paving; the
  bench scene gained 25 path tiles and 87 props for it.

- **A venue whose door nobody paved is entered from any side.** Where no
  declared door opens onto a walkable node, `doorsFor` falls back to every node
  on the footprint and the ring round it, which is what every venue did before
  doors existed, and says so in `declared`. That fallback is the safety rail: a
  building nobody can visit would show nowhere in the HUD.

- **A full venue grows a line back along the paving.** `queueLaneFor` walks the
  graph from the door node, always on to the neighbour furthest from the venue,
  and lays a person every six voxels along the edges it crosses - height
  included, so a queue down a flight of steps stands on the steps - each facing
  the person in front. The lane is laid with the venue's flow field and thrown
  away with it. People are placed on their spot rather than walked to it, which
  at the camera's distance reads the same and costs nothing per frame.

- **A short lane is a short queue.** A lane that runs out of graph - a two-tile
  spur - holds only as many as it has spots, and the guest after that balks.
  `chooseVenue` is handed the same length as `queueLimit`, so nobody crosses the
  plot for a line that will refuse them.

- **Standing still is a segment with a rate of zero.** `holdAt` writes the same
  point into `from` and `to` and puts the person in `LANE.none`, so the
  per-frame loop is exactly as branchless as it was and avoidance leaves them
  where they are. `releaseTo` puts them back on the graph. Nothing releases a
  held person but the simulation - there is no timer on it.

- **The sweep frees places before it fills them.** Whoever is done leaves, then
  the front of each line goes in, then everybody behind them shuffles up one
  place. The other order means a full venue never admits anybody on the tick
  somebody leaves, which reads as a line that moves every other tick.

- **A guest who finds twelve people already waiting goes somewhere else.**
  `MAX_QUEUE_SHOWN` is the ceiling on any line, and a venue's own lane is the
  real length wherever it is shorter, so the player never sees a line longer
  than the one guests walk away from. `chooseVenue` will not choose a venue that has reached it, and `arriveAt`
  turns away anybody who gets there anyway.

The HUD's `Venues` row is everybody inside anything over everybody in a line. A
waiting count that climbs and stays there is the resort saying it wants another
of something.

## Buildings on the sand

Nothing standing on sand is paved to, and the beach is not in the walk graph, so
a beach shower, a changing cabin or a beach club has no door node at all. Before
plan 027 that was 20 venues on the reference plot nobody could visit. They are
reached over the sand instead, and the beach stays unpaved.

- **A sand door, not a door node.** `doorsFor` also answers `sand`: for a venue
  whose anchor tile is beach band, the centre of the open tile each declared
  door opens onto, or failing that every open tile of the ring round it. "Open"
  is beach terrain with nothing on `network.sand` at the centre. Anything off the
  beach gets `sand: []` and exactly the nodes it got before.

- **A sand leg, found once per building.** `sim/domain/sandRoute.ts` sweeps
  breadth-first over beach tiles from all of a building's sand doors at once,
  each step only where `clearLine` between the two tile centres is clear, forty
  tile steps at most. Every gate beside a reached tile gets a route: the tile it
  steps off onto, then the path back to the door, string-pulled wherever the
  next point can be walked to straight without the chord touching anything or
  leaving the beach. Only beach tiles are ever waypoints, so no leg crosses a
  bay. All 19 beach buildings on the reference plot take about 10 ms, 317 routes.

- **The field is swept from the gates.** A building with no door nodes and a
  route has its flow field seeded from the gates those routes leave by, so a
  guest walks the graph to a gate as they would to any door. `chooseVenue`'s
  distance is the hops to the gate plus that gate's route length.

- **The crowd learns two calls and nothing else.** At the gate the router calls
  `walkSandTo(crowd, person, x, z)`: off the graph, `LANE.sand`, a sentinel of
  its own (`ERRAND`), a segment to the point at the sand's height. On arrival
  the crowd asks `routeOf(person, ON_SAND)`, and the router sends them to the
  next waypoint, holds them at the door, or `releaseTo`s the gate. If it does
  none of those - it was rebuilt - they become an ordinary roamer with the
  nearest gate as their way back. `releaseTo` from the sand keeps `LANE.sand`,
  decided from the ground they stand on. Nothing on the errand draws from
  `random`, so a crowd with no router replays exactly as before; `crowd.test.ts`
  pins that over 2 000 steps. `crowd.ts` still knows nothing about venues.

- **Queues stand on open sand.** `sandLaneFor` runs a straight line out from the
  sand door towards the way the nearest route walks up, a person every six
  voxels, and stops at the first spot something stands on or that is off the
  beach band - a short lane is a short queue, as on the paving. Inside is the
  building's middle, at the sand's height.

- **The visit over, they walk the route back** and are let onto the graph at the
  gate they left it by. A guest who finds the line full is turned away at the
  gate, before the walk; one who finds it full at the door walks back and
  decides again there.

- **A rebuild forgets every route and every errand**, for the fields' reason:
  routes name gate nodes. `reseatCrowd` leaves whoever is on an errand, or held
  on the sand, out there as a roamer - who, in a crowd that does not roam, walks
  straight back to the paving.

- **One case is left.** A poolside bar the generator stands on a sand terrace
  at level 3 is sand but not beach band, so neither a roamer nor a route reaches
  it. Paving sand terraces or roaming them is a decision of its own.

## Staying on the beach

A visit to the beach is a stay in one place, not a walk about on it: a party puts
its towels down together and stays there. Plan 028.

- **A pitch per party.** The first member to reach a gate on a visit chooses it
  (`sim/domain/beachPitch.ts`): breadth-first over beach tiles from the gate,
  each step only where the line between tile centres is clear, twelve tile steps
  at most, skipping paved tiles and tiles another party has pitched on. Of the
  tiles it reaches, the nearest is taken in this order: a free lounger for every
  adult, then any free lounger, then open sand two steps clear of the gate, then
  open sand at all. The router keeps the pitch per party until the last member
  leaves, with its tile and its loungers claimed.
- **A lounger counts from the whole square of nine around a tile**, and the last
  step onto one is not asked whether it is clear, because it ends inside the
  lounger's own box. The beach is laid in sets of lounger, parasol, lounger, so
  a tile's four direct neighbours are rarely two free loungers: counting only
  those, 2 of the reference plot's 27 gates could seat a couple on loungers and
  every other party lay on the sand in front of the gate. With the diagonals it
  is every gate.
- **A spot per member.** Adults first take the loungers; everybody else gets a
  spot on the sand in rows of three across the tile, five voxels apart, a second
  row five voxels further from the sea. On a lounger they lie as it lies; on the
  sand adults lie and children sit, facing the sea. A sitter's hips are
  `GROUND_SIT_RISE` (1.5 voxels) above the sand, so an adult's feet are on it.
- **The walk there and back is plan 027's.** One route per pitch, from
  `sandRoutesFor` to its middle, with the member's spot appended as a last
  waypoint. At the spot the router holds them: `holdOnSeat` for a lounger (the
  seat stays theirs until they are let go), otherwise `holdAt` with a pose, which
  `restingOn` reports. A member who reaches a gate the party's pitch cannot be
  reached from gets a pitch of their own there; with none either, the visit ends
  at the gate with its relief and they decide again. On the reference plot at
  `normal`'s pace that happened to none of 353 arrivals.
- **A day on the sand, not an hour.** Once a tick, a guest settled on a pitch
  whose loudest need the beach does not serve - and pulls at 0.4, twice the
  "content" line - gets up and walks over the sand to whatever does:
  `chooseVenue` over the buildings on the beach alone, everything off it scored
  at `Infinity`, and a route from `sandFieldFor`, which is one building's sweep
  of the beach kept for exactly this. Their pitch, their spot and their lounger
  stay theirs; they come out of the beach's own count while they are away and go
  back into it with the time their stay had left. Nothing on the sand for them,
  or no route to it, and they look again a quarter of an hour later.
  `resortGenerator.ts` stands snack bars and ice-cream carts on the back of the
  beach beside the bars and clubs, so there is food out there to walk to.
- **The visit over, they walk back** along the route and are let onto the graph
  at the gate. So at bedtime: once a tick, while anybody is on the beach, a guest
  with a bed whose bedtime it is has the stay ended early, with its relief. A
  stay that runs out, or a bedtime that comes, while they are at a kiosk ends
  there: the beach's relief, and a walk off the sand by that building's own gate.
  Somebody turned back part-way along a walk turns from where they have got to.
- **The inspector** says `Walking to the beach`, `Lying on the beach` /
  `Sitting on the beach` (no tile) and `Walking back from the beach`, from
  `Router.stayOf`.
- **A rebuild forgets every pitch** with the routes. The crowd leaves somebody
  settled on the sand out there as a stray, who walks back to the paving.
- **What it measures.** Ten simulated hours of the default resort, 570 guests:
  the beach is the most visited thing on the plot (678 visits), 34 to 65 people
  are resting on the sand through the afternoon and 10 to 20 of them on loungers,
  and the bars, showers and kiosks on the sand are busy with guests walking up
  from their towels. Before any of it: 28 beach visits, 9 resting, 4 loungers
  ever used.
- **Deferred:** swimming, and standing up mid-stay to walk to the water. Parties
  walking to the beach together is plan 029.

## The night

`sim/domain/night.ts` says when a party goes to bed and gets up, and the router
walks them there.

- **Every party has its own bedtime.** Spread over two and a half hours from
  19:00, and a wake time over two from 07:00, both worked out from the party
  index with an integer hash. Nothing is stored and nothing is drawn: the same
  party goes to bed at the same minute every night of its stay, and a save file
  has nothing to hold about it. Every window wraps midnight, which `isBedtime`
  handles.

- **Bedtime is timed against the sunset.** The sun sets at 21:30 (`SUNSET_TIME`
  in `lighting/domain/dayNight.ts`) and it is dark ten minutes later, so every
  party has set off before dark and the walk home can be watched. "Bedtime" is
  when a party turns for home: at `normal` the walk takes most of an hour.

- **Going home is a route, on a field per lodging.** At bedtime the router
  ignores venues and walks the guest down a flow field whose sources are their
  lodging's doors, found by `doorsFor` exactly as a venue's are. The field is
  memoised per lodging, which is the cached per-party route decision 2 asked
  for, shared by every party under the same roof.

- **Lodging is not a venue.** `lodgingsOn` is `venuesOn` with the filter turned
  round, and the two lists are disjoint: a bungalow in the venue list would be
  somewhere a bored guest could decide to walk into.

- **Asleep is held.** Reaching the door holds the guest in the middle of the
  lodging, where the walls hide them, until `Router.tick` finds their night
  over. They get up with their energy filled and a share of hygiene back, and
  walk out of the door they came in by. A guest inside a venue when bedtime
  comes finishes their visit first. A rebuild wakes everybody.

- **A guest with no bed walks all night.** So does one whose lodging no paving
  reaches, or whose lodging was bulldozed. They carry on as by day, venues and
  all - the state plan 020 turns into unhappiness.

- **The resort walks home in the evening light.** On the reference plot with
  600 guests, all housed, at `normal` and sixty frames a second: at 20:00, 147
  are walking home; at sunset, 335 are walking home and 129 are asleep; by
  23:00, 408 are asleep; at 02:00, 596. The beach is empty by 23:00 and has
  people on it again from about 08:00. `router.test.ts`'s night test still
  steps the crowd at real time.

- **The windows light from the resort's share of beds slept in.** The share of
  lit panes after dark is `0.5 * asleep / beds`, one uniform on the window
  material, written when the share changes. **It is the resort's share and not
  each building's**: a building is an instance, and the instance index is a
  slot rather than a placement, so saying _which_ hotel is full needs a
  per-instance buffer kept in step through every grow, push and swap. See the
  note on `windowMaterial` in `instancedWorld.ts`.

The HUD's `Asleep` row is guests in bed over guests with a bed.

## Arriving and leaving

`sim/domain/rating.ts` says what the resort is worth, `sim/domain/checkIn.ts`
says who turns up because of it, and the router walks whoever is finished to a
gate. This is the half of the loop that makes what you build change _how many_
people there are rather than only what they do.

- **A slot is a body, and the person inside it changes.** `crowdField.ts`
  decides once, when the crowd is built, which person indices each
  `InstancedMesh` draws, off `crowd.variant` - so nobody may ever be redrawn as
  somebody else. The registry therefore keeps its capacity and gains a `present`
  column: check-out empties a body, check-in deals a new party into free bodies
  of the right shape. A family wanting three children with one child body free
  arrives as a family of three, and a party with no adult body free does not
  arrive at all. `crowd.offPlot` is the same fact where the crowd can read it:
  held still, not drawn, never asked anything, and left alone by `reseatCrowd`.

- **Check-out is a walk, not a disappearance.** Once a simulated day every
  present guest whose `arrivedOn + nights` is behind the calendar is sent for the
  gate. The way out is one flow field swept from every gate's doors at once, so a
  guest leaves by whichever is nearest, exactly as the beach is one venue entered
  at any gate. Leaving is asked **before** bedtime, so nobody whose last night is
  over goes back to a bed that is not theirs; and nobody is dragged out of a
  restaurant to catch a coach - they walk out when the visit ends.

- **The gate is declared on the art.** `gateway: true` on `VoxelModelSource`,
  read back through `isGateway` and collected by `gatewaysOn`, for
  `ModelVenue`'s reason: a list of ids in `src/` would be a second place to
  change it. A gate is deliberately **not** a venue - one in the venue list would
  have a bored family queueing at it. A plot with no gate standing takes nobody
  and lets nobody go, which the HUD's `Guests` row is what shows.

- **Happiness follows the needs.** `happiness.ts` is a column beside `needs.ts`,
  aged on the same ticks. It drifts towards the plain mean of a guest's five need
  levels at 0.15 an hour, and standing in a line costs 0.3 an hour on top. It is
  not weighted by `archetypes.ts`: those weights say what a guest will walk
  _for_, which is a different question from whether they had a good week. It is
  slow on purpose, so a rating says something about how the resort is built
  rather than about the last ten minutes.

- **The rating has two terms and no more.** Mean happiness carries three
  quarters and the share of present guests with a bed carries the last quarter -
  the one thing happiness cannot see, because a guest with nowhere to sleep
  simply walks all night and their energy says so a day later. A resort with
  nobody on it rates 3 stars, the benefit of the doubt, or an empty plot could
  never fill. Money is **not** a term and must not become one; that is plan 024.

- **Arrivals follow the rating, capped by the beds.** At eleven in the morning
  the coaches come in: none at all at zero stars, and at five stars a quarter of
  the beds standing free. Never more than the free beds, because a guest with
  nowhere to sleep would be unhappy about it and drag the rating down - the
  resort turns them away at the gate instead. `checkInDue` is asked with the
  whole run of ticks the clock produced, so twelve ticks in one frame cannot step
  over eleven o'clock. Every arrival gets needs and a mood drawn afresh: the body
  they were dealt was somebody else's a week ago.

- **A party that checks out is forgotten whole.** `Router.forget` is called for
  every member and not only for the one at the gate: somebody who was having
  lunch when their family left is taken off the plot where they sit, and a visit,
  a bed, a queue or a towel on the sand left standing would end a few ticks later
  and walk an empty body out of a door.

- **What it does on the reference plot.** Seed 3, 112 by 100: 682 beds, 3 gates,
  400 bodies. Three simulated days at `normal`, opened on day 2 - which is the
  earliest a stay can be behind anybody, since `createGuests` spreads arrivals
  over their own stays - gives 200 check-outs and 131 check-ins, ending with 331
  guests on the plot and every one of them in a bed. `router.test.ts` runs it.

The HUD's `Guests` row is guests on the plot over the bodies it was built for,
and `Rating` is the stars. The inspector's `Mood` row is one guest's happiness.

## Advice

`sim/domain/advice.ts` ranks what the resort is getting wrong and
`hud/components/AdvicePanel.tsx` shows the top four, behind the bar's `Advice`
button. Everything needed to say "you need another bakery" was already measured
and none of it was ever said.

- **It computes nothing.** Every number is one something else counted: the
  router's own tally of who it turned away and who it let in, `homes.ts`'s
  parties with no roof, `doors.ts`'s buildings with no way in, `venuesOn` and
  `reliefAt` for what the plot serves at all. **Advice observes, and must never
  be the reason something else starts counting differently.** A rule that wants
  a change in `chooseVenue.ts` or `occupancy.ts` is a bug found in the thing it
  was observing, and worth more as a bug report than as a weighting.

- **Six rules, six small functions, six tests.** A seventh - cleanliness,
  weather - is a seventh function and never a branch in one of these. Each takes
  a `ResortFacts` literal and returns advice or nothing, so every one of them is
  tested without a plot under it.

  | Rule            | What it reads                          | Weight                                      |
  | --------------- | -------------------------------------- | ------------------------------------------- |
  | `no-beds`       | guests with `NO_HOME`, beds free       | the share of the plot, undamped             |
  | `unserved-need` | `venuesOn` × `reliefAt`, per need      | the share wanting it                        |
  | `full-lines`    | the day's balks and visits per venue   | share refused × how many that was           |
  | `unreachable`   | `doorsFor`: no nodes **and** no sand   | 0.9 flat, per venue                         |
  | `far-from-home` | lodging → nearest venue serving a need | distance against `ARCHETYPES.friends.reach` |
  | `unvisited`     | venues with no visitors all day        | 0.2 to 0.4, by the room that stood idle     |

- **Straight line, not walking distance.** `far-from-home` measures the straight
  line from a lodging's middle. A flow field per lodging per need is exactly the
  eager sweep `router.ts` refuses to do, and the straight line is near enough to
  point at a corner of the plot. It fires past `ARCHETYPES.family.reach`, the
  smallest in the table: a lodging further than that from somewhere to eat is one
  whose families stop eating.

- **A beach building is not stranded.** A venue counts as unreachable only when
  it has no door node **and** no sand in front of it, so the twenty showers and
  cabins on the sand - which have no door node and are perfectly reachable - are
  left alone. What it does not
  ask is whether a route over the sand exists: that is a sweep of the beach per
  building, and the answer is already right about every building the player can
  do anything about.

- **Once a simulated day, and on an edit.** Computed after the morning's coaches,
  so the day's advice describes the plot as it now stands, and again when a hand
  edit has settled and the walk graph has been rebuilt - bulldozing the only
  restaurant should say so now rather than tomorrow. `Router.forgetTheDay` then
  starts a fresh day's counting. Never per frame: it walks the guest list twice
  and the venue list once. The venues nothing can reach are worked out with the
  graph rather than with the advice, because the graph is what decides them.

- **A label is not an address.** A plot stands nine Changing Cabins, so advice
  about one building carries `at`, its tile, and the panel prints it the way the
  inspector titles a building - `room for 40 · tile 101, 9`. Advice about one
  need carries `need` for the same reason: "Bungalow guests walk 62 tiles for
  something they need" names a number and no errand, where "for somewhere to
  rest" is a thing to build. Both are `| null` for the rules they do not apply
  to. Every line that carries a tile also carries a **Show** button, which pans
  the camera to it: `SceneHandle.lookAt` keeps how far off and how high the
  camera was standing, so arriving reads as having walked there rather than as a
  cut to another scene, and both modes' remembered targets move together so
  switching view afterwards finds the same place. The height comes off the live
  terrain rather than off the placement, so a building on a terrace is looked at
  and not through. A benchmark refuses it, for the reason it refuses a mode
  change: a run is measured through one pinned view. Pointing at _which_ one
  spatially, without being told, is still the heatmap's job, deferred below.

- **An idle venue is ranked by the room that stood empty.** Flat 0.3 apiece was
  the first cut, and running the resort showed it up: a quiet day leaves a dozen
  of ninety venues unvisited, all tied, and which four reached the panel came
  down to placement order. A forty-place restaurant nobody ate in is worse news
  than a one-place shower nobody rinsed under, and the art declares the
  difference. It stays a note: never louder than 0.4, where a stranded venue is
  0.9.

- **The wording is in the panel.** The domain hands back a kind, a weight, a
  subject already named and the count that produced it; `AdvicePanel.tsx` turns
  that into a sentence, for the reason `InspectPanel.tsx` keeps its own
  `NEED_LABELS`. No line claims a cause the number does not support: "the Bakery
  is too small" is a guess, "the Bakery turned 41 away at the door today" is what
  happened.

- **What it says about the reference plot.** Seed 3, 112 by 100, 600 guests, 91
  venues and 121 lodgings: nothing unserved, nothing unreachable, nobody without
  a bed, and the loudest thing on it a bungalow whose guests walk 62 tiles for
  somewhere to rest, at tile 1, 70. Half the lodging-to-need pairs are over 20 tiles -
  median 19, max 62 - which is the distance-as-a-design-constraint the panel
  exists to surface. Gathering the facts and ranking them costs 2.4 ms.

- **Deferred deliberately**: the heatmap overlays - footfall, need coverage,
  queue pain - which answer the same question spatially and would name _which_
  bungalow rather than the type. Everything gathered here would feed one; it is a
  rendering plan of its own.

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
| —       | Stays that end, a rating, and the coaches that follow from it     | Landed             |
| —       | Advice: what the resort is getting wrong, ranked                  | Landed             |
