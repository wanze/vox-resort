# Vox Resort

A voxel resort-builder prototype: five hundred hand-authored voxel buildings
laid out on streets across a 448 × 400 m plot, lit after dark by 425 baked lamps,
drawn with instancing over a Three.js WebGPU renderer.

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
`pnpm test`, `pnpm preview` to render model previews, `pnpm bench` to measure
the renderer, and `pnpm fallow` / `pnpm fallow:audit` for dead code, duplication,
complexity and architecture boundaries.

Orbit with the left mouse button, pan with the right, zoom with the wheel. The
HUD shows the frame rate, the backend in use, the scene counts, and a
time-of-day slider.

`C`, or the View panel, swaps to an orthographic isometric camera standing over
any of the plot's four corners — `Q` and `E` turn it a quarter, the wheel zooms
it freely, and the left button pans, since the four corners are the rotation. The
mode survives generating a new resort.

A generated plot's southern end is sea, with a wide beach the full width of the
plot in front of it — the isometric camera opens over the south-east corner, so
the shore lies across the front of the frame with the resort behind it. Loungers
and parasols fill the sand in runs, divided into bands by boardwalks that follow
the water, with beach clubs and bars along the back of it, a lifeguard tower
every hundred metres along the tideline — a lifeguard sits on it — and a
volleyball court taped out flat in the sand behind. Paths laid over sand come out as boardwalks, and paths laid over the
water come out as a **jetty** — nothing else can be built on the sea, and two
lanes run out onto it as piers.

Behind the beach the land climbs a **hill**. Three steps of sand rise straight
off the back of the sand onto a flat shelf, still sand, where bungalows stand
along a sidewalk looking down over the beach; grass benches carry on up to a crest with
houses on them, and the far side comes back down to sea level in benches with
more houses on each. Every step follows the coast, so the hill curves with the
beach and the flights up it land on a different row in every lane. The rest of
the resort is the level ground behind. Paths that cross a step come out as
flights of stairs, turned to face the climb.

The palette offers no stairs, no boardwalk and no jetty, because none of them is
something you pick: **there is one paving tool, and the ground decides what a
tile of it comes out as** — flagstones on grass, decking on sand, a flight where
it climbs a step, and a jetty where it leaves the shore. Draw over a step in
either direction and the tile below it turns into the flight up it, whether that
tile was laid a moment or a session ago; draw off the sand and the path keeps
going as a pier, railed down both flanks because open water is a drop. So a path
drawn by hand comes out exactly as a generated one does, and there is no way to
lay decking on a lawn, a staircase up the middle of one, or a jetty over grass.

Pick an object from the build palette on the right and click the ground to place
it; one-tile objects (marked ✎) can be drawn by dragging, which is how a path is
laid. The pointer previews where it would land, green where it fits and red where
something is already standing — or where the footprint would straddle a terrace
step, since an object can only stand on level ground. While building, the right
button takes over moving the camera and Escape puts the object down.

## Structure

Code under `src/features/` is grouped by feature, each split into `domain/`
(pure functions, unit-tested), `adapters/` (engine, DOM and GPU) and
`components/` (React). Dependencies point inwards — `domain/` may not import
`adapters/` or `components/` — which `.fallowrc.json` enforces. `src/app/` orchestrates them. The voxel models are art,
not app code, so they live in `voxel-gen/` outside `src/` — see
[voxel-gen/README.md](voxel-gen/README.md) for the authoring API.

## Documentation

[docs/rendering.md](docs/rendering.md) — the pipeline from models to frame, how
the resort is laid out, what is optimised and what is not, benchmark numbers,
the baked lighting, how to add an object, and notes on the DVE integration.

[docs/art-direction.md](docs/art-direction.md) — what the objects are meant to
look like: the reference renders in [docs/references/](docs/references/), the
shared palette every model paints from, the parts a building is composed of, and
which models still have their style pass to come.
