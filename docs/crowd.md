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
| Guest registry                         | `guests/domain/guests.ts`                    |
| Parties and who is a child             | `guests/domain/parties.ts`                   |
| Beds                                   | `guests/domain/homes.ts`                     |
| Names                                  | `guests/domain/names.ts`                     |
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

Nothing runs on ticks yet. The crowd, balloons and sea are animation and stay on
the frame delta.

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
