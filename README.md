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

Pick an object from the build palette on the right and click the ground to place
it; one-tile objects (marked ✎) can be drawn by dragging, which is how a path is
laid. The pointer previews where it would land, green where it fits and red where
something is already standing. While building, the right button takes over moving
the camera and Escape puts the object down.

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
