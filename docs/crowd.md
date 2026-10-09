# Crowd and simulation

Guests, staff, boats and balloons, and the simulation behind them.

|          |                                                                                              |
| -------- | -------------------------------------------------------------------------------------------- |
| People   | 0.25 per paved tile, max 10,000 (`crowdSize.ts`), `?people=n` overrides                      |
| Poses    | walk, stand, sit, lie, photo; drawn only: swim, wade, hop, cheer, jog, strike, reach, selfie |
| Boats    | 12 (`CRAFT_COUNT`), plus buoys and rental boats                                              |
| Balloons | 36 (`BALLOON_COUNT`)                                                                         |

## Code

| What                        | Where                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Walk network, crowd, step   | `crowd/domain/walkNetwork.ts`, `crowd.ts`, `avoidance.ts`                              |
| Sand obstacles, seats       | `crowd/domain/sandGrid.ts`, `seating.ts`                                               |
| Doors, flow fields, routing | `sim/domain/doors.ts`, `flowField.ts`, `venueRoutes.ts`, `router.ts`, `routerState.ts` |
| Choosing a venue            | `sim/domain/chooseVenue.ts`, `appeal.ts`                                               |
| Queues and visits           | `sim/domain/occupancy.ts`                                                              |
| Beach                       | `sim/domain/beach.ts`, `beachPitch.ts`, `sandRoute.ts`                                 |
| Needs, happiness, rating    | `sim/domain/needs.ts`, `happiness.ts`, `rating.ts`                                     |
| Night, weather, check-in    | `sim/domain/night.ts`, `weather.ts`, `checkIn.ts`                                      |
| Cleanliness and staff       | `sim/domain/upkeep.ts`, `staffRouter.ts`, `staffRouterState.ts`                        |
| Advice                      | `sim/domain/advice.ts`, `hud/components/AdvicePanel.tsx`                               |
| Money                       | `catalog/domain/prices.ts`, `sim/domain/ledger.ts`, `takings.ts`                       |
| Guests, parties, beds       | `guests/domain/`                                                                       |
| Events                      | `events/`                                                                              |
| Inspector                   | `inspect/`, `hud/components/InspectPanel.tsx`                                          |
| Following a guest, rides    | `guest-view/`, `app/guestView.ts`                                                      |
| Drawing                     | `crowd/adapters/crowdField.ts`, `rendering/adapters/figureField.ts`                    |
| Places and acts in a venue  | `choreography/domain/`                                                                 |
| Swimming, boats             | `choreography/domain/seaSwim.ts`, `sea/domain/`                                        |
| Game step, headless runs    | `resort-sim/domain/stepSim.ts`, `headless.ts`                                          |
| Views and photos            | `sim/domain/views.ts`, `outlook.ts`, `photos.ts`, `resort-sim/domain/photoSteps.ts`    |

## Principles

- **Seeded streams must not move.** All randomness uses `createRandom`. Anything
  added later (wheelchairs, litter, breakdowns, acts, events) draws from a `mix`
  hash instead, so existing seeded scenes and bench runs replay unchanged.
- **Visual only means visual only.** The cast, acts, games, swimming and boats
  for hire are drawn on top of the sim. Nothing in the sim reads them and none
  of it is saved.
- **Observers don't steer.** Advice, thoughts, reviews and overlays only report
  what the sim already decided. If a rule needs a change in `chooseVenue` or
  `occupancy`, that's a bug there.
- **Features off means unchanged.** No zones, no orders, no events booked and no
  wheelchair users each behave exactly as before the feature existed.

## Walk network

Built from the layout, rebuilt a quarter second after the last hand edit
(`REANCHOR_DELAY_MS`). Everyone is then put back on it (`reseatCrowd`), keeping
position and identity but losing their seat.

- **Nodes**: one per paved tile; stairs and ramps get a foot and a head node.
  Climbs are read off the laid pieces, so old saves walk what they show.
- **Edges**: between neighbours at most one level apart, a one-level step only
  via stairs or a ramp. Stair edges are `stepped`, the one thing a wheelchair
  can't use.
- **Seats** from the art are attached to the nearest node. Seats on sand go to
  `beachSeats`, lifeguard posts to `posts`, which guests never look in.
- The per-frame step never reads terrain, occupancy or layout.

## Movement and storage

- A person moves along a segment `from → to` at `t`; sitting or lying is a
  zero-length segment with a duration. `cameFrom` prevents doubling back.
- **Avoidance**: a spatial hash rebuilt each frame. Walkers step right and slow
  down; at a crossing the higher index waits. On sand, walkers check a clear
  line against `sandGrid.ts`.
- **Speed follows the clock**: crossing the plot takes a tenth of a sim day at
  every speed. Long frames split into `MAX_STEP` substeps, capped at 112 so
  `rush` fits.
