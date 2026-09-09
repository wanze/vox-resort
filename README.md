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

A generated plot's southern end is sea, with a beach the full width of the plot
in front of it — the isometric camera opens over the south-east corner, so the
shore lies across the front of the frame with the resort behind it. Bungalows,
loungers and parasols stand on the sand, paths laid over it come out as
boardwalks, and nothing can be built on the water.

Behind the beach the land is terraced: a raised bench carrying its own
neighbourhood, with the rest of the resort behind it back at sea level. Paths
that cross a step come out as flights of stairs, turned to face the climb.

The palette offers no stairs and no boardwalk, because neither is something you
pick: **there is one paving tool, and the ground decides what a tile of it comes
out as** — flagstones on grass, decking on sand, a flight where it climbs a step.
Draw over a step in either direction and the tile below it turns into the flight
up it, whether that tile was laid a moment or a session ago. So a path drawn by
hand comes out exactly as a generated one does, and there is no way to lay
decking on a lawn or a staircase up the middle of one.

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
