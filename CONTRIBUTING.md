# Contributing

Thanks for being here. Bug reports with a reproduction get fixed, and small
pull requests get read quickly.

## Setup

```bash
git clone https://github.com/itsolutions-dev/AuraPivot.git
cd AuraPivot
npm install
```

**Node 20 or later** is required for development. The `engines` field says
`>=18` because that is what the _published package_ needs at runtime; the build
itself uses the `with { type: "json" }` import attribute, which Node 18 does
not support. Installing on 18 works. Building on 18 does not.

## Seeing your change

This repository has no dev server and no example app: it is a library, and the
test suite is the development loop.

```bash
npx vitest        # watch mode — re-runs the affected tests on save
```

Most of what this library does is testable without a browser. The engine in
`pivot-core/` is pure TypeScript with no React in it, so a change to
aggregation, filtering, date hierarchies or formula evaluation can be driven
entirely from a unit test — which is faster than clicking through a UI anyway.

When a change genuinely needs to be seen, build the package and link it into an
app you already have:

```bash
npm run build
npm link                      # in this repository
npm link aura-pivot           # in your app
```

Your app's bundler will then resolve `aura-pivot` to `dist/` here. Re-run
`npm run build` after each change — there is no watch build. If your app is
Vite-based, an alias in `vite.config.js` pointing `aura-pivot` at this
repository's `AuraPivot.tsx` skips the build step entirely and gives you HMR
against the source.

Either way, watch out for the usual linking trap: `react`, `react-dom` and
`@mui/material` are peer dependencies, and a symlinked package pulls in the
copies installed _here_ as well as the ones in your app. Two Reacts in one page
produce an invalid-hook-call error that has nothing to do with your change.
Point them at a single copy — a bundler alias, or `npm dedupe` in the app.

## Before you open a pull request

```bash
npm run check          # tsc --noEmit
npm run lint
npm run format
npm test
npm run build          # includes the dist assertions
npm run size           # bundle-size budget
```

CI runs all of these plus a Node 20/22/24 × React 18/19 matrix. The peer range
is `>=18`, so a React 19-only API is a bug even if your editor does not flag it.

## Tests

New code arrives with tests. Coverage thresholds in `vitest.config.ts` are a
ratchet — they are set to what is covered today and only ever go up, so a change
that lowers coverage fails CI rather than passing quietly.

The engine (`pivot-core/`) is pure and framework-agnostic; test it directly with
plain unit tests, not through a rendered component. Reach for
`@testing-library/react` only for behaviour that genuinely needs the DOM.

The virtualized grid renders nothing under a headless DOM unless it is wrapped
in `VirtuosoMockContext` with an explicit viewport height — see
`AuraPivot.grid-controls.test.tsx` for the pattern.

## Changesets

Every change a consumer could notice needs one:

```bash
npx changeset
```

Pick the bump, write a sentence a user of the library would understand.
Releases are cut automatically from these, so a missing changeset means your fix
ships without a version and without a changelog entry.

Internal-only changes — CI, tests, docs — do not need one.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`,
`build:`, `ci:`). The body should say why, not what — the diff already says
what.

## Style

2-space indent, semicolons. Single quotes in `.ts` and `.tsx`, double quotes in
`.js`, `.jsx` and `.mjs`. Prettier enforces this; `npm run format` before
committing saves a CI round trip.

Do not add `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. The repository has
none, and that is worth keeping.

## Where things live

| Path            | What it is                                                       |
| --------------- | ---------------------------------------------------------------- |
| `pivot-core/`   | The engine. Plain TypeScript, no React. Owns all pivot state.    |
| `AuraPivot.tsx` | The `forwardRef` component wrapper. One engine per mount.        |
| `options/`      | The `options` schema and its mapping onto the engine.            |
| `components/`   | The MUI presentation layer — grid, toolbar, field list, dialogs. |
| `hooks/`        | `usePivotMatrix` and friends.                                    |
| `localization/` | Dictionary types, the merge helper, and the shipped JSON files.  |
| `scripts/`      | Build tooling. Plain JS on purpose.                              |

Keep the boundary between `pivot-core/` and the React layer clean: the engine
is framework-agnostic by design, and the React layer talks to it through
methods and its event bus rather than reaching into its state.

## Releasing (maintainers)

Merging to `master` opens a version pull request. Merging _that_ publishes to
npm with provenance, using the `NPM_TOKEN` repository secret — which must be an
npm _automation_ token; a granular token does not work with provenance. Nothing
publishes from a local machine.

`npm version` is not used in this repository: the `version` npm script is
registered as npm's own `version` lifecycle hook and runs `changeset version`
instead, so `npm version patch` silently does the wrong thing. Use
`npx changeset` and let the release workflow handle version bumps.
