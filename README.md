# Vox Resort

A voxel resort-builder prototype: five hundred hand-authored voxel buildings
laid out on streets across a 448 × 400 m plot, lit after dark by 608 baked lamps,
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
pnpm preview    # render model thumbnails for the build palette
pnpm dev        # http://localhost:5173
```

| Script                              | Does                                    |
| ----------------------------------- | --------------------------------------- |
| `pnpm dev`                          | dev server                              |
| `pnpm build`                        | production build                        |
| `pnpm preview`                      | render model previews                   |
| `pnpm test`                         | unit tests                              |
| `pnpm typecheck`                    | type check                              |
| `pnpm lint` / `pnpm format`         | lint / format                           |
| `pnpm fallow` / `pnpm fallow:audit` | dead code, duplication, boundaries      |
| `pnpm bench`                        | measure the renderer (needs `pnpm dev`) |

Controls, build tools and the terrain are described in
[docs/rendering.md](docs/rendering.md).

## Structure

Code under `src/features/` is grouped by feature, each split into `domain/`
(pure functions, unit-tested), `adapters/` (engine, DOM and GPU) and
`components/` (React). Dependencies point inwards — `domain/` may not import
`adapters/` or `components/` — which `.fallowrc.json` enforces. `src/app/` orchestrates them. The voxel models are art,
not app code, so they live in `voxel-gen/` outside `src/` — see
[voxel-gen/README.md](voxel-gen/README.md) for the authoring API.

## Documentation

[docs/rendering.md](docs/rendering.md) — the pipeline from models to frame, the
layout and terrain rules, the build tools, lighting, benchmark numbers, how to add
an object, and notes on the DVE integration.

[docs/crowd.md](docs/crowd.md) — the people, boats and balloons: the walk network,
how the crowd is stored and drawn, and the crowd's milestones.

[docs/art-direction.md](docs/art-direction.md) — what the objects are meant to
look like: the reference renders in [docs/references/](docs/references/), the
shared palette every model paints from, the parts a building is composed of, and
which models still have their style pass to come.
