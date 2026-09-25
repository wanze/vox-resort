# Crowd and simulation

Guests, staff, boats and balloons, and the simulation that drives them.

|          |                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------ |
| People   | 0.25 per paved tile, max 10 000 (`crowdSize.ts`), `?people=n` overrides. Three adult models, one child |
| Poses    | walk, sit, lie                                                                                         |
| Boats    | 12 (`CRAFT_COUNT`), plus buoys and rental boats                                                        |
| Balloons | 36 (`BALLOON_COUNT`)                                                                                   |

## Code

| What                            | Where                                                               |
| ------------------------------- | ------------------------------------------------------------------- |
| Walk network                    | `crowd/domain/walkNetwork.ts`                                       |
| Crowd state and step            | `crowd/domain/crowd.ts`                                             |
| Avoidance                       | `crowd/domain/avoidance.ts`                                         |
| Crowd speed per clock speed     | `sim/domain/crowdRate.ts`                                           |
| Obstacles on the sand           | `crowd/domain/sandGrid.ts`                                          |
| Seats in world space            | `crowd/domain/seating.ts`                                           |
| Re-placing people after an edit | `crowd/domain/nearestNode.ts`, `reseatCrowd`                        |
| Venue doors                     | `sim/domain/doors.ts`                                               |
| Flow fields                     | `sim/domain/flowField.ts`                                           |
| Choosing a venue                | `sim/domain/chooseVenue.ts`, `appeal.ts`                            |
| Routing and arriving            | `sim/domain/router.ts`                                              |
| Queues and visits               | `sim/domain/occupancy.ts`                                           |
| Beach                           | `sim/domain/beach.ts`, `beachPitch.ts`, `sandRoute.ts`              |
| Needs, happiness, rating        | `sim/domain/needs.ts`, `happiness.ts`, `rating.ts`                  |
| Night, weather, check-in        | `sim/domain/night.ts`, `weather.ts`, `checkIn.ts`                   |
| Cleanliness and staff           | `sim/domain/upkeep.ts`, `staffRouter.ts`                            |
| Advice                          | `sim/domain/advice.ts`, `hud/components/AdvicePanel.tsx`            |
| Guests, parties, beds, names    | `guests/domain/`                                                    |
| Inspector                       | `inspect/`, `hud/components/InspectPanel.tsx`                       |
| Drawing the crowd               | `crowd/adapters/crowdField.ts`, `rendering/adapters/figureField.ts` |
| Boats and passengers            | `sea/domain/piers.ts`, `passengers.ts`                              |

## Walk network

Built from the layout, and rebuilt after every hand edit.

- **Nodes**: one per paved tile. Stairs and bridge ramps get two (foot and head).
- **Edges**: between neighbouring paved tiles at most one level apart; a
  one-level difference only via stairs.
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

Children use the `child` model. Beds come from the art (`bedsOf`); the biggest
parties get the biggest lodgings first. A party without room gets `NO_HOME`.

Homes follow the plot. After an edit, `rehome` rebuilds the free beds from the
lodgings standing and remaps each guest's home **by key**, so an edit that leaves
the lodgings alone leaves everybody where they sleep. A party whose lodging was
demolished is re-housed whole (`homeWithRoom`, parties in index order), or left
`NO_HOME` if nothing fits; the advice's `no-beds` then says so.

A plot with no paving is dealt its guests by area instead (`crowdSizeForArea`:
the 20% of tiles a generated plot paves, at the usual 0.25 a tile) and starts
`away`: nobody present, every bed free. The draws are the same as a full start.

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
- The CPU writes position and yaw. Walk, sit and lie are done in the vertex
  shader from one per-vertex `figure` vec4 and one per-instance `pose` vec4.
  These are packed because WebGPU allows only eight vertex buffers;
  `crowdField.test.ts` counts them.
- People use the lit material (so lamps light them) and get no blob shadow.
- Passengers are a separate figure field posed in the boat's frame.

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

Needs run on ticks. The crowd runs on frame time scaled by speed. Balloons, sea
and construction run at real time.

## Needs and choosing a venue

`needs.ts` holds five levels per guest (hunger, thirst, energy, fun, hygiene),
from 1 (content) to 0 (desperate). `decayNeeds` lowers them each tick at rates
from `archetypes.ts`: families get hungry fastest and won't walk far, friends get
bored fastest and walk anywhere.

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
  (`flowFieldFor`). Built on demand and dropped on every edit. The HUD's `Routes`
  row counts them.
- The crowd knows nothing about venues: `createCrowd` takes an optional
  `routeOf(person, at)` and falls back to wandering.
- **Parties move together.** Whoever decides sets the goal for the whole party.

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

The beach is one venue (`beach.ts`): fun 0.7, energy 0.3, 45 to 120 minutes,
effectively unlimited capacity. Its values live in code because sand has no
model.

- **Each party picks a pitch** from the gate it arrives at (`beachPitch.ts`):
  preferring a lounger per adult, then any lounger, then open sand. Loungers are
  counted across the nine surrounding tiles.
- Adults take the loungers. Others lie (adults) or sit (children) on the sand
  facing the sea.
- A guest on the beach whose strongest need the beach doesn't serve walks to a
  beach building that does (snack bars and ice-cream carts are placed there for
  this), then returns to their spot.
- Bedtime ends a stay early.
- The resort's crowd doesn't wander the beach aimlessly (`roamsBeach: false`).
  Anyone left there by an edit walks back.

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
  an hour, minus 0.3 an hour while queuing.
- **Rating** (`rating.ts`) is three quarters mean happiness, one quarter share of
  guests with a bed, plus a small cleanliness term. An empty resort rates 3 stars.