- **Boats** steer clear of piers and each other. Hire boats go out as the
  hut's visitors fill them, on crowd time.

The crowd is a structure of arrays with fixed capacity and no per-frame
allocation (position, segment, speed, node, seat, avoidance, lane, spatial
hash). New attributes are new columns; `node` is -1 on sand. A plot with no
paving keeps the capacity with everyone off the plot until paving arrives.

## Drawing and inspecting

- One `InstancedMesh` per person model, not chunked or culled. The CPU writes
  position and yaw; every pose is done in the vertex shader from a packed
  `figure` and `pose` vec4, because WebGPU allows only eight vertex buffers
  (`crowdField.test.ts` counts them).
- People are painted at half a voxel (`FIGURE_SCALE`) so limbs can be thin.
  The mesher culls faces where an arm touches the body, so `figureLimbs.ts`
  adds them back.
- The field draws a `DrawnAs` (the cast) over the crowd and never writes the
  crowd's state. Wheelchair users are drawn sitting on a `wheelchair` prop.
- **Inspector**: a click without a build tool picks the nearest person on
  screen, else the tile's placement. Guests show needs, destination and a live
  status line; venues show who's inside and queuing.
- **Following** (`guest-view/`): the inspector's Follow button or `F` puts the
  camera behind the guest, and `C` switches to their eyes, where their own body
  is left out of the drawing. A drag looks around and springs back after two
  seconds; the wheel or a pinch moves the camera nearer or farther. A follow
  card stands in for the inspector, worded again every simulated hour, can be
  dragged out of the way, and venue signs and problem markers are hidden. The
  camera trails the guest on a leash and only slowly comes round behind their
  heading, so a guest who zigzags does not swing it about. Going indoors or
  under a roof, the camera stops at the door (`guest-view/domain/doorway.ts`)
  and waits there until they come back out and can be seen from it, or have
  walked 32 voxels or four seconds; somebody already inside when the follow
  began is watched from an orbit. One who checks out (the body handed to
  another party counts) is held for three seconds.
  Esc, a click on nothing, Stop, a camera command or arming a tool ends it;
  another guest clicked is hopped to.
- **Speed while following** is capped at Slow, which still jogs the crowd at
  3.6 times walking pace, whatever is picked or unpaused to meanwhile; the
  speed from before, or the last one picked, comes back after. Nothing is saved: a save keeps the camera from
  before following.
- **Riding along** is a camera on a craft, not the guest: a followed guest
  inside a hire hut with a craft out is shown out on the youngest one, once a
  visit, and the card's Ride along takes another. The guest stays in the hut in
  the sim, and the passengers drawn aboard are not them (visual only
  means visual only). A ride ends when the craft ties up, or when an edit puts
  new fleets on the sea.
- **Venue names** (`naming/domain/venueNames.ts`) are drawn from the model's
  `names` by hash, never reused, renamable in the inspector, saved by placement
  key.

## Determinism

Bench runs must replay the same scene: seeded PRNG, fixed timestep and real-time
crowd speed under bench, frame delta clamped to `MAX_STEP` otherwise.

`pnpm sim:report` runs the sim headless for `SIM_DAYS` days on the reference
resort ([fixtures/README.md](../fixtures/README.md)), which only moves when
somebody edits it, so its numbers compare across changes. It runs the game's
own step (`stepSim`), staff, events, bills and weather included, so its numbers
are the game's. `SIM_PLOT=112x100 SIM_SEED=1` runs a generated plot instead,
`SIM_SAVE=<save JSON>` a whole save, and `SIM_WEATHER=clear` pins the weather.

## Clock

`sim/domain/simClock.ts`. One tick is a minute, a day 1,440 ticks, at most 12
ticks a frame (so the clock falls behind under load). The resort opens paused.

| Speed  | Real seconds per day |
| ------ | -------------------- |
| Slow   | 900                  |
| Normal | 300                  |
| Fast   | 120                  |
| Rush   | 30                   |

Needs run on ticks; the crowd and hire boats on frame time scaled by speed;
balloons, the sea and construction on real time.

## Guests

`createGuests` builds a registry parallel to the crowd (guest `i` is walker
`i`), kept apart because none of it is read per frame. Guests come in parties
(`PARTY_MIX`):

| Kind    | Share | Adults | Children |
| ------- | ----- | ------ | -------- |
| family  | 0.40  | 2      | 1–3      |
| couple  | 0.30  | 2      | 0        |
| friends | 0.18  | 3–4    | 0        |
| solo    | 0.12  | 1      | 0        |

- About 7% of parties have an adult in a wheelchair, rolling at 0.8 speed.
- Beds come from the art (`bedsOf`), biggest parties into the biggest lodgings.
  A party without room gets `NO_HOME` and starts away.
