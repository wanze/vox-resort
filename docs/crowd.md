# Crowd and simulation

Guests, staff, boats and balloons, and the simulation that drives them.

|          |                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------ |
| People   | 0.25 per paved tile, max 10 000 (`crowdSize.ts`), `?people=n` overrides. Three adult models, one child |
| Poses    | walk, stand, sit, lie; drawn only: swim, wade, hop, cheer, jog, strike, reach                          |
| Boats    | 12 (`CRAFT_COUNT`), plus buoys and rental boats                                                        |
| Balloons | 36 (`BALLOON_COUNT`)                                                                                   |

## Code

| What                            | Where                                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| Walk network                    | `crowd/domain/walkNetwork.ts`                                        |
| Crowd state and step            | `crowd/domain/crowd.ts`                                              |
| Avoidance                       | `crowd/domain/avoidance.ts`                                          |
| Crowd speed per clock speed     | `sim/domain/crowdRate.ts`                                            |
| Obstacles on the sand           | `crowd/domain/sandGrid.ts`                                           |
| Seats in world space            | `crowd/domain/seating.ts`                                            |
| Re-placing people after an edit | `crowd/domain/nearestNode.ts`, `reseatCrowd`                         |
| Venue doors                     | `sim/domain/doors.ts`                                                |
| Flow fields                     | `sim/domain/flowField.ts`                                            |
| Choosing a venue                | `sim/domain/chooseVenue.ts`, `appeal.ts`                             |
| Routing and arriving            | `sim/domain/router.ts`                                               |
| Queues and visits               | `sim/domain/occupancy.ts`                                            |
| Beach                           | `sim/domain/beach.ts`, `beachPitch.ts`, `sandRoute.ts`               |
| Needs, happiness, rating        | `sim/domain/needs.ts`, `happiness.ts`, `rating.ts`                   |
| Night, weather, check-in        | `sim/domain/night.ts`, `weather.ts`, `checkIn.ts`                    |
| Cleanliness and staff           | `sim/domain/upkeep.ts`, `staffRouter.ts`                             |
| Advice                          | `sim/domain/advice.ts`, `hud/components/AdvicePanel.tsx`             |
| Money                           | `catalog/domain/prices.ts`, `sim/domain/ledger.ts`, `takings.ts`     |
| Guests, parties, beds, names    | `guests/domain/`                                                     |
| Inspector                       | `inspect/`, `hud/components/InspectPanel.tsx`                        |
| Drawing the crowd               | `crowd/adapters/crowdField.ts`, `rendering/adapters/figureField.ts`  |
| Places in a venue               | `choreography/domain/places.ts`, `casting.ts`                        |
| Swimming in the sea             | `choreography/domain/seaSwim.ts`, `sea/domain/swimArea.ts`           |
| Ball games                      | `choreography/domain/games.ts`, `courts.ts`, `adapters/ballField.ts` |
| Boats and passengers            | `sea/domain/piers.ts`, `passengers.ts`                               |

## Walk network

Built from the layout, and rebuilt after every hand edit.

- **Nodes**: one per paved tile. Stairs, ramps and bridge ramps get two (foot and
  head). The climbs are read off the pieces laid (`id` and `rotation` on each
  paved tile), so an old save's flights are what the graph walks. A ramp's foot
  rises half a level and its head the other half; the head's low node is the
  foot's high one. Nobody steps onto a ramp's head from the side.
- **Edges**: between neighbouring paved tiles at most one level apart; a
  one-level difference only via stairs or a ramp's head. The two edges up and
  down a flight's treads are `stepped`, the one thing a wheelchair cannot use.
- **Seats** from the art (`ModelSeat`) are placed in world space by `seating.ts`
  and attached to the nearest paved node within reach. Seats with no paving
  nearby are dropped. Seats on sand go into `network.beachSeats`.
- The per-frame step never reads terrain, occupancy or layout.

A quarter second after the last hand edit (`REANCHOR_DELAY_MS`), the network is
rebuilt and everyone is put back on it (`reseatCrowd`). People keep their
position and identity but lose their seat. Crowd size doesn't change.

## Movement

- A person moves along a segment `from → to` at parameter `t`. Sitting or lying
  is a zero-length segment with a duration (`SIT_SECONDS`, `LIE_SECONDS`).
- `cameFrom` stops people doubling back at junctions.
- **Avoidance**: a spatial hash rebuilt each frame. Walkers step right (up to four
  voxels) and slow down (not below 15%). At a crossing the higher index waits.
- **On sand**, `sandGrid.ts` rasterises obstacles once per resort and walkers
  check for a clear line.
- **Speed follows the clock**: `crowdScaleFor(speed)` makes crossing the
  reference plot take a tenth of a simulated day at every speed. Long frames are
  split into `MAX_STEP` substeps, capped at 32 (`MAX_SUBSTEPS`), so `rush` falls
  behind. Paused means standing still.
- **Boats** look ahead, steer away from piers and each other, and stay inside the
  bay.
- **Hire boats** go out only while the pedalo rental has visitors, one boat for
  every two (`HIRERS_PER_BOAT`), read from the cast after each recast
  (`insideAt`), and always with two aboard. A hire is two resort hours out,
  then the trip home; a boat out when the visitors leave finishes its hire, and
  none is called back early. This is drawn only: the visit, its dwell and its
  price are the router's.
- Hire boats keep the **crowd's time** (`walked * crowdScale`), not real time:
  they pedal at 0.6 of walking pace, stop when the crowd stops, and fall behind
  the day at rush as the crowd does. Long frames are split into substeps of a
  quarter of a crowd second, so a boat never steps over its berth.

## Storage

Structure of arrays, fixed capacity, no per-frame allocation:

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

`node` is `-1` on the sand. New attributes are new columns.

A crowd keeps its capacity on a graph with no edges: `count` is 0 and every body
waits off the plot (`offPlot`), with its variant, phase and speed drawn as on a
paved plot. The first paving brings `count` up to capacity, and `putOnPlot` lets
bodies in one at a time. The field's meshes are sized by capacity, so they exist
from the start; `drawCalls` and `triangleCount` read 0 while nobody is drawn.

## Guests

`createGuests` builds a registry parallel to the crowd: guest `i` is the walker
at index `i`. It's separate from `Crowd` because none of it is read per frame.

Guests come in parties (`PARTY_MIX`):

| Kind    | Share | Adults | Children |
| ------- | ----- | ------ | -------- |
| family  | 0.40  | 2      | 1–3      |
| couple  | 0.30  | 2      | 0        |
| friends | 0.18  | 3–4    | 0        |
| solo    | 0.12  | 1      | 0        |

About one party in 14 (`WHEELCHAIR_SHARE`, 0.07) has an adult in a wheelchair
(`Party.wheelchair`, the person index or -1). It is drawn from its own stream
salted off the party index, so no other draw moves. A wheelchair rolls at 0.8 of
its user's drawn speed (`paceOf`, asked per edge). Saves from before load with
nobody in one.

Children use the `child` model. Beds come from the art (`bedsOf`); the biggest
parties get the biggest lodgings first. A party without room gets `NO_HOME` and
starts away, as check-in would have turned it away: a plot paved for more guests
than it sleeps opens with only the housed ones on it.

Homes follow the plot. After an edit, `rehome` rebuilds the free beds from the
lodgings standing and remaps each guest's home **by key**, so an edit that leaves
the lodgings alone leaves everybody where they sleep. A party whose lodging was
demolished is re-housed whole (`homeWithRoom`, parties in index order), or left
`NO_HOME` if nothing fits; the advice's `no-beds` then says so.

