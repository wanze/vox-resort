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
- Comments explain _why_, never _what_: a hidden constraint, an engine quirk,
  the reason for a magic number. No JSDoc on functions, types or props, no
  section banners, no module headers, no plan history. At most three lines of
  `//`; if the code needs more, rename or restructure it instead.
  `scripts/check-comments.ts` enforces this in `pnpm lint` and after every edit.
- Do not start a browser to verify visually, I will test myself. `pnpm bench` is
  allowed for measuring performance, even though it drives Chrome; just do not
  open any other browser instance to check how something looks.

## Commands

`pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`,
`pnpm build`, `pnpm bench`, `pnpm fallow`, `pnpm fallow:audit`.

Run `typecheck`, `lint`, `test`, `format` and `fallow:audit` before considering a change done.