- **Arrivals** are sized at 11:00: none at 0 stars, up to a quarter of free beds
  at 5 stars, never more than the free beds. They come in three waves
  (`ARRIVAL_WAVES`): half at 11:00, 30% at 14:00, 20% at 17:00, so one desk is
  not flooded at once. A wave nobody could come in is not carried over.
- **Open and closed.** A resort gates arrivals only; a closed one still rates its
  guests and sends them home. A plot with no paving starts closed (a building
  site), a generated one open. The Resort panel switches it.
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

HUD rows: `Guests` (present / capacity), `Rating`, `Asleep`, `Venues`,
`Weather`. The inspector's `Mood` is one guest's happiness.

## Advice

`advice.ts` ranks the resort's problems; the Advice panel shows the top four.

- **It only observes.** Every number comes from something already counted. If a
  rule needs a change in `chooseVenue.ts` or `occupancy.ts`, that's a bug there.
- One function and one test per rule, each taking a `ResortFacts` literal:

| Rule             | Reads                                | Weight                               |
| ---------------- | ------------------------------------ | ------------------------------------ |
| `closed`         | closed, with at least one bed        | 1                                    |
| `no-entrance`    | open, no gate                        | 1                                    |
| `no-reception`   | open, no desk the gate reaches       | 1                                    |
| `no-beds`        | guests with `NO_HOME`                | share of guests                      |
| `unserved-need`  | needs no venue serves                | share wanting it                     |
| `full-lines`     | the day's turn-aways per venue       | share refused × count                |
| `unreachable`    | venues with no door node and no sand | 0.9                                  |
| `littered`       | tiles at or above `SWEEP_ABOVE`      | worst level × tiles / 20             |
| `far-from-home`  | lodging to nearest venue per need    | distance vs. `reach` (straight line) |
| `unvisited`      | venues nobody visited today          | 0.2–0.4 by capacity                  |
| `weather-closed` | needs whose venues are mostly closed |                                      |

- The first three are asked even with nobody present, since a new plot never has
  anybody; every other rule stays silent on an empty resort.
- Recomputed once a day after arrivals, after an edit, and on opening or closing.
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

- The same person, kind and subject within `REPEAT_TICKS` (120, two simulated
  hours) is ignored. That window is per kind, so a homeless guest who also has
  nothing to do still says `no-bed` once, not once per node.
- The day's tally is cleared at check-in, with the router's counters. The Guests
  panel shows its five loudest and is pushed at most once a simulated hour.
- A body's memory is forgotten when a new guest checks into it.
- **The review** is written in `onLeave`, before `checkOutParty` clears the
  party. Stars are `round(5 × mean happiness)`, at least 1. The complaint is
  the one the party thought most (ties to the earlier kind), its subject from
  the spokesperson (first adult) or else the first member who had it; the
  praise is `enjoyed` or `lovely`, whichever came up more. `REVIEWS_KEPT` (12)
  are kept, newest first.
- Wording lives in `hud/components/thoughtWords.ts`; the domain only owns kinds
  and counts.

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
and router. A resort meshes a standing pool (`staffPool`, `STAFF_CAPS`: 40
cleaners) once; the roster (`rosterFor`) follows the plot, one cleaner per six
venues, at least one wherever anything stands. After an edit the roster is
recounted: a body going off duty is taken off the plot where it stands, one coming
on duty enters at the first gate (node 0 with no gate yet; with no paving at all,
at the next edit that lays some). The staff router never sends anybody off duty,
and a cleaner let go mid-spell finishes it so the venue's claim is released.
`staffRouter.ts` walks each cleaner to the dirtiest unclaimed venue and holds them
there while they work. They use the same `crowd.ts` as guests. With no venue below
`NEEDS_CLEANING`, a cleaner sweeps litter instead (see [Litter](#litter)).

Not done: lifeguards (need the sand routing shared from `router.ts`), animators
(need venue events).

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
- The sand is off the graph, so nobody drops litter on it and no cleaner is ever
  sent there. That is deliberate: it would foul for ever with nobody allowed to
  sweep it.
- A newly admitted guest starts empty-handed. After an edit the bin cover is
  rebuilt and litter on a tile that is no longer paved is cleared
  (`pruneLitter`); the rest survives.
- Litter subtracts from the surroundings term scenery adds to: a guest's
  surroundings are scenery minus `LITTER_WEIGHT` (1) times the litter under them,
  clamped to -1..1. A fouled tile costs more than the prettiest tile gives.
- Cleaners take venues first. With none to clean, `mostLittered` picks the worst
  unclaimed paved tile at or above `SWEEP_ABOVE` (0.5, two pieces); the cleaner
  walks there on a flow field from the tile's node (memoised, at most 64, cleared
  on a rebuild), sweeps for 4 to 8 ticks and zeroes it. `atWork` answers null
  while sweeping.
- Advice `littered` counts the tiles at or above `SWEEP_ABOVE` and names the
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

## Where the art lives

- People: `voxel-gen/people/`, a registry separate from `MODEL_SOURCES`.
  `figure.ts` has the shared builder and `hipHeight`. Preview with
  `pnpm preview --people`.
- Staff: `voxel-gen/people/cleaner.ts`, via `STAFF_SOURCES`.
- Boats and buoys: `voxel-gen/sea/`. Balloons: `voxel-gen/sky/`. Litter:
  `voxel-gen/litter/`, preview with `pnpm preview --litter`.
- `PAINTED_MODELS` in `objectTypes.ts` joins catalogue, people, staff, sky, sea
  and litter. `dveEngine.test.ts` meshes all of it.
- People paint from the palette; `skin` is the only family they add.
- How pleasant dressing is: `scenery` on the model's own source.
- How much litter a visit leaves, and what is a bin: `venue.litter` and
  `binReach`.