- After an edit, `rehome` remaps homes by key, so untouched lodgings keep their
  guests. A party whose lodging was demolished is re-housed whole if possible.
- A bare game is dealt guests by the land it owns (256 on the starting block),
  growing as land is bought.

## Needs and choosing a venue

Five needs per guest (hunger, thirst, energy, fun, hygiene) from 1 content to 0
desperate, decaying per tick at rates from `archetypes.ts`. A sixth, health, is
not a want (see [Breakdowns and injuries](#breakdowns-and-injuries)). Sleeping
guests' needs hold.

`strongestNeed` decides **whether** a guest goes somewhere, `chooseVenue`
**where**:

```
score = gain * taste * recency
        ---------------------------------------------------------
        (1 + distance / reach) * (1 + CROWDING * busy / capacity)
```

- **gain** counts only what the guest can use, estimated for arrival time. A
  cost counts only below `CONTENT_LEVEL` (0.5), so a rested guest plays tennis
  for free.
- A venue is a candidate only if it serves a need the guest would get up for,
  and only while it is open: the weather and its `hours` (`hours.ts`) can shut it.
- **taste** is a stable hashed per-guest preference, **recency** halves the
  place just left, **busy** is inside plus queuing.

Tune `archetypes.ts` first.

## Routing, visits and queues

`router.ts` is the only thing the crowd calls (`routeOf`); guests who want
nothing wander.

- **One flow field per venue**, swept breadth-first from its doors, built on
  demand and dropped on every edit.
- **Parties move together**: whoever decides sets the goal for all.
- **Step-free fields** skip stepped edges for parties with a wheelchair user,
  built only when such a party asks. The beach is out of their reach.
- A visit lasts the art's `dwellSeconds`; the need is satisfied on the way out.
- **Doors** are declared on the art and rotate with the building.
- A full venue grows a queue along the paving from its door. Guests skip venues
  whose queue is full and are turned away if it fills before they arrive.

## Places and acts

The sim holds a visitor at the middle of the footprint. The **cast**
(`casting.ts`) draws them somewhere better: a seat or spot the art declares
(`placesFor`). It is recast after each frame's ticks and rebuilt on every edit.

- **Visitors** fill spots, then seats, then areas and loops, in the venue's
  `order`. Parties sit side by side; children take places marked `child` first,
  so parents end up on the benches.
- **Watchers**: at courts, the queue is drawn on spectator seats.
- **Hidden**: a visitor with no free place, or a guest asleep, isn't drawn and
  can't be picked.
- **Staff** at work are drawn on their role's spot (`recastStaff`).
- **Acts** (`acts.ts`, `perform` each frame) animate visitors in `areas`
  (swimming, wading) and on `loops` (ladders, slides). Positions are a pure
  function of act, place, person and time on the choreography's own clock,
  which advances with the crowd.
- **Games** (`games.ts`, `courts.ts`): tennis, basketball and volleyball replay
  hashed rallies; watchers follow the ball. The ball field draws the balls.
- **Minigolf** (`golf.ts`), **playground** (`play.ts`), **kids club**
  (`tag.ts`), **shows** (`shows.ts`), gym stations, game hall and showers each
  have their own act, declared on the art.
- **Staff at work** (`work.ts`): animators perform, lifeguards scan the water,
  cleaners sweep, mechanics hammer.

## Beach

The beach is one pseudo-venue (`beach.ts`): fun and energy, two to four hours,
effectively unlimited capacity. Its values live in code because sand has no
model. Nothing on sand is paved, so beach buildings are reached over it.

- `doorsFor` returns **sand doors** for beach buildings. `sandRoute.ts` finds a
  string-pulled route from each nearby gate; the router walks the guest along it.
- **Pitches** (`beachPitch.ts`): each party prefers a lounger per adult, then
  any lounger, then open sand. A lounger adds energy and stops sunburn.
- **Shade** (`shade.ts`) is declared on the model (`shade: true`, the shade
  sail): every tile under a placed one is shaded, and the model is no obstacle
  on the sand, so towels lie under it. Nobody resting on a shaded tile burns
  (`isSunbathing`). In a heatwave a shaded tile is a tier of its own, after
  any lounger and before open sand, within the same `PITCH_TILES`; on any
  other day, or with no shade, pitches are exactly as without it. A towel in
  the shade on a heatwave also gets `SHADE_RELIEF` (energy +0.3, the
  lounger's) when the stay ends.
- **Errands**: a guest with a pressing need walks to a beach venue and back,
  but not in the first `SETTLE_TICKS` after lying down.
- **The beach is the owned span** (`BeachBand.span`): roaming, routes, pitches,
  buoys and swimming stay inside it.
- **Swimming** is drawn only (`seaSwim.ts`): about a quarter of resting adults
  and a third of children are in the water, inside the buoy line. A trip only
  starts if the stay outlasts it and the walk is a clear line.
- **Rentals and fleets are declared on the model** (`hire`): a hut lists its
  fleets in the order it lets them out, each a sea model, a count, riders per
  craft and a pace. Every such hut is a rental (`rentalsOf`), cuts its own
  corridor through the buoys and keeps swimmers out of it. `fleetAllowances`
  sends a fleet's craft out only full, the last fleet taking the remainder, so
  three at the water sports hut take two jet skis and four take the banana. A
  fleet with `tows` pulls a towed craft on a 14-voxel rope behind each craft
  (`towAlong`), held like a trailer, so it cuts inside its tug's turns.
- **Water sports** (`water-sports`) is `bathing`: auto hiring adds a lifeguard
  for its watch chair, and every visit risks a mishap, a tenth as likely
  watched. It breaks every 30 visits on average and leaves its visitors wet
  (hygiene -0.2), which sends them to the beach shower.
- **Built in play**: an edit that adds or pulls down a hut rebuilds the fleets
  (`refleetAfterEdit`); the buoys, swim area and sailing ground keep the layout
  they were built with until the next load, so a new hut's boats berth outside
  the buoys.
- Known gap: a bar on a raised sand terrace isn't reachable.

## Night

`night.ts` hashes a bedtime (from 19:00) and wake time (from 07:00) per party.
Sunset is 21:30. Guests walk home on a flow field per lodging and are held
inside until morning; those without a bed wander. Lit windows follow the share
of beds in use. Parasols furl in the evening and in rain (`canopyFurl.ts`).

A venue may declare `hours` (the night club, 20:00-02:00). On a night when one
is open late, reachable and dry enough, a hashed share of parties without
children goes out (`nightOut.ts`) and stays up until a late bedtime between
23:00 and 01:30. Past its usual bedtime such a party is **out late** and only
chooses venues with hours; when none serves it, the night is over and it goes
home early. Whoever is still up at 22:00 wakes tired. The walk home is long, so
the last revellers are often still on the paths at 03:00; that is accepted.

## Weather

`weather.ts` picks one weather per day from a hash of day and seed, so it isn't
stored. Of 24 days, 16 are clear, 4 rain, 2 heatwave, 2 storm.

| Day        | Need weights           | Decay                    | Closes | Overcast | Cooling |
| ---------- | ---------------------- | ------------------------ | ------ | -------- | ------- |
| `clear`    | all 1                  | all 1                    | none   | 0        | 1       |
| `rain`     | fun ×1.2, hygiene ×0.8 | all 1                    | `open` | 0.55     | 1       |
| `storm`    | fun ×1.2, hygiene ×0.8 | energy ×1.2              | `open` | 0.85     | 1       |
| `heatwave` | thirst ×1.6            | thirst ×1.8, energy ×1.3 | none   | 0        | 1.6     |

`ModelVenue.shelter` is `'open'` or `'covered'` (default). Closed venues aren't
chosen and turn guests away; those inside finish. A venue that `cools` (the
misting pavilion) has its appeal multiplied by `cooling`: it changes where
guests go on a hot day, not what a visit gives. Drawing is in
[rendering.md](rendering.md#weather).

## Arrivals and departures

- **Bodies are fixed, guests change.** Slots are assigned once by model; the
  registry has a `present` flag that check-in and check-out flip.
- **Gates** are declared on the art (`gateway: true`). No gate, no arrivals.
- **Check-in at reception**: arriving parties walk to the nearest venue that
  `receives` and queue there. No reachable desk, nobody admitted.
- **Arrivals** are sized at 11:00 from all beds times an appetite that grows
  with the rating, in three waves (11:00, 14:00, 17:00). Stays average eight and
  a half nights.
- **Check-out** is daily before bedtime. Leaving parties' beds become `unmade`
  until a cleaner makes them up. Invariant per home:
  `freeBeds + unmade + taken = beds`.
- **The check-in hour** pays the bills, rates the day, writes the day report
  (last 14 kept) and lets the morning coach in.
- **Open and closed** gate arrivals only. A bare plot starts closed.

**Happiness** (`happiness.ts`) drifts towards `contentmentOf`, lower while
queuing. Needs below `CONTENT_LEVEL` count squared, so one empty need costs more
than five half-met ones. **Rating** (`rating.ts`) is three quarters happiness,
one quarter guests with a bed, plus cleanliness. An empty resort rates 3 stars,
a fully served one about 4.5.

## Advice

`advice.ts` ranks the resort's problems, one function and one test per rule,
each taking a `ResortFacts` literal. Rules include `closed`, `no-entrance`,
`no-reception`, `no-beds`, `unserved-need`, `full-lines`, `unreachable`,
`not-step-free`, `broken`, `hurt`, `littered`, `far-from-home`, `unvisited`,
`weather-closed`, `unwatched`, `short-staffed`, `unmade`, `no-depot`,
`no-events` and `no-welcome`.

- The setup rules speak on an empty resort; the rest stay silent until guests
  arrive.
- Recomputed daily after arrivals, after an edit and on opening or closing.
- Building advice has a **Show** button. Wording lives in `AdvicePanel.tsx`.

## Thoughts and reviews

`thoughts.ts` remembers each guest's last thought and counts a stay's worth per
kind; `reviews.ts` turns a stay into one line at check-out.

- The router emits through an optional `onThought` and imports nothing from
  `thoughts.ts`. Nothing reads a thought back.
- Kinds include `queue-too-long`, `closed`, `nothing-for`, `no-bed`, `filthy`,
  `enjoyed`, `lovely`, `littered`, `no-step-free`, `hurt`, `broken` and event
  praise. The same thought within two sim hours is ignored.
- A review's stars are `round(5 × mean stay mood)`, its complaint the most
  frequent thought, its praise the most frequent praise. A `photo` praise
  quotes the subject of the party's latest photo (`praiseSubject`).
- `photo` ("Had to take a picture of the fountain") and `sunset` ("What a
  sunset!") are praise, heard when a guest takes a photo.
- Wording lives in `hud/components/thoughtWords.ts`.
- `THOUGHT_KINDS` is append-only: saves keep a slot per kind.

## Cleanliness

`upkeep.ts` keeps cleanliness per venue, 1 spotless to 0 filthy. Each visit
wears it, a cleaning spell restores it, and below `NEEDS_CLEANING` (0.7) a
cleaner comes. Nothing recovers on its own. Dirt lowers a venue's score to a
floor and adds a small rating term.

## Staff

Staff are a second population with their own registry (`STAFF_SOURCES`, kept out
of `PEOPLE_SOURCES` so guest draws don't shift), crowd field and router, on the
same `crowd.ts`. A resort meshes a fixed pool (`STAFF_CAPS`); the roster
(`rosterFor`) decides how many are on duty.

| Role      | Count                                   | Does                                          |
| --------- | --------------------------------------- | --------------------------------------------- |
| Cleaner   | one per six venues plus one per 60 beds | rooms first, then dirtiest venue, then litter |
| Animator  | one per three `stage` or `dj` venues    | an hour or two per stage, then moves on       |
| Lifeguard | one per `bathing` venue and tower post  | stays at the water, or walks the sand to it   |
| Mechanic  | one per five venues with `reliability`  | repairs the longest-broken venue              |

- **Staff house** (`staff-house`): a depot declared on the art. Staff clock on
  and off there; cleaners restock there every four spells. Without one, the
  entrance serves.
- **Hiring**: every role defaults to Auto (the plot's recommendation). A role
  set by hand in the Staff window keeps its number through edits. Below the
  recommendation, advice says `short-staffed`, with a Hire button that tops the
  role up. While a hand-set role is short, a place's own staff problem
  (`unwatched`, `broken`, `dirty`, `unmade`) offers "Hire <role>", which adds
  one (`hireOffer.ts`), in the advice, its toast and the inspector.
- **Zones** (`zones.ts`, up to 4): painted tiles that restrict where staff work.
  Staff are dealt round-robin over zones holding a workplace for their role. A
  role with no zoned workplace works the whole plot.
- **Lifeguards**: the busiest open, unwatched `bathing` venue first, reached
  over the sand when it has no door on the paving (water sports); a tower only
  with no venue left. An edit sends each back to the water they watched before.
  Water only counts as watched once they are sat (`watching`, which sets the
  mishap odds); the advice and inspector also accept one on the way (`guarded`)
  and leave shut water out.
- **Tasks**: `staffRouter.taskOf(worker)` reports what someone is doing, used by
  the pins (`S`), the inspector and the Staff window's tallies.
- **Orders**: send a mechanic or cleaner to a specific venue or tile from the
  inspector. The nearest free worker claims it at their next step.
- **Uniforms**: a cap in a role colour, and no shirt in a guest colour.

## Events

The player books events on the **programme** (`events/`, the Programme window).
Kinds live in `EVENT_KINDS` (`catalogue.ts`): evening shows like live music,
quiz night and cinema; afternoon ones like magic, bingo and kids' games. Each
has a host, fee, hours, appeal per party kind, fun, lift and litter. Every
`stage` venue hosts.

- **Programme** (`programme.ts`): bookings keyed by placement key, repeating
  daily, weekly or once, with a 30-minute changeover between them.
- **Runs** (`eventRuns.ts`): announced an hour ahead, then started and ended.
  Called off for weather, no animator, no money (tycoon) or no stage. The fee is
  refunded if weather stops a show.
- **Audience** (`audience.ts`): free parties are invited by hash against the
  kind's appeal until the stage is full. Invited parties stay up late.
- **Effect**: fun while it runs, a happiness glow afterwards, a praise thought
  and litter. Late events cost energy next morning.
- **Welcome meeting**: the one built-in (`BUILT_INS`), daily at 10:00 for those
  who checked in the day before. It moves to a sheltered stage in bad weather.
- **Fireworks**: held on the beach in three sizes, 22:00 to 23:00. Rain
  postpones them a day. Repeat shows in one stay are worth less. On the beach,
  watchers get pitches in the front rows facing the sea; parties already there
  are invited in place. Wheelchair parties aren't invited, since the sand isn't
  step-free.
- **Bonfire**: the beach's second event, 20:00 to 21:30 starts, 90 minutes long,
  a visiting guitarist's fee. Booked on the Beach tab, but held at the first
  fire pit there (`heldAt` in `sites.ts`, the kind's `hearth`), so its room is
  the pit's sixteen log places, and with no pit it is called off as
  `'no-site'`. Rain calls it off. The pit is a venue that satisfies nothing, so
  nobody but the invited ever goes; its flames, light and crackle come only
  while the bonfire runs. From its first start it is out a changeover before
  the earliest fireworks, so a night can have both.

A new kind is one entry in `EVENT_KINDS` and `EVENT_KIND_IDS`.

## Breakdowns and injuries

- **Breakdowns** (`breakdowns.ts`): `venue.reliability` on the art is the mean
  visits between breakdowns. A broken venue fails the router's one `isOpen`
  predicate, so it's skipped and turns guests away. Mechanics repair it.
- **Health** is a need but not a want: never drawn, never decays, weight 3 in
  `strongestNeed`, so a hurt guest heads for first aid. It scales contentment.
- **Incidents** (`incidents.ts`): sunburn on the open sand in a heatwave, and
  mishaps at `bathing` venues, ten times likelier without a lifeguard.

## Litter

Declared on the art: `venue.litter` (chance a visit leaves the guest holding
something) and `binReach` (makes a model a bin).

- `litter.ts` keeps a level per tile. A guest carrying litter drops it after
  `CARRY_NODES` (6) nodes without a bin. Beach stays leave litter on the pitch.
- Litter subtracts from a guest's surroundings, more than the prettiest scenery
  gives.
- Cleaners sweep the worst tile when no venue needs cleaning, and sweep in
  passing on any node they reach.
- After an edit, litter is cleared from tiles that are no longer paved or open
  sand.
- Drawn as small models from `voxel-gen/litter/`, up to four per tile.

## Scenery

Dressing declares `scenery` (0 to 1) on its model: fountain 1, statue 0.8,
flowerbeds 0.5, trees 0.4, hedge 0.3, mosaic 0.05. `scenery.ts` sums it into a
per-tile field within 4 tiles, saturated so nothing reaches 1, rebuilt after
every edit. A guest's happiness target adds 0.1 × the scenery under them.
Scenery never changes where anybody walks.

## Photos

Guests stop now and then to photograph a view (`sim/domain/views.ts`,
`outlook.ts`, `photos.ts`; the decision is `resort-sim/domain/photoSteps.ts`).

- **The scenic value** of a tile is built once per edit, with the scenery:
  `0.7 × scenery + 0.6 × sea + 0.5 × overlook + 0.3 × sight + 0.4 × pond`,
  clamped to 1.
  - `sight` is the strongest sight's strength, less with distance as the
    scenery spreads it (a fountain beside the tile 0.8): the scenery field
    saturates, so without it a fountain plaza scored no better than a bare sea
    view. `pond` is the inland water (not sea) within 6 tiles, full at 12
    tiles: a canal under a bridge, a pond, a river.
  - `sea` is the larger of the sea within 6 tiles and the sea seen across
    open ground. The sea lies towards +z, so three rays (straight and the two
    diagonals) are swept from the shore inland; a ray is clear if nothing on
    the way (ground plus the tallest model on the tile) reaches the guest's
    eye. A clear ray counts fully up to 36 tiles from the water and fades out
    by 72. Standing higher, a guest sees over loungers and palms.
  - `overlook` is how far the tile stands above the lowest ground within 12
    tiles, full at 4 levels: a dune top, a hilltop, a plateau's edge.
  - At query time: the base counts from 07:00 to sunset; the golden hour (the
    90 minutes before 21:30, dry days only) adds `0.5 × golden × sea`; a show
    on a stage or fire pit within 6 tiles adds 0.5; the fireworks add
    `0.8 × sea`. Rain and storms make it 0. Litter on the tile and a broken
    venue within 2 tiles (0.3) are taken off after the draw.
- **Who and how often**: a present adult reaching a path node whom the router
  calls free (not asleep, leaving, arriving, visiting or on an errand), or at
  the end of a leg over the sand to or from their pitch, or on an errand from
  it (`router.walksTheSand`), at most once every 3 sim hours. At a value
  `v >= 0.5` the chance per stop is `PHOTO_CHANCE × (v - 0.5) / 0.5`, hashed
  from person, node (`ON_SAND` on the sand) and tick. Nobody resting on the
  beach, swimming or on a lounger, and no children. Off while the clock is
  paused, so a bench replays unchanged.
- **On the sand** the value is the beach tile under the body: level 0, so no
  overlook; the sea and the sunset carry it, which makes a sand photo rare by
  day (about 1 % a leg) and likely in the golden hour. It counts in the tally
  and the thoughts, not on the overlay, which is per node.
- **The pause** is asked by the crowd (`pausesAt`) before an arrival's draws,
  and draws nothing itself. It is a 6-second timed stand on the node, or at
  the end of the sand leg (`runErrand` asks before the router, and asks again
  when the pause runs out, which the 3-hour gap answers no), in the `photo`
  pose, both arms up, facing the picture's heading, out of avoidance as a
  sitter is.
- **The subject**, first that applies: the fireworks, a show, the sunset (sea
  of 0.5 or more in the golden hour, facing the setting sun), a sight (a model
  of scenery 0.5 or more within 4 tiles: fountain, statue, flowerbed,
  blossom), the sea, inland water ("Water", facing it), or the view (facing
  downhill). A sight or a show is keyed
  by its placement; the rest by kind and 8-tile cell (`sea@12,30`), named
  after a named venue within 12 tiles ("Sea by Float & Sip").
- **Framing**: each photo has its own, hashed from person, node and tick
  (`photo/domain/framing.ts`): the heading turned up to ±12° (±5° for a sight
  or a show, which must stay in frame), a field of view of 45° to 70° and a
  tilt of -0.02 to 0.2 rad. The heading is stored turned; `fov` and `tilt` are
  stored on the spot, and a spot saved without them draws at 60° and 0.12.
- **Effects**: a stay memory of `0.01 / (1 + photos so far)` (reviews, not the
  rating), a `photo` or `sunset` thought, a count on the node (halved every
  morning) and the day's tally of spots, each with its latest viewpoint.
- **Spots kept**: 24 a day. Past that, the least photographed spot **of the
  kind with the most spots** goes (the earliest on a tie), so a day of twenty
  sea cells keeps its one sunset. The day report keeps the 12 most
  photographed; its panel shows three.
- **Shown** in the Photos overlay, the day report's "Most photographed", and
  the Overview's Photo wall. The wall hangs the four most photographed spots of
  each kind, today's and the last report's, grouped Sunsets, Shows, Fireworks,
  Sights, Sea, Water, Views, as old prints (faded and vignetted in CSS only). A
  card renders at 300x200 CSS pixels times the screen's density (up to 3) when
  it scrolls into view, one at a time, never saved. Clicking one opens a
  lightbox: the same spot drawn at up to 960x640 CSS pixels, again times the
  density, with Previous and Next across the wall, Save and Share (captioned
  with the resort's name). After each capture the screen's level of detail is
  put back at once, or the crowd would be drawn one frame as the photo saw it.
- **A picture is drawn at its photo's hour** (`photoMode.pictureOf`): the look
  time is set to the photo's minute for the capture and put back before the
  read-back is awaited, so the sun, the dome, shadows and lamps follow; the
  weather, the parasols and which rooms are lit are today's. **The flash**: a
  photo from sunset to 07:00 (ramping over 20 minutes either side) is drawn
  with the ambient light raised and whitened (`setFlash`, a uniform, so no
  shader rebuild and no light to pay for every frame), then the pixels get a
  centre-weighted lift (`photo/domain/flash.ts`), so the foreground reads and
  the night sky stays dark. Guests show no flash in the game (see plan 109).
- **Dunes**: beach walkers stay on the level-0 sand; dune sand is an obstacle
  to them. Guests on paving over a dune score its height.
- **The one dial** is `PHOTO_CHANCE` (0.04). On the reference resort that is
  about 1.0 to 1.4 photos per guest a day, and 20 to 40 sunsets. Measure a
  change with `SIM_PHOTOS=1 pnpm sim:report`; without the variable the report
  takes no photos.

## Overlays

The **Overlay** picker tints paved tiles by one question
(`overlays/domain/overlays.ts`). Every layer is 0 to 1 per node, or `NaN` for no
data, and **high is always bad**, so one ramp and legend serve all.

| Layer     | Shows                          |
| --------- | ------------------------------ |
| Footfall  | where guests walk              |
| Mood      | where guests are unhappy       |
| Food      | distance to something to eat   |
| Drink     | distance to something to drink |
| Wash      | distance to somewhere to wash  |
| Step-free | where a wheelchair can't go    |
| Scenery   | where the walk is plain        |
| Litter    | where litter lies              |
| Photos    | where guests take photos       |

Photos is a count, like Footfall: its high end is where most are taken, not bad.
Distance layers come from one multi-source sweep (`reach.ts`), kept per walk
graph. Footfall is sampled per frame and halved every morning. Layers update
hourly while on, never per frame. The sim never reads one.

## Money

One simulation runs in both modes. Sandbox and tycoon differ only in
`canAfford` (`ledger.ts`). **The ledger records in both modes**: sandbox still
pays wages and maintenance, it's just never short. Don't "fix" wages to 0 in
sandbox.

**No guest behaves differently because of a price.** Choosing, routing, needs,
thoughts and advice never read one.

- `cost` on a model is what standing it costs; undeclared, it's derived from
  voxel count.
- `price` on a venue is what a visit or a guest-night takes.
- Money moves for build, demolish (half back), dig, land, visits, nights, wages
  and maintenance (1% of build cost a day), each with its own column in the
  Books.
- Nights are billed for the bed slept in. A lodging's rate rises up to a quarter
  with its surroundings.
- **Tycoon starts on bare ground** with 8,000. Generated resorts are always
  sandbox. "Free play" is the player-facing name for sandbox.

## Land

A bare game is a 256-tile world cut into 16-tile parcels
(`land/domain/landRights.ts`). No land data means everything is owned, so
generated and authored plots are unaffected.

- **Starting block**: four parcels wide on the south edge, down to the sea.
- **For sale**: any parcel beside owned land, at 1,500 (free in Free play).
- **Building only on owned land**; an entrance must face the edge.
- A purchase applies at once to money and building rights. Lighting, terrain,
  beach span and guest capacity follow at a **settle** two seconds later, which
  rebuilds the world on the worker and restores the game onto it.

## Saving

A save is the whole simulation: every guest and worker resumes exactly where
they were. `Showcase.snapshot()` assembles one snapshot per module, and `load()`
restores them onto a resort rebuilt from the saved placements in saved order.
Saves live in IndexedDB and are parsed with zod (`saves/domain/snapshot.ts`).

**Every new piece of simulation state must be added to its module's snapshot and
schema.** For the two routers, a new field goes into the state record and its
column list in `routerSnapshot.ts` or `staffRouterSnapshot.ts`, and the state
tests fail until it is declared. There are no migrations. The twin-run tests (`crowd.test.ts`,
`router.test.ts`) restore a snapshot into a second resort and run both side by
side, catching missed fields their scenario exercises. Reordering
`THOUGHT_KINDS`, `GUEST_NEEDS`, `STAFF_ROLES` or the crowd's sentinels changes
what saved numbers mean.

A resort can also be shared as a link (`features/sharing/`, the Share resort
window, from the menu's Game page or the command palette). A link carries the
layout only: the `SavedWorld`, the `ResortParams`, the resort's name and its
venue names, packed in columns by `layoutCodec.ts`, deflated and put after
`#resort=`, so no server ever sees it. Whoever opens it starts that world in
sandbox on day one, with the guests its beds give. The link has its own
`LINK_VERSION`, its first byte, apart from `SAVE_VERSION`; like a save, it stops
opening once the catalogue drops an id it uses. A link comes from outside, so
beyond its schema `worldMisfits` checks that the layout fits its plot and its
models: every placement stands where its model would, and no key, rail edge or
terrain cell repeats. **A new field on `SavedWorld` must be added to `layoutCodec.ts`**, or the
codec's round-trip test fails. Bump `LINK_VERSION` only when an old reader would
misread a new link. A postcard link from photo mode also carries a view (camera,
lens and hour) as an optional header field, which an old reader drops.

## Where the art lives

- People: `voxel-gen/people/`, with the shared `figure.ts` builder. Staff in
  `STAFF_ROLES` order. Preview with `pnpm preview --people`.
- Boats and buoys `voxel-gen/sea/`, balloons `voxel-gen/sky/`, litter
  `voxel-gen/litter/`, balls `voxel-gen/props/`.
- `paintedModelsOf(paintedCatalogue())` in `paintedModels.ts` joins them all,
  painted in the mesh worker; `dveEngine.test.ts` still meshes everything.
- On a model: `scenery`, `venue.litter`, `binReach`, `venue.reliability`,
  `cost`, `venue.price`, `venue.spots`, seats with `watches`, and `game`,
  `side`, `venue.court` and `venue.ball` for courts.
