# CLAUDE.md

Voxel resort-builder prototype: Three.js WebGPU renderer over Divine Voxel
Engine, React 19 for the HUD, TypeScript, Vite, pnpm.

## Conventions

- Code is grouped by feature. Inside a feature: `domain/` is pure functions with
  no I/O, `adapters/` is anything touching an engine, the DOM or the GPU, and
  `components/` is React. Dependencies point inwards — `domain/` may not import
  `adapters/` or `components/`, and this is enforced, not just a convention.
- Every `domain/` module has a unit test next to it. Keep logic in `domain/` so
  it stays testable without a browser.
- Voxel models are art, authored outside `src/`; the app derives everything from
  the model registry, so adding an object should not require app changes.
- Do not start a browser to verify visually, I will test myself.

## Commands

`pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`,
`pnpm build`, `pnpm bench`, `pnpm fallow`, `pnpm fallow:audit`.

Run `typecheck`, `lint`, `test` and `format` before considering a change done,
and `fallow:audit` to check what the change itself introduced.
