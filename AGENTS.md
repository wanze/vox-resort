# CLAUDE.md

## Conventions

- Code is grouped by feature. Inside a feature: `domain/` is pure functions with
  no I/O, `adapters/` is anything touching an engine, the DOM or the GPU, and
  `components/` is React. Dependencies point inwards — `domain/` may not import
  `adapters/` or `components/`, and this is enforced, not just a convention.
- `src/shared/` is the ui kit: what several features use and that knows none of
  them, split into `domain/` and `components/` the same way. Features import it;
  it imports no feature, which fallow's boundaries enforce.
- Every `domain/` module has a unit test next to it. Keep logic in `domain/` so
  it stays testable without a browser.
- Voxel models are art, authored outside `src/`; the app derives everything from
  the model registry, so adding an object should not require app changes.
- Comments explain _why_, never _what_: a hidden constraint, an engine quirk,
  the reason for a magic number. No JSDoc on functions, types or props, no
  section banners, no module headers, no plan history. At most three lines of
  `//`; if the code needs more, rename or restructure it instead.
  `scripts/check-comments.ts` enforces this in `pnpm lint` and after every edit.
- A feature's styles sit beside its components in `components/<feature>.css`
  and get one `@import` line in `src/app/styles.css`, which orders the layers
  `tokens`, `base`, `ui` (the kit, `src/shared/components/ui.css`), `hud` (the
  screen every feature sits in) and `features`. A later layer wins regardless of
  specificity, so a feature restyles the kit and the HUD without out-ranking them.
- Class names are kebab-case `<feature>-block`, `<feature>-block-element` and
  `<feature>-block--modifier`; the kit's are `ui-*`. A sheet defines only its own
  feature's classes and may use `ui-*`, `hud-*` and `app` as context; the kit's
  sheets know only `ui-*`. State lives in ARIA or `data-*` attributes, not in
  classes. A shared look is a kit class worn in the markup (`ui-panel`,
  `ui-label`, the `ui-button*`), never a feature added to a kit selector or a
  copied rule.
- Colours, shadows and screen-level z-index are tokens in
  `src/app/styles/tokens.css`; `pnpm lint` runs stylelint, which rejects raw
  colours, unprefixed classes and stacking levels outside the token scale.
- Do not start a browser to verify visually, I will test myself. `pnpm bench` is
  allowed for measuring performance, even though it drives Chrome; just do not
  open any other browser instance to check how something looks.

## Commands

Run `typecheck`, `lint`, `test`, `format` and `fallow:audit` before considering a change done.

A model that should be on the reference resort goes into
`fixtures/reference-resort.json` (see `fixtures/README.md`), or onto
`NOT_IN_REFERENCE` in `referenceResort.test.ts`.

A new or changed model needs `pnpm models:facts`, which rewrites the committed
`voxel-gen/facts.json`; `voxel-gen/catalogue.test.ts` fails until it has run.