A plot with no paving is dealt its guests by area instead (`crowdSizeForArea`:
the 20% of tiles a generated plot paves, at the usual 0.25 a tile) and starts
`away`: nobody present, every bed free. The draws are the same as a full start.
A bare game is dealt by the land it owns (`crowdSizeForOwned`), whatever is
paved: 256 guests on the starting block. Buying land grows it at the next
settle (see [Land](#land)), and it never shrinks.

## Inspector

Clicking without a build tool selects what's under the pointer. A click is a
press and release within 4 px and 400 ms; anything else is a camera drag.

`pickPerson` tries people first, by screen distance at hip height. Otherwise the
tile's placement is selected. `selection.ts` turns the pick into HUD text. A guest
shows their needs, destination and a live status line, such as
`Hungry · Third in the line at the Bakery`. A venue shows how many are inside and
queuing.

## Drawing

- One `InstancedMesh` per person model, not chunked or frustum-culled. People
  under `HIDDEN_PIXELS` are packed out of the draw but keep walking.
- A wheelchair user is drawn sitting wherever they are (`DrawnAs.chair`, from
  `Casting.inChair`), the hips a seat's height (`CHAIR_SEAT_VOXELS`) above where
  anything but a sitting pose stood them, and the `wheelchair` prop under them
  from `crowd/adapters/chairField.ts`: one preallocated mesh, one draw call.
  Casting gives them a still spot to stand at, then a seat, never a lounger, a
  game or the water; a venue with none of those has them at a watcher's place.
- The CPU writes position and yaw. Every pose is done in the vertex shader
  from one per-vertex `figure` vec4 and one per-instance `pose` vec4. These are
  packed because WebGPU allows only eight vertex buffers; `crowdField.test.ts`
  counts them.
- People are painted at half a world voxel (`FIGURE_SCALE`, the model
  source's `scale`), which the mesher shrinks back, so a figure stays 3 wide,
  2 deep and 7 tall in the world while its arms and legs are half a voxel
  across. The arms hang from `shoulderHeight` to `handHeight`, beside the
  thighs: one voxel of sleeve, two of forearm.
- `figure.x` is one weight channel for both limbs. A leg's weight tapers from
  the foot to the hip; an arm carries only its side at `ARM_WEIGHT`, past any
  leg's, since it turns whole about the shoulder. Arms are found per triangle,
  from the centroid, which relies on the mesher giving every quad its own
  vertices.
- The mesher culls the faces where an arm touches the body, so
  `rendering/domain/figureLimbs.ts` adds them back: the arm's inner side and
  the chest and thigh behind it, coloured from the part they close. Without
  them a swinging arm would open a see-through slit.
- `pose.z` is `code + progress`. Codes 0 to 3 are the crowd's `RESTING`; 4 to
  10 are `DRAWN_POSE` in `rendering/domain/poses.ts`, only ever drawn, set
  through `DrawnAs.pose`. Cyclic poses run on the field's clock; timed ones
  (strike, reach) read `progress`, set with `poseWith`.
- People use the lit material (so lamps light them) and get no blob shadow.
- Passengers are a separate figure field posed in the boat's frame.
- The field draws a `DrawnAs` (the cast, see Places) over the crowd: a placed
  person is drawn at their place and pose, a hidden one not at all. The crowd's
  own state is never written.

## Determinism

Bench runs must replay the same scene. All randomness uses a seeded PRNG
(`createRandom`), bench mode uses a fixed timestep and real-time crowd speed, and
outside bench mode the frame delta is clamped to `MAX_STEP`.

## Clock

`sim/domain/simClock.ts`. State is `ticks` (simulated minutes since opening), the
speed and a carry. One tick is a minute; a day is 1 440 ticks. One frame
advances at most 12 ticks, so under load the clock falls behind. The resort opens
paused.

| Speed  | Real seconds per day |
| ------ | -------------------- |
| Slow   | 900                  |
| Normal | 300                  |
| Fast   | 120                  |
| Rush   | 30                   |

Needs run on ticks. The crowd and the hire boats run on frame time scaled by
speed. Balloons, the rest of the sea and construction run at real time.

## Needs and choosing a venue

`needs.ts` holds five levels per guest (hunger, thirst, energy, fun, hygiene),
from 1 (content) to 0 (desperate), and a sixth, health, that is not a want (see
[Breakdowns and injuries](#breakdowns-and-injuries)). `decayNeeds` lowers them each tick at rates
from `archetypes.ts`: families get hungry fastest and won't walk far, friends get
bored fastest and walk anywhere. A sleeping guest's needs hold where they went to
bed; at these rates a night would otherwise empty every one of them by morning.

`strongestNeed` decides **whether** a guest goes somewhere. `chooseVenue` decides
**where**, scoring every venue:

```
score = gain * taste * recency
        ---------------------------------------------------------
        (1 + distance / reach) * (1 + CROWDING * busy / capacity)
```

- **gain** counts only what the guest can use: `min(amount, 1 - level)`, over
  every need the venue serves, including negative ones. Levels are estimated for
  arrival time, after the walk.
- **taste** is a stable per-guest, per-venue preference hashed from the venue key
  (`TASTE_SPREAD` 0.3).
- **recency** halves the score of the place they just left (`REVISIT` 0.5).
- **busy** is everyone inside plus everyone queuing (`CROWDING` 2).

Tune `archetypes.ts` first.

## Routing

`router.ts` is the only thing the crowd calls. Guests who want nothing wander.

- **One flow field per venue**, swept breadth-first from its doors
  (`flowFieldFor`). Built on demand and dropped on every edit. The Debug window's
  `Routes` row counts them.
- The crowd knows nothing about venues: `createCrowd` takes an optional
  `routeOf(person, at)` and falls back to wandering.
- **Parties move together.** Whoever decides sets the goal for the whole party.
- **Step-free fields.** A party with a wheelchair user routes as a whole on
  fields that skip stepped edges (`flowFieldFor(..., { stepFree: true })`), for
  venues, beds, the desk and the way out. Each is swept only when such a party
  first asks, and always when it considers a venue: a straight line would hide
  that the way there is all stairs. The beach and every venue reached over the
  sand are out of their reach. Nobody else ever sweeps one, so a resort with no
  wheelchair users routes exactly as before. The saved router lists them in
  `stepFreeFieldsBuilt`.

## Visits and queues

`occupancy.ts` tracks who's inside and who's waiting, updated once per tick.

- A visit lasts the art's `dwellSeconds`, at least one tick. The need is satisfied
  on the way **out**.
- **Doors** are declared on the art (`ModelVenue.doors`) and rotate with the
  building. The layout orients buildings so doors face paving where it can. A
  venue without a reachable door can be entered from any side.
- A full venue grows a queue back along the paving from its door, one person every
  six voxels. People are placed on their spot, not walked there.
- A short path means a short queue. Guests won't pick a venue whose queue is full
  (`MAX_QUEUE_SHOWN` 12 or the lane length), and are turned away if it fills
  before they arrive.
- Each tick: people leave, then the front of the queue enters, then the queue
  moves up.

## Places

A **place** is where somebody at a venue is drawn: a seat or a spot the art
declares (`placesFor`). The sim holds a visitor at the middle of the
footprint. The **cast** (`casting.ts`) draws them somewhere better. This is
**visual only**: nothing in the sim reads it, nothing is saved, and a load or
an edit simply recasts.

- **Visitors** fill a venue's visitor spots in declaration order, then its
  seats (those without `watches` or `post`), then its areas and loops. A
  venue's `order` changes which kind comes first: the pools list
  `['areas', 'loops', 'spots', 'seats']`, so the loungers fill last. A party
  admitted together takes places side by side. The first two tennis places
  are the singles players.
- **Children's places**: an area or loop marked `for: 'child'` (the paddling
  pool, the spa of the second pool, the playground's tower and bars, the kids
  club's slide) and a spot marked `child` (the swings, the sandpit, the kids
  club's play spots) take children first. A child takes the first free
  child's place, else any free place; an adult takes the first free place not
  marked for children, else one that is, so parents end up on the benches.
- **Watchers**: at the tennis, basketball and volleyball courts, the line is
  drawn on the spectator seats (`watches`) and watcher spots, by queue rank,
  instead of on the path. The simulated queue itself is unchanged. With no
  watcher place left, a waiting guest stays on the lane.
- **Hidden inside**: a visitor with no free place is not drawn at all, and
  neither is a guest asleep in a lodging. That covers the restrooms, the
  supermarket, and the overflow of a restaurant with more capacity than
  seats. A hidden person cannot be picked.
- **Staff**: a worker the staff router has at work at a venue (`atWork`) is
  drawn there by `recastStaff`: an animator on its `animator` spot, a
  lifeguard on its `lifeguard` spot, and a cleaner or a mechanic on its
  `for: 'staff'` spot (tennis, basketball, volleyball, pool, minigolf,
  playground), or, at a venue with none, where the router holds them. A
  cleaner making up a room or restocking is at no venue, so stays where the
  sim hides them indoors. What they do there is under **Staff at work**.
- **The seat pop**: passers-by still sit down on venue seats, since keeping
  them off would change every seeded replay. When one claims a seat a visitor
  is drawn on, `keepSeats` moves the visitor to another place in the same frame.
- The cast is recast once after a frame's ticks. It is rebuilt with the
  network on every edit, because places point at network seats by index.
- **Areas and loops**: a venue can declare `areas` (water visitors move about
  in, each holding `places` visitors) and `loops` (a polyline its riders go
  round). A visitor on one is **acting**: `perform` (`acts.ts`) draws them
  every frame, after `keepSeats`. In a `swim` area they swim from one hashed
  point to the next and stand in the water for 1 to 4 s between legs; with `laps`
  they swim the long way in a lane of their own and turn at each end; in a
  `wade` area children walk, wade and hop. A loop rider goes round at a speed
  set by each leg's pose: slowly up a ladder (`climb`, drawn jogging), fast
  down a slide (`slide`, drawn sitting), swimming and walking. Riders are
  spread over the loop's time, so they keep their spacing on every leg. The
  mix at a pool is its declaration order, so tuning it is art.
- **The acts clock** is the choreography's own, advanced every frame by
  exactly the crowd's scaled step (`advanceActs`), so acts pause, hurry and
  replay under the bench with the crowd. Where somebody is is a pure function
  of the act, the place, the person and the time: leg targets are hashed with
  `mix`, never drawn from a seeded stream. The cast caches only the current
  leg, so a frame does not replay every leg since the cast.
- **None of this is saved.** Like the rest of the cast it is visual only: the
  simulation never reads where a swimmer is, and a seeded draw here would
  move every replay. After a load or a rebuild everybody starts a fresh leg.
  When a visit ends the place is released and the swimmer pops back to where
  the crowd has them.
- **Games**: at the tennis, basketball and volleyball courts the players
  play (`games.ts`), and the watchers follow the ball (`courts.ts`). A game
  belongs to the venue, not to a person: each frame `perform` replays the
  court's current **rally** from its start, a pure function of the game, who
  is playing and where they stood as it began, the rally's number and the
  time into it. Every choice in it (shot lengths, targets, apexes, who
  receives, how many touches) is hashed with `mix`. A rally plays for a
  hashed 6 to 20 s, the last ball is a winner nobody reaches, and a 2 to 4 s
  pause follows; only the rally's start and length are cached on the court.
  - **Tennis**: one player practises serves, each ball bouncing in the far
    service box and rolling on to the back. One a side is singles from the
    baselines, two a side is doubles with a player at the net who volleys.
    With three, the odd one waits by the net post and hops now and then.
    Every ball clears the net, bounces inside the lines and is struck as it
    reaches the receiver, the swing halfway through.
  - **Basketball**: up to four shoot around at the hoop nearer most of them,
    each from a place of their own on its half, rebounding the shot before
    their own. Five or more, at least two a side, play a possession a rally:
    the attackers take the defenders' places mirrored through the middle,
    pass about, shoot, and the defence rebounds; the next rally the other
    team attacks the other hoop. The ball is always in somebody's hands
    (held or dribbled) or in the air.
  - **Volleyball**: with somebody on both sides, each side touches the ball
    one to three times before it goes back over, the third touch sometimes
    a spike. Alone on one side, the ball is bumped up and down until dropped.
  - Players move to meet the ball at jog speed, never further than a jog
    covers in time, and stay on their own side of the net (in basketball, in
    the half being played). They face the ball, and in their own hands face
    where they mean to send it.
  - **Watchers** turn towards the ball at 3 rad/s, at most 1.4 rad from
    facing the court. In the pause after a point a hashed half of them cheer
    (a seated watcher stands up on the seat to do it). A court nobody plays
    on has no game, no ball, and watchers facing the court.
  - Whoever is cast mid-rally stands at their place, following the ball, and
    joins at the next rally. Somebody walking off mid-rally breaks it off:
    the ball drops where it was and the next rally starts 1.5 s later with
    whoever is left.
  - **The ball** is a prop drawn by the ball field
    (`choreography/adapters/ballField.ts`), one slot per court and per
    minigolf party (`cast.played`), rewritten every frame after `perform`.
    All of it is drawn only: the simulation never reads a game, and nothing
    of it is saved.
- **Minigolf** (`golf.ts`): the art declares `lanes`, each a ball `line` from
  tee to cup bent round the lane's hedges and corner, the `walk` from its cup
  to the `next` lane's tee by the sand walks, and the layer `y` the players
  stand on; a spot's `lane` makes it a waiting place, the first beside the
  tee, the second beside the cup. The holders of a lane's spots are a party.
  Every party moves on a lane each **slot** at once (82 s on the catalogue
  course, the slowest lane's walk and turns), so no two share a lane. A slot
  is the walk over in file, then each member's turn: up to the tee, 1 to 3
  hashed putts (`strike` with its progress swept, the ball rolling and
  slowing along the line), down the lane to the cup, and to wait beside it.
  The others wait beside the tee or the cup, facing the putter.
- **Playground** (`play.ts`): a spot with `act: 'swing'` swings as a pendulum
  from the bar on layer `pivot`, 3 voxels out at the top, period hashed 2 to
  3 s, and one swing in four the child stands up cheering at the front of the
  arc (the painted seat stays where it is). `act: 'dig'` is a child kneeling
  in the sandpit, drawn as a slow `strike` sunk a voxel into the sand, since a
  figure holds one pose. The tower is a loop up the ladder, over the deck and
  down the chute; the monkey bars a loop that climbs inside the end ladder,
  goes hand over hand (`hang`, drawn reaching up) and lets go (`drop`). A
  parent sitting at a venue with children's places turns towards their own
  party's child, eased at 1.5 rad/s and at most 1.4 rad from facing.
- **Kids club** (`tag.ts`): the yard spots carry `act: 'tag'` and the `yard`
  rectangle they share. Every player runs 3 s legs between hashed points,
  jogging there and hopping for the rest; the hashed "it" (a new one every
  24 s) wanders, and the others take the one of three hashed points furthest
  from where it is heading. The slide is a loop as on the playground.
- **Shows** (`shows.ts`): `noteShows` reads `performingAt` after the ticks.
  While a show is on, the kids club's tag players and the game hall's players
  run to rows of four in front of the animator and cheer and hop by turns,
  and at a venue with a `floor` (the beach club's aisle) everybody sitting
  gets up and dances on it: a hashed spot clear of the animator, `jog`,
  `cheer` and `hop` steps, the heading swaying. Lying stays lying. After the
  show they run back and sit down where they were. Where each set off from is
  kept per person, so the run over is one straight line.
- **Gym**: a spot's `station` is what its athlete does in place, facing the
  art's way: `run` jogs on the spot (the treadmills face the mirror), `jump`
  is jumping jacks (`cheer` and standing by turns), `lift` cycles `reach`,
  and `mat` lies with a sit-up a cycle.
- **Game hall**: `act: 'play'` hammers the machine's buttons, a fast
  `strike`, heading fixed on it; for a show the players back out of the bay
  before running round.
- **Beach shower**: `act: 'rinse'` turns slowly on the spot under the rose,
  hands up (`cheer`) and down (`wade`) by turns.
- **Staff at work** (`work.ts`, `performWork` on the staff cast every frame):
  an animator plays in hashed 2.4 s phrases of `cheer`, `hop` and `strike`,
  facing the mean of the venue's drawn visitors; a lifeguard's heading sweeps
  0.7 rad either side of the water, and one 20 s window in three raises the
  whistle; a cleaner sweeps with a slow `strike`, shuffling 0.6 voxels either
  side; a mechanic kneels (sunk by an adult's legs) and hammers in bursts.
- **A cleaner sweeping a path** is no venue's: `recastStaff` takes a `sweeping`
  callback (the showcase reads `taskOf`: `sweep` and `working`) and draws them
  where the router holds them on the litter's node, with `WORK.sweep`. On the
  way to the tile they walk as the crowd has them; making up a room and
  restocking stay hidden indoors.
- Every act above is drawn only and hashed with `mix`; none is saved. The
  variants declare the same acts except the minigolf's lanes, the playground's
  and the kids club's loops, and the staff spots; where the art declares
  nothing, visitors stand at their places as before.

## Beach buildings

Nothing on sand is paved, so beach showers, cabins and clubs are reached over the
sand.

- `doorsFor` also returns **sand doors**: open beach tiles in front of the
  building.
- `sandRoute.ts` finds a route from each nearby gate to the building across the
  sand, string-pulled to straight lines.
- The flow field leads to the gate; from there the router walks the guest along
  the sand route with `walkSandTo`. Queues form on open sand.
- A rebuild forgets all routes; anyone out on the sand walks back to the paving.
- Known gap: a bar on a raised sand terrace (level 3) isn't reachable.

## Staying on the beach

The beach is one venue (`beach.ts`): fun 0.7, energy 0.5, two to four hours,
effectively unlimited capacity. Its values live in code because sand has no
model. The stay is long because the trip is: crossing the plot takes 2.4
simulated hours, and a short stay left more guests walking to the beach than
lying on it.

- **Each party picks a pitch** from the gate it arrives at (`beachPitch.ts`):
  preferring a lounger per adult, then any lounger, then open sand. Loungers are
  counted across the nine surrounding tiles. Sand is pitched within 12 tiles of
  the gate, loungers within 32 (under `SAND_ROUTE_TILES`), so free loungers fill
  before the sand beside the gate does.
- A stay on a lounger restores `LOUNGER_RELIEF` (energy 0.3) on top of the
  beach's own, and a lounger stands under a parasol, so nobody on one is
  sunburnt (`Router.isSunbathing`).
- The stay is timed from the gate, plus the walk to the spot (`walkingTicks`),
  so a far lounger doesn't shorten it. A party shares one end: the first member
  to settle sets it, because the pitch keeps every member's lounger until the
  last one leaves.
- Adults take the loungers. Others lie (adults) or sit (children) on the sand
  facing the sea.
- A guest on the beach whose strongest need the beach doesn't serve walks to a
  beach building that does (snack bars and ice-cream carts are placed there for
  this), then returns to their spot. Not in the first `SETTLE_TICKS` (45) after
  lying down, or a grubby guest walks from the gate to the shower and only ever
  passes the lounger. A hurt guest ends the stay instead: first aid is on the
  paving.
- Bedtime ends a stay early.
- The resort's crowd doesn't wander the beach aimlessly (`roamsBeach: false`).
  Anyone left there by an edit walks back.
- **The beach is the span of land owned.** `BeachBand.span` is a range of
  columns: the whole plot without land, the owned bounding box's x range on a
  bare game. Roaming points (`nearbyColumn`), the sand grid (columns outside are
  blocked as past the plot's ends are), sand routes, pitches, buoys
  (`swimAreaMoorings`, on the same columns whatever the span) and swimming
  (`swimmableAt`) all keep inside it. It is a range, not a mask: owned land
  reaching the sea twice leaves a stretch of unowned sand between, which guests
  may roam.

**Swimming is drawn only** (`seaSwim.ts`). The router still has a swimmer
resting on their pitch: needs, mishaps and the lifeguard's watch never hear of
it, and nothing is saved. `recast` lists the resting beach guests
(`Router.restingUntil`), and `performAtSea` runs after `perform` every frame.
A swimmer walks straight to the water, wades in over a tile, swims a leg or
two to hashed points within two tiles of their pitch's x, stands in the water 10 to
40 s after each, and comes back the same way. While they are away their lounger
is drawn empty; the seat stays theirs in the crowd.

- **The share**: about a quarter of resting adults and a third of resting
  children are in the water at any moment (`SWIM_SHARE`). The acts clock is cut
  into `SWIM_WINDOW` (240 crowd seconds), and the chance to swim in a window is
  scaled by the trip's length, so short trips from the front row don't drag the
  share down. A trip lasts 40 to 200 crowd seconds, about half an hour to an
  hour of sim time.
- **Where**: inside the buoy line, one tile short of it, off the tile-rounded
  edge where the sand stops being drawn (`swimmableAt`). Nobody swims in the
  pedalo corridor or its flare, where craft come in short of the buoys.
- **Why the stay must have room**: a trip is started only when the stay
  outlasts it (`walkingTicks` of the trip's length, swimming counted at its
  speed). The stay ends in the router, and a swimmer whose stay ends mid-swim
  pops back to wherever the crowd has them. Rain and storm end it the same way.
- **A straight line, or no swim**: the walk is `clearLine` on the sand. Lounger
  columns repeat every two tiles, so most lounger holders have another lounger
  in their way; on seed 3 only about 30% of resting guests have a clear line.
  Routing round obstacles would let the rest swim.

## Night

`night.ts` gives each party a bedtime (19:00 plus up to 2.5 h) and a wake time
(07:00 plus up to 2 h), hashed from the party index. Nothing is stored.

- Sunset is 21:30 (`SUNSET_TIME`), so everyone sets off home before dark.
- Going home uses a flow field per lodging, from its doors. Lodgings aren't
  venues (`lodgingsOn` vs. `venuesOn`).
- Asleep guests are held inside the lodging until morning, then wake with full
  energy and some hygiene back.
- Guests without a reachable bed wander all night.
- Lit windows at night follow the resort-wide share of beds in use
  (`0.5 * asleep / beds`), not per building.

## Weather

`weather.ts` picks one weather per day from a hash of day and seed, so it isn't
stored. Of 24 days, 16 are clear, 4 rain, 2 heatwave, 2 storm.

| Day        | Need weights           | Decay                    | Closes | Overcast |
| ---------- | ---------------------- | ------------------------ | ------ | -------- |
| `clear`    | all 1                  | all 1                    | none   | 0        |
| `rain`     | fun ×1.2, hygiene ×0.8 | all 1                    | `open` | 0.55     |
| `storm`    | fun ×1.2, hygiene ×0.8 | energy ×1.2              | `open` | 0.85     |
| `heatwave` | thirst ×1.6            | thirst ×1.8, energy ×1.3 | none   | 0        |

- Multipliers stay within 0.5..2 (`weather.test.ts`) and apply on top of
  `archetypes.ts`, including in `appeal.ts`.
- `ModelVenue.shelter` is `'open'` or `'covered'` (default). Closed venues aren't
  chosen and turn guests away at the door; guests already inside finish. Cleaners
  skip them too.
- `overcastSky` greys and dims daylight and turns lamps on early, without dimming
  lamplight.
- The rain itself is drawn in `features/weather/`; see
  [rendering.md](rendering.md#weather).
- `advice.ts` warns when most venues for a need are closed.

## Arrivals and departures

- **Bodies are fixed, guests change.** The crowd's instance slots are assigned
  once by model, so the registry has a `present` flag. Check-out empties a slot;
  check-in fills free slots of the right shape. `crowd.offPlot` hides empty ones.
- **Check-out** is once a day: guests past their stay walk to the nearest gate.
  It's checked before bedtime. Guests finish their current visit first. The whole
  party is forgotten at once (`Router.forget`).
- **Gates** are declared on the art (`gateway: true`) and aren't venues. No gate
  means no arrivals or departures.
- **Happiness** (`happiness.ts`) drifts toward the mean of the five needs at 0.15
  an hour, minus 0.3 an hour while queuing. A need at or above `SATISFIED_LEVEL`
  (0.8, where it stops sending an unweighted guest anywhere) counts as fully met.
  `stay` follows the mood with a day's memory (`STAY_MEMORY_HOURS`), and is what a
  review is written from.
- **Rating** (`rating.ts`) is three quarters mean happiness, one quarter share of
  guests with a bed, plus a small cleanliness term. An empty resort rates 3 stars.
- **Arrivals** are sized at 11:00: none at 0 stars, up to a quarter of free beds
  at 5 stars, never more than the free beds. They come in three waves
  (`ARRIVAL_WAVES`): half at 11:00, 30% at 14:00, 20% at 17:00, so one desk is
  not flooded at once. A wave nobody could come in is not carried over.
- **The check-in hour** pays the bills, rates the day, reports it, then lets the
  morning coach in (`rateTheDay`, `closeTheDay`, `runDay`). The report
  (`dayReport.ts`) is labelled with the day its period started on and keeps the
  rating, the guests, the arrivals, check-outs and reviews counted since the last
  check-in, the ledger's `yesterday` and the three loudest thoughts. The last 14
  are kept, oldest first. The morning coach already counts towards the new day.
  The first check-in of a resort built that morning closes nothing anybody
  played, so it only restarts the counts.
- **Open and closed.** A resort gates arrivals only; a closed one still rates its
  guests and sends them home. A plot with no paving starts closed (a building
  site), a generated one open. The Gates button in the top bar switches it.
- **Check-in at reception.** An arriving party appears at the first gate and
  walks to the nearest reachable venue that `receives` (declared on the art:
  `reception.ts`). They queue there like anywhere; a balk sends them back to it
  at the next node, so a full desk makes a crowd around it. The first member out
  of the desk checks the party in. With no desk reachable from the gate nobody is
  admitted, and one reachable from the gate but not from where a guest stands lets
  that guest go on unchecked. The bed is taken at arrival, not at the desk, and
  check-out does not pass it. The reference plot's one desk (capacity 12) sees a
  five-star opening day of 171 arrivals through by 21:00, with a line of 12 at
  worst (`router.test.ts`).
- **Turnover.** A party leaving through the gate (`onLeave`) checks out with
  `checkOutParty(..., true)`: its beds go to `guests.unmade`, not `freeBeds`, and
  an unmade bed is given to nobody (check-in, `arrivalsFor`'s free beds and
  re-housing after an edit all read `freeBeds` only) until a cleaner has made it
  up (`makeBeds`). Departures are sent at 11:00, after the morning wave, so the
  beds freed that morning can only go to the 14:00 and 17:00 waves, and only if
  the cleaners got to them first. A party turned away at the desk had no bed, so
  its check-out keeps the default. A `rehome` carries unmade beds by key, before
  the evicted are re-housed; a demolished lodging's go with it. Invariant per
  home: `freeBeds + unmade + beds taken = beds`.

Overview rows: `Rating`, `Guests`, `Beds`, `Asleep`, `Staff`, `Clean`, `Venues`;
the weather sits in the top bar. The inspector's `Mood` is one guest's happiness.

## Advice

`advice.ts` ranks the resort's problems; the Advice panel lists them all, loudest
first, so its count matches the toolbar badge.

- **It only observes.** Every number comes from something already counted. If a
  rule needs a change in `chooseVenue.ts` or `occupancy.ts`, that's a bug there.
- One function and one test per rule, each taking a `ResortFacts` literal:

| Rule             | Reads                                 | Weight                               |
| ---------------- | ------------------------------------- | ------------------------------------ |
| `closed`         | closed, with at least one bed         | 1                                    |
| `no-entrance`    | open, no gate                         | 1                                    |
| `no-reception`   | open, no desk the gate reaches        | 1                                    |
| `no-beds`        | guests with `NO_HOME`                 | share of guests                      |
| `unserved-need`  | needs no venue serves                 | share wanting it                     |
| `full-lines`     | the day's turn-aways per venue        | share refused × count                |
| `unreachable`    | venues with no door node and no sand  | 0.9                                  |
| `not-step-free`  | venues reached on foot, not step-free | 0.3–0.6 by share of venues, one line |
| `broken`         | each broken venue, ticks down         | 0.3–0.9 over three hours             |
| `hurt`           | guests here with health below 1       | 0.2–0.7 over ten guests              |
| `littered`       | tiles at or above `FOULED_AT`         | worst level × tiles / 20             |
| `far-from-home`  | lodging to nearest venue per need     | distance vs. `reach` (straight line) |
| `unvisited`      | venues nobody visited today           | 0.2–0.4 by capacity                  |
| `weather-closed` | needs whose venues are mostly closed  |                                      |

- The first three are asked even with nobody present, since a new plot never has
  anybody; every other rule stays silent on an empty resort.
- Recomputed once a day after arrivals, after an edit, and on opening or closing.
- `not-step-free`, the step-free overlay and the top bar's step-free line all read
  one sweep pair from the gates (`stepFree.ts`), kept per walk graph. Only venues
  with a door on the paving count. The line, "Step-free: 14 of 17 venues", sits
  under the rating's parts and counts toward no star: a wheelchair guest who
  cannot get somewhere is unhappy, which reaches the rating already.
- Advice about a building includes its tile and a **Show** button that pans the
  camera there. Wording lives in `AdvicePanel.tsx` and only states what was
  measured.
- Not done: heatmap overlays for footfall, coverage and queues.

## Thoughts and reviews

`thoughts.ts` remembers what each guest last thought, and counts a stay's worth
per kind; `reviews.ts` turns a party's stay into one line on check-out.

- **It only listens.** A thought reports something the simulation already
  decided. Nothing in `chooseVenue`, needs, happiness or the rating reads one
  back. The router emits through an optional `onThought` and imports nothing
  from `thoughts.ts`.

| Kind             | Heard where                                                  | Subject     |
| ---------------- | ------------------------------------------------------------ | ----------- |
| `queue-too-long` | `admitAt`, a full line                                       | venue label |
| `closed`         | `admitAt`, a door the weather shut (the beach too)           | venue label |
| `nothing-for`    | `decide`, `chooseVenue` found nothing but a need is pressing | need        |
| `no-bed`         | `homewardStep`, at night with no reachable bed               | none        |
| `filthy`         | end of a visit, venue below 0.4 clean                        | venue label |
| `enjoyed`        | end of a visit to an activity at or above 0.8 clean          | venue label |
| `lovely`         | hourly, surroundings above 0.6                               | none        |
| `littered`       | hourly, surroundings below -0.3                              | none        |
| `no-step-free`   | `decide`, the wheelchair user, where on foot they would go   | venue label |

- The same person, kind and subject within `REPEAT_TICKS` (120, two simulated
  hours) is ignored. That window is per kind, so a homeless guest who also has
  nothing to do still says `no-bed` once, not once per node.
- The day's tally is cleared at check-in, with the router's counters. The Guests
  panel shows its five loudest and is pushed at most once a simulated hour.
- A body's memory is forgotten when a new guest checks into it.
- **The review** is written in `onLeave`, before `checkOutParty` clears the
  party. Stars are `round(5 × mean stay mood)`, at least 1, so a hungry morning at
  check-out does not outweigh the stay. The complaint is
  the one the party thought most (ties to the earlier kind), its subject from
  the spokesperson (first adult) or else the first member who had it; the
  praise is `enjoyed` or `lovely`, whichever came up more. `REVIEWS_KEPT` (12)
  are kept, newest first.
- Wording lives in `hud/components/thoughtWords.ts`; the domain only owns kinds
  and counts.
- `THOUGHT_KINDS` is only ever appended to: a save keeps a slot per person and
  kind, and `widenThoughts` pads an older save's rows on load.
- `no-step-free` is not said of the beach or a venue on the sand, which no
  paving fixes: there the wheelchair user still thinks `nothing-for`.

## Cleanliness and staff

`upkeep.ts` keeps a cleanliness value per venue, 1 spotless to 0 filthy.

- Each visit wears it by `WEAR_PER_VISIT` (0.02) divided by capacity.
- A cleaning spell restores `SCRUB_PER_SPELL` (0.35). One cleaner handles two or
  three busy venues.
- Below `NEEDS_CLEANING` (0.7) a cleaner will come and advice mentions it.
- Nothing recovers on its own. Dirt survives edits (`carryUpkeep`); new buildings
  start clean.
- Dirt lowers a venue's score down to a floor of `DIRT_FLOOR` (0.25), and adds a
  small term to the rating.

**Staff** are a second population: their own registry (`STAFF_SOURCES`, kept out
of `PEOPLE_SOURCES` so guest variants and seeded draws don't shift), crowd field
and router. The figures are in `STAFF_ROLES` order, since a body's variant is its
role's index; `showcase.ts` throws if they are not. A resort meshes a standing
pool once (`staffPool`, `STAFF_CAPS`: 18 cleaners, 8 lifeguards, 8 animators, 6
mechanics, 40 bodies); the roster (`rosterFor`, fed by `workplacesOf`) follows the plot. After
an edit or a hire the roster is recounted (see the staff house below for where
bodies come on and go off). The staff router sends nobody off duty to work, and
somebody let go mid-spell finishes it so the claim is released. They use the same
`crowd.ts` as guests; the crowd was not changed for any of the roles or for the
staff house.

**The staff house** (`staff-house`, a 2 × 2 amenity) is a depot: the art declares
`depot: { doors }` instead of a venue, and `depotsOn` lists depots apart from
venues and gateways, so no guest is ever sent in. A second depot model is art
only. The generator stands one to three per plot (`perResort`); the authored plan
has one where a first-aid post stood.

- **Clocking on**: a body coming on duty enters at a depot's first door node,
  dealt round the depots in turn (`depotForShift`); a zoned worker starts at a
  depot in their zone when there is one. With no depot, at the entrance (node 0
  with no entrance yet; with no paving at all, at the next edit that lays some).
- **Clocking off**: a body let go (`clockOff`, idempotent) drops its tasks, walks
  to the nearest depot, or the entrance with none, and leaves the plot there
  (`onClockedOff`). One taken back on during the walk goes back to work. Cut off
  from the depot, or out on the sand, they leave where they stand, and with
  neither a depot nor an entrance at once.
- **Supplies**: a cleaner carries `SPELLS_PER_LOAD` (4) cleaning spells; scrubbing
  a venue or making up a room takes one, a sweep takes none. Empty and between
  tasks, they walk to the nearest depot, stand inside for `RESTOCK_TICKS` (5-10)
  and come out full. **With no depot, supplies come in at the entrance**, so a
  depot near the work saves cleaning time; with no entrance either, or cut off
  from both, the cart is refilled where they stand. The load is per body, kept
  through an edit and saved; restocking is dropped by an edit like any spell.
- A plot with cleaners on duty and no staff house gets a quiet `no-depot` advice
  line (Staff house).
- Deferred: a hiring cap per depot, breaks and energy, staff happiness, spare
  parts for mechanics, and litter carried back to the depot.

- **Cleaners**: one per six venues plus one per `BEDS_PER_CLEANER` (60) beds,
  at least one wherever anything stands. Rooms before venues before litter: an
  idle cleaner first takes the unclaimed lodging with the most unmade beds (a bed
  that cannot be sold is lost money and turned-away guests), stands in its middle
  for a spell and makes up `BEDS_PER_SPELL` (4) beds; a hotel after a busy
  morning is several spells. With no room waiting, `staffRouter.ts` walks them to
  the dirtiest unclaimed venue and holds them there for a spell; a building with
  no door on the paving (a beach shower, a snack hut on the sand) is reached over
  the sand from a gate, as a mechanic does, and competes on equal terms. With no venue
  below `NEEDS_CLEANING`, a cleaner sweeps litter instead (see [Litter](#litter)).
  Lodgings are not venues and get no cleanliness: `resort.homeOfLodging` maps a
  lodging to its home (homes are sorted by beds, lodgings stand in placement
  order), and the router reads and makes beds through a late-bound `beds` part.
  Waiting beds get an `unmade` advice line (Housekeeping) and a note on the Beds
  row.
- **Animators**: one per three venues the art marks `stage` (kids club,
  playground, beach club, game hall), since a show moves between stages. An
  animator takes the open stage with the most guests inside that has no show on,
  performs for an hour or two (`SHOW_TICKS`), then moves to another stage.
  `cheerTheAudience` tops up the fun of every guest inside a venue with a show on,
  not those in its line, by `SHOW_FUN_PER_HOUR` (0.3), which roughly doubles what a
  visit gives. Show claims are separate from cleaning claims, so a cleaner can
  scrub a stage mid-show. A stage reached only over the sand gets no animator
  yet: only towers, mechanics and cleaners have a sand leg.
- **Lifeguards**: one per venue the art marks `bathing` (swimming pool, waterpark)
  and one per post, a seat the art marks `post: 'lifeguard'` (the tower's). The
  walk graph files a post on the sand in `network.posts`, never in a node's seats
  or `beachSeats`, which are the only lists guests look in, so no guest ever sits
  there. A post inland is dropped. A lifeguard takes the busiest unwatched pool and stays there;
  their spell never runs out. When the rain shuts the pool they wait at its door
  and go back in when it reopens. A lifeguard with no pool left takes an unmanned
  tower: the leg is planned once with `sandRoutesFor`, walked to the route's gate
  on the graph, then one `walkSandTo` per waypoint, each ending in `step(worker,
ON_SAND)`, and finally `holdOnSeat`. The seat is inside the tower's footprint,
  which the sand grid blocks, so the leg ends on open sand beside it. A lifeguard
  stays up the tower through a storm. None of `router.ts`'s errand bookkeeping is
  used.

An unwatched bathing venue, and the beach once a tower stands, gets an
`unwatched` advice line weighted by today's swimmers and a Lifeguard row in the
inspector; the consequence is ten times the mishaps (next section).

**Hiring** is the player's, with the plot's count as the default. The roster is
`rosterOf(hiring, rosterFor(...))`: every role starts on Auto (`AUTO_HIRING`,
`null`), which is exactly `rosterFor`'s recommendation and follows the plot. A
role the player sets by hand in the Staff window (`hire`) keeps that number
through every edit until it is switched back to Auto. Nobody is hired past
`STAFF_CAPS`: hiring changes the roster, never the pool. A hand-set role below
the recommendation gets a `short-staffed` advice line (`shortOf`), ranked above
the dirty, unwatched and broken lines it causes, with a Hire button that tops the
role up to the recommendation and keeps it hand-set. An Auto role is never short.

**Zones** let the player paint where staff work, as RollerCoaster Tycoon's patrol
areas do. A zone is a set of painted tiles on the plan's grid (`zones.ts`, up to
`ZONES` = 4, one colour each), kept per tile so it survives every edit without
being carried, and saved with the resort. The Zones shelf in the build palette
arms a brush per zone and an eraser; `zonePointer.ts` paints along a drag through
`createTileStroke`, as the terrain brush does. While the brush is armed the
overlay field draws the zone of every walk tile and every beach tile in a categorical palette
(`ZONE_COLOURS`, none of them a heat-ramp stop); arming it puts any map away and
disarming brings none back.

- A workplace is **in a zone** if any tile of its footprint, or the tile of any of
  its door nodes, is painted in it (`zonesOf`, a bitmask, so a building on a
  border is in both). A tower is in the zone of the tile under its seat.
- Staff are **dealt, not assigned**: `rezone` in `showcase.ts` deals each role's
  on-duty bodies round-robin over the zones, in zone order, that hold a workplace
  for that role (`dealZones`). What counts is what that role's task choice
  considers: any venue, lodging, paved or beach tile for cleaners, stages for animators, bathing
  venues and towers for lifeguards, venues that can break for mechanics. It runs
  on build, after every edit and every hire (`staffTheResort`), after a load, and
  on every tile a stroke changes.
- A zoned worker only takes tasks inside their zone: every choice in
  `staffRouter.ts` adds the zone to its `eligible` test. With nothing there, they
  wait where they are. A role with no zoned workplace works the whole plot, so
  **no zones painted is exactly the behaviour without zones**. Zones never reach
  the guests.
- Deferred: per-person assignment (the Staff window is per role) and patrolling,
  idle staff walking their zone. A lifeguard already posted keeps the post when a
  paint moves them to another zone, until the next edit rebuilds the router.

**What a worker is doing** is one read, `staffRouter.taskOf(worker, into?)`,
which changes nothing: a kind (`off`, `home`, `idle`, `venue`, `room`, `sweep`,
`restock`, `tower`), the venue, lodging, litter tile, seat or depot it names,
whether they are at it or on the way, the cart load and whether an order sent
them. An empty cart with nothing on hand reads as `restock` on the way. An idle
worker wanders the graph and is asked again at every node.

- **Uniforms**: every staff figure wears a cap, the top voxel of the head, in a
  role colour (cleaner teal, lifeguard red, animator yellow, mechanic slate),
  and no staff shirt is a colour of a guest's `WARDROBE` ramp: the cleaner is in
  stone white, the lifeguard in thatch over red, the animator in lime, the
  mechanic in terracotta. Same geometry as before, so no extra triangles.
- **Pins**: "Staff" in the Map view menu (or `S`, off by default, kept with the
  HUD prefs) pins every member of staff on duty with a DOM button, positioned
  per frame as the problem markers are (`createMarkerSpots` with a capacity of
  the pool, slot = worker). `staffPinOf` (`hud/domain/staffPins.ts`) puts the pin
  over the head of whoever is drawn, and over the roof (`roofOver`) of a covered
  venue, a lodging or a depot for whoever is at work inside one, with a dot that
  says so. The title is worded again only when the task changes. The inspected
  worker keeps their pin with the rest put away (`isPinned`). Off, no pin is
  computed. The Staff window adds, per role and hourly with the status, how many
  are working, walking and idle (`tallyStaff`).
- **Inspecting staff**: a click picks the nearer on screen of a guest and a
  worker (`pickGuestOrWorker`); anybody off the plot is not pickable. A pin
  click selects too. The panel (`StaffView`) names them within their role
  ("Cleaner 7"), their zone or Everywhere, the shift and the wage, with "Show"
  to turn the camera on them; the live line (`staffLine`) says what they are
  doing (`staffWords.ts`), a cleaner's cart and their tile. A change of shift
  words the panel again.
- **Orders**: `order(role, { venue } | { tile })` sends a mechanic to a broken
  venue or a cleaner to a dirty venue or a littered tile; at most eight are open
  and one per role and target. The nearest free worker of the role (in the
  target's zone if anybody there is free) is reserved for it and claims it at
  their next step, before any choice of their own; one already busy finishes
  first, and somebody already on their way there serves it. A building with no door
  on the paving, or a littered beach tile, is reached over the sand, as a
  mechanic does, whoever is sent. An order ends when
  its worker finishes there, or when it no longer applies (mended, back above
  `NEEDS_CLEANING`, nothing left to sweep), which also lets a worker still walking there go. An edit
  carries orders across by key; they are saved as an optional `orders` field
  (`SAVE_VERSION` unchanged). With none open nothing runs, so a resort nobody
  orders about behaves exactly as before. The inspector of a broken or dirty
  venue has "Send a mechanic" or "Send a cleaner", disabled with the reason when
  nobody of the role is on duty or one is on the way; a litter marker has "Send
  a cleaner" on hover; an ordered target's marker carries a green pennant, and
  the worker's pin and panel say "Sent to ...".

## Breakdowns and injuries

**Breakdowns.** The art declares `venue.reliability`, visits between breakdowns
on average (waterpark 60, pedalo rental 40, swimming pool 120, game hall 80); a
venue without it never breaks. `breakdowns.ts` keeps `broken`, `since` and
`worn` per venue in `upkeep.ts`'s shape, carried across edits by key
(`carryBreakdowns`) and saved. The router calls `wear` beside `soil` on both ways
out of a visit; one chance in `reliability` per visit, drawn by `mix` over the
venue's salt and its visit count, so no seeded stream moves.

- **One closed predicate.** The router's `isOpen` is the weather's `isOpenIn`
  _and_ not broken, and it is what `chooseVenue` and the door both read, so a
  broken venue is skipped and a guest already walking there is turned away (they
  think `broken`, not `closed`). Cleaners and animators skip a broken venue; a
  lifeguard at a broken pool stays. The advice's `weather-closed` still reads
  the weather alone: the rain is not to blame for a breakdown.
- **Mechanics**: one per five venues that declare `reliability`
  (`RELIABLE_PER_MECHANIC`). A mechanic takes the longest-broken unclaimed venue
  (`brokenFirst`, whose `eligible` stays a parameter for zones), walks there,
  holds for `REPAIR_TICKS` (30–60) and `repair`s it. The weather is no bar. A
  building with no door on the paving (the pedalo rental) is reached over the
  sand with the tower's leg machinery, and the mechanic is released to the gate
  afterwards. With nothing broken a mechanic stands where they are.

**Health** is a need but not a want. `GuestNeed` includes `'health'`,
`GUEST_NEEDS` does not: the column starts at 1, is never drawn (so the five
seeded draws are unchanged), never decays, and `resetNeeds` sets it back to 1.
`strongestNeed` looks at it after the five with weight 3 for every archetype,
which beats any want at its worst, so a hurt guest heads for first aid through
the ordinary `appealOf`; the `first-aid` model relieves `health` by 1.
`contentmentOf` stays over the five wants and is scaled by
`HURT_FLOOR + (1 - HURT_FLOOR) * health` (`HURT_FLOOR` 0.5); at health 1 it is
unscaled.

**Incidents** (`incidents.ts`) set health to `HURT_LEVEL` (0.35), never raising
it, and are drawn by hash:

- **Sunburn**: once a simulated hour on a heatwave day, every guest resting on
  the open sand (not a lounger) has `SUNBURN_PER_HOUR` (0.04) of a burn (`burnTheSunbathers`).
- **Mishaps**: on every visit to a `bathing` venue, the beach included,
  `MISHAP_UNWATCHED` (0.02), or `MISHAP_WATCHED` (0.002) while a lifeguard is on
  watch there (a tower for the beach). That tenfold is what a lifeguard buys.

The guest thinks `hurt` (`I got hurt at …` / `I got sunburnt`). The advice adds
`broken` (each broken venue, louder the longer it is down) and `hurt` (how many
are hurt now). `hurt` says nothing about first aid: with no first-aid post,
`unserved-need` already says "Nothing on the plot serves first aid". The
inspector shows a Repairs row on a broken venue and a health bar only on a guest
who is hurt.

Three days on the reference plot (seed 3, 600 guests, day two a heatwave;
`router.test.ts`): 0, 3 and 6 breakdowns (the first day's crowd goes to the
beach), all mended within 55–188 minutes; 1, 8 and 1 guests hurt; 7 of the
heatwave's 118 sunbathers burnt; half of those hurt in the heatwave treated that
day.

## Litter

Two declarations on the art, nothing in `src/`:

- `venue.litter`, 0 to 1: the chance a visit sends the guest off holding
  something to throw away. Ice cream 0.06, snack bar 0.05, bakery 0.035, coffee
  shop and supermarket 0.03, poolside bar 0.02, resort bar 0.015; the restaurant
  and everything else 0.
- `binReach` on a model makes it a bin: the tiles it covers around its footprint
  (Chebyshev, as scenery). The litter bin has 3. `binReachOf` reads it.

`litter.ts` keeps a per-tile level, row-major and sized to the plan like the
scenery field, and a per-guest count of nodes left to carry (`Carrying`).

- The router calls `onVisited(person, venue)` once per visit that ran its course,
  on both ways out (the ordinary one and an errand off a beach pitch), never for
  a beach visit that found no room. `showcase.ts` answers with `pickUp`, drawing
  from a hash of the person and the tick, not the router's seeded stream, so no
  seeded scene moves.
- The guest crowd's `routeOf` is wrapped, so every node a guest reaches is seen
  without the crowd or the router knowing about litter. On a tile a bin covers
  the guest bins it; otherwise the count goes down, and at `CARRY_NODES` (6)
  without a bin they drop a `PIECE` (0.25) on that tile, clamped at 1.
- **The beach gets litter two ways.** A wrapper in hand also counts down at the
  end of every sand leg (the crowd calls `routeOf(person, ON_SAND)` with the body
  on the waypoint) and falls on that beach tile. And when a beach stay ends, the
  guest leaves a piece at their pitch with chance `BEACH_LITTER` (0.15), a `mix`
  hash with its own multiplier (`leaveOnTheBeach`), unless a bin covers the tile
  (`dropAt`). A bin on or near the sand catches both. Beach roamers drop
  nothing: the crowd has no per-leg hook for them.
- A newly admitted guest starts empty-handed. After an edit the bin cover is
  rebuilt and litter is cleared from every tile that is neither paved nor open
  sand (`pruneLitter`); sand under a building just placed is cleared too, as no
  cleaner could stand there. The rest survives.
- Litter subtracts from the surroundings term scenery adds to: a guest's
  surroundings are scenery minus `LITTER_WEIGHT` (1) times the litter under them,
  clamped to -1..1. A fouled tile costs more than the prettiest tile gives. A
  guest on the sand minds the litter of the tile under them; scenery there stays
  0, so an unlittered beach reads as before.
- Cleaners take venues first. With none to clean, `mostLittered` picks the worst
  unclaimed paved or beach tile with any litter on it, down to a single `PIECE`;
  the cleaner walks to a paved one on a flow field from the tile's node
  (memoised, at most 64, cleared on a rebuild). A beach tile is reached as a
  beach building is: `sandRoutesFor` from the tile's centre (or open sand beside
  it, `feetOf`), memoised per tile like the node fields, walked from the gate.
  They sweep for 4 to 8 ticks and zero it; on the sand they are then released to
  the gate. `atWork` answers null while sweeping.
- On every node a cleaner on duty reaches, litter on an unclaimed tile is swept
  in passing, without stopping. A claimed tile is left to the cleaner walking to
  it.
- An order pulls a cleaner off a walk to litter they chose themselves; a venue
  or a room they are on the way to is seen through first.
- Advice `littered` counts the tiles at or above `FOULED_AT` and names the
  worst: "Litter is piling up on n tiles", "no bin within reach".

On the reference plot (4 bins, reaching 4 of the 35 venues that make litter) a
first day with no cleaners drops 113 pieces, bins 13 and fouls 23 tiles; the
test holds it between 5 and 40.

Litter is drawn as small voxel models from `voxel-gen/litter/` (a cup and a
wrapper), up to four per tile at hashed spots inside it, by `litterField.ts` on
the balloons' moving-field path: 512 slots, two draw calls, rewritten only when
the litter changes.

## Scenery

Dressing declares `scenery` on its `VoxelModelSource`, 0 to 1 (fountain 1, statue
0.8, flowerbeds and blossom 0.5, trees 0.4, hedge 0.3); anything undeclared is 0.
`sceneryOf` reads it, and there is no table of values in `src/`.

`scenery.ts` turns what stands on the plot (placements and props) into a per-tile
field, row-major and sized to the plan. An item gives
`strength * (1 - d / (SCENERY_REACH + 1))` to every tile within `SCENERY_REACH`
(4) of its footprint, `d` the Chebyshev distance (0 under it). A tile's sum is
saturated to `sum / (sum + SATURATION)`, `SATURATION` 2, so a row of hedges never
reads as a fountain and nothing reaches 1. On the reference plot the paved tiles
average 0.29 and 12% of them are below 0.1. The field is built with the resort
and rebuilt after every edit, never per frame.

A guest's happiness target is their contentment plus `SURROUNDINGS_SHARE` (0.1)
times the scenery of the tile their walk node stands on (0 off the graph, on the
sand). `ageHappiness` only knows it as signed surroundings, so litter can
subtract from the same term. Scenery never changes where anybody walks: choosing
a venue, appeal and routing do not read it.

The inspector shows a place's **Surroundings**, `sceneryOver`: the mean over its
footprint and the ring around it.

## Overlays

The **Overlay** picker in the top bar tints each paved tile by one question
(`overlays/domain/overlays.ts`). Every layer is a value from 0 to 1 per walk node,
or `NaN` for no data (drawn as nothing), and **the high end is always the bad
one**, so one ramp (`ramp.ts`: teal, yellow, magenta-red) and one legend serve
them all.

| Layer     | Asks                          | Value                                                                          |
| --------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Footfall  | where guests walk             | sightings over the busiest node's; `NaN` where nobody walked                   |
| Mood      | where guests are unhappy      | 1 minus the mean mood seen there; `NaN` below `MIN_SEEN` (5) sightings         |
| Food      | how far to something to eat   | hops to the nearest door of a venue easing hunger, over `TOO_FAR_HOPS`, capped |
| Drink     | how far to something to drink | the same for thirst                                                            |
| Wash      | how far to somewhere to wash  | the same for hygiene                                                           |
| Step-free | where a wheelchair can go     | 0 reached from the gates step-free, 1 only by stairs, `NaN` unreached          |
| Scenery   | where the walk is plain       | 1 minus the scenery field under the node                                       |
| Litter    | where litter lies             | the litter level under the node, and on every beach tile                       |

`TOO_FAR_HOPS` is the family reach in tiles (20), where the advice starts saying
far-from-home; a node no door reaches is 1. The reach layers are one multi-source
sweep (`reach.ts`) from every serving door, about 0.2 ms on the reference plot,
kept per walk graph until the next edit. A building on the sand has no door on the
graph, so it is seeded as the router reaches it: at the gate of each of its sand
routes, already that route's length in tiles away.

Footfall is the one running sample: once a frame, every present guest adds 1 and
their mood to the node they are at. It is halved every morning, so the map shows
the last few days, and replaced empty on an edit, which renumbers nodes.

A layer is worked out when it is switched on, once a simulated hour while it is
on, and after an edit's rebuild; never per frame. The simulation never reads an
overlay, and a benchmark refuses to switch one on.

## Money

Everything has a price, and one simulation runs in both game modes. Sandbox and
tycoon differ in exactly one predicate, `canAfford` in `ledger.ts`, which is
always true in sandbox and compares against the balance in tycoon. It is the only
function that reads the mode. **The ledger records in both modes**: sandbox means
nobody is ever short of money, not that the books are blank, so a sandbox resort
still pays wages and maintenance and the Books window shows what it earns and
costs. Do not "fix" wages to 0 in sandbox.

**No guest behaves differently because of a price.** Choosing a venue, appeal,
routing, needs, thoughts, reviews and the advice never read one; a price is
something the resort takes, not something a guest weighs.

The art declares two numbers, both optional:

- `cost` on `VoxelModelSource`, what standing it costs. Undeclared, `prices.ts`
  derives it from the model's size: voxels / 25, rounded to tens, at least 10. A
  path tile is 20, a bungalow 680, a house 1 870. Declared only where the rule
  is plainly wrong: `hotel` 12 000 (its facade detail would ask 22 430),
  `swimming-pool` 5 000 and the draft `waterpark` 8 000 (mostly water, which the
  rule reads as cheap) and `reception` 600 (every tycoon resort must buy one, and
  it sells nothing).
- `price` on the venue, what one visit takes, or one guest-night at a lodging.
  Every lodging, food and drink venue declares one, and the paid activities (spa,
  minigolf, pedalos, game hall, beach club). Services and free activities declare
  none, which is 0. The beach's synthetic venue is not in the catalogue and earns 0.

Money moves in eight ways, each a `Reason` with its own column in the books:

| Reason      | When                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| build       | the player stands something; a neighbour the paving re-lays is free           |
| demolish    | the bulldozer gives half back, or all of it for a site still going up         |
| dig         | the spade, `DIG_COST` (20) per tile changed                                   |
| land        | the land tool, `LAND_PARCEL_COST` (1 500) a parcel; nothing in Free play      |
| visit       | `onVisited`, the venue's price                                                |
| night       | at check-in (`admitWave`), the whole stay: nights times the lodging's rate    |
| wages       | each check-in hour, `wagesFor(roster)`: the cleaners on duty, never the pool  |
| maintenance | each check-in hour, 1% of the build cost of every placement and prop standing |

A stay is billed at the bed, not the desk, so a guest who never reaches reception
has still paid. A lodging's nightly rate is its price plus up to
`SETTING_PREMIUM` (a quarter) for its surroundings (`nightPriceOf`, the
inspector's Surroundings); that is a price, never a reason a party lodges
anywhere. Paving and rails are not maintained, and rails, which the handrails lay
on their own, cost nothing to stand. A day in the books runs from one check-in
hour to the next: the bills are paid and the day closed just before the morning
coach, so that coach's stays are the new day's. A resort that is **Closed** still
pays its staff and its upkeep and earns no nights, which is real pressure and
needs no code. Balances are integers, and a balance below zero only stops
building.

**Tycoon starts only from bare ground.** The New game panel offers no choice of
ground for it (`groundOf` in `welcome/domain/newGame.ts`): it starts on a
256-tile world of parcels like Free play's bare land (see [Land](#land)) and
opens the books with `OPENING_BALANCE.tycoon`
(8 000, about twice a minimal start: a gate, the desk, thirty paths, three
bungalows and a snack bar, 3 960). A generated resort is always sandbox: it is
given, not bought, and refunding it would pay the player for nothing. The mode is
chosen when a resort is created, lives on its ledger and never changes; every new
resort opens new books and restarts the clock at day 0. Free play is the players'
name for sandbox; the code keeps `sandbox`.

On the reference plot (seed 3, density 0.7) what stands costs 341 870, of which
paving is 47 700 (14%). Its wages are 1 200 a day and its maintenance 2 942,
against 12 000 to 16 500 a day in visits and, once the opening guests have been
replaced by billed ones, about 11 000 in stays.

The HUD hears about money after a click that moved it (once a frame at most), at
the check-in hour, once a simulated hour for the visits in between, and when a new
resort is built; never per visit. The top bar shows **Money** in tycoon only, and
**Books** in both modes. A palette tile shows its cost and is dimmed, not
disabled, when the bank cannot pay for it. The inspector shows a venue's
**Takings today**.

## Land

A bare game (tycoon, or Free play on bare land) is a fixed world of
`BARE_WORLD_TILES` (256) square, cut into parcels of 16 tiles
(`land/domain/landRights.ts`). The New game panel asks no width or depth for it;
a generated resort still does, and owns its whole plot. `ResortPlan.land` and
`SavedWorld.land` are optional, and no land means everything is owned, so the
authored plan, generated resorts and saves from before land behave as they did.

- **The starting block** (`startingLand`) is four parcels wide, centred on the
  south edge, and runs from the parcel row holding the water's edge less the
  beach less 32 tiles down to the last row, so it owns its sea for piers: 4 × 5
  on a 256 world, deeper when the island deepens the bay.
- **For sale** is any parcel beside (not diagonal to) owned land, so owned land
  stays one piece. One flat price, `LAND_PARCEL_COST` (1 500), recorded under
  **Land** in the books; Free play claims parcels for nothing.
- **Building only on land owned**: placing, paving, digging and zoning refuse
  unowned tiles ("Not your land"). An entrance must have a long side on the edge
  of owned land or the world when placed ("Entrance away from the edge"), as in
  RollerCoaster Tycoon; buying the land in front of it later is allowed.
- **A purchase applies at once** to the money, the mask and the right to build.
  The lighting, the terrain mesh and framing, the beach span, the buoys and the
  guest capacity follow at a **settle**, two seconds after the last purchase or
  as soon as the land tool is put away. A settle prepares the world on the worker
  first, then takes the game (`gameNow`, which leaves construction sites open
  rather than finishing them) and restores it onto the rebuilt resort with
  `load`'s own sequence (`restoreGame`), keeping the clock's speed, the camera
  and the open sites. An edit made while the worker prepares throws the settle
  away and schedules another. New guests are dealt by `widenGame`: every per-guest
  column of the game is copied over the front of a freshly built resort's, whose
  guests all start away, so the newcomers are free bodies for the next check-in.
- **Prep cost** (worker, empty world): about 0.4 s on the starting block, 1.4 s
  with all 256 parcels owned (cell 7 instead of 5, 3 277 guests). The main-thread
  part is logged to the console on each settle.
- The litter scans (`mostLittered`, `litterSummary`, `piecesFor`) look only inside
  the owned bounding box: litter lands only where guests go.

## Saving

A save is the whole simulation, not the world and the money: every guest keeps
their place, needs, visit, queue place, pitch, errand and sleep, and every member
of staff their post, so a loaded game carries on as the saved one would have.
`Showcase.snapshot()` assembles it from one snapshot per module (`snapshotGuests`,
`router.snapshot()`, `snapshotCrowd`, ...) and `load()` restores them in a
straight line onto a resort rebuilt from the saved placements, in their saved
order, which renumbers nodes, seats and venues exactly as before. Saves live in
IndexedDB and are parsed with zod on the way back (`saves/domain/snapshot.ts`).

**Every piece of new simulation state must be added to its module's snapshot and
schema, or `SAVE_VERSION` bumped.** There are no migrations: a save of another
version is listed as unreadable. Unmade beds are saved with the guests beside
`freeBeds` (per home, like it), and a cleaner making up a room as `roomOf` in the
staff router's snapshot. The hiring is saved with the resort; a load
recomputes the roster and the duty from it without a shift change, since the
staff crowd comes back from the save as it was. The day's counts and the 14-day
report history are saved with the resort. The twin-run tests (`crowd.test.ts`,
`router.test.ts`) restore a snapshot into a second resort and run both side by
side, so they catch a missed field, but only if their scenario exercises it.
Reordering `THOUGHT_KINDS`, `GUEST_NEEDS`, `STAFF_ROLES` or the crowd's sentinels
changes what a saved number means, and needs a version bump too.

## Where the art lives

- People: `voxel-gen/people/`, a registry separate from `MODEL_SOURCES`.
  `figure.ts` has the shared builder, `hipHeight`, `shoulderHeight` and
  `handHeight`. Every person passes `sleeves` to `figure()`, the upper arm, a
  shade darker than the shirt (the forearm is skin), and `scale: FIGURE_SCALE`
  on its source. Preview with `pnpm preview --people`.
- Staff: `voxel-gen/people/{cleaner,lifeguard,animator,mechanic}.ts`, via
  `STAFF_SOURCES`, in `STAFF_ROLES` order.
- Boats and buoys: `voxel-gen/sea/`. Balloons: `voxel-gen/sky/`. Litter:
  `voxel-gen/litter/`, preview with `pnpm preview --litter`. Balls:
  `voxel-gen/props/` (`PROP_SOURCES`), preview with `pnpm preview --props`.
- `PAINTED_MODELS` in `objectTypes.ts` joins catalogue, people, staff, sky, sea,
  litter and props. `dveEngine.test.ts` meshes all of it.
- People paint from the palette; `skin` is the only family they add.
- How pleasant dressing is: `scenery` on the model's own source.
- How much litter a visit leaves, and what is a bin: `venue.litter` and
  `binReach`.
- How often a venue breaks: `venue.reliability`. What first aid treats: its
  `satisfies`, `health`.
- What it costs to stand and what a visit or a night takes: `cost` on the
  source (optional, derived from its size otherwise) and `venue.price`.
- Where visitors are drawn: `venue.spots` and seats; `watches` for spectators.
- A game: `game` and `side` on each player's spot (side 0 the low-x half),
  `venue.court` (the outer lines, the net's column and top, the hoops' middles,
  read from the model's own constants) and `venue.ball` (the prop and the layer
  it is struck at). A court's length runs along x.
