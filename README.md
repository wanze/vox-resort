# Vox Resort

A voxel resort-builder prototype. Hand-authored voxel buildings are laid out on a
plot, meshed with Divine Voxel Engine and drawn instanced with the Three.js
WebGPU renderer. Guests walk the paths, visit venues, sleep, check in and out.

## Stack

| Concern         | Choice                                                      |
| --------------- | ----------------------------------------------------------- |
| Package manager | pnpm                                                        |
| Build / dev     | Vite 8                                                      |
| Language        | TypeScript 7                                                |
| Lint / format   | oxlint + oxfmt                                              |
| Renderer        | Three.js `WebGPURenderer` (`three/webgpu`), WebGL2 fallback |
| Voxels          | Divine Voxel Engine (`@divinevoxel/vlox`)                   |
| Models          | Authored in code in `voxel-gen/`                            |
| UI              | React 19, DOM overlay above the canvas                      |
| Tests           | Vitest                                                      |

## Getting started

The Node version is pinned in `.nvmrc`, which CI reads too. With
[nvm](https://github.com/nvm-sh/nvm), run this in the repo root:

```bash
nvm install     # first time, or after .nvmrc changes
nvm use         # every new shell
```

pnpm is pinned by `packageManager` in `package.json`.

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

## Structure

`src/features/` is grouped by feature. Each feature has `domain/` (pure,
unit-tested), `adapters/` (engine, DOM, GPU) and `components/` (React).
`domain/` may not import the other two; `.fallowrc.json` enforces this.
`src/app/` wires the features together.

The voxel models are art, not app code, and live in `voxel-gen/`. The app
derives everything from the model registry, so adding a model needs no change in
`src/`. See [voxel-gen/README.md](voxel-gen/README.md).

## Docs

- [docs/rendering.md](docs/rendering.md): pipeline, layout, terrain, building
  tools, lighting, weather rendering, benchmarks.
- [docs/crowd.md](docs/crowd.md): guests, staff, boats and the simulation behind
  them.
- [docs/art-direction.md](docs/art-direction.md): references, palette, parts and
  modelling rules.
