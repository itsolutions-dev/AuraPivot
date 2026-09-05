# Contributing

## The thing that trips everyone up first

This repository has no dev server of its own. The way you see a change is
through the playground, which lives in the **parent** repository and
resolves `aura-pivot` through a Vite alias pointing at this repository's
directory on disk — by path, not by package name. This repository must be
checked out as a child of the playground repository's directory, in a
directory literally named `Library`:

```
AuraPivotApp/          ← the playground and docs repository
  PresentationApp/
  Library/             ← this repository, cloned or symlinked here
```

The directory name `Library` is load-bearing.
`PresentationApp/vite.config.js` resolves `aura-pivot`, `aura-pivot/theme`
and `aura-pivot/locales/*` by path:

```js
const repoRoot = path.resolve(__dirname, "..");
const libRoot = path.resolve(repoRoot, "Library");
const libEntry = path.resolve(libRoot, "AuraPivot.tsx");
```

`__dirname` there is `AuraPivotApp/PresentationApp`, so a clone sitting
anywhere else — including a sibling directory, or a child directory named
anything but `Library` — will not resolve, no matter what `package.json`
says.

If the playground reports that it cannot resolve `aura-pivot`, check that
layout first.

## Setup

```bash
git clone https://github.com/itsolutions-dev/AuraPivot.git Library
cd Library
npm install
```

**Node 20 or later** is required for development. The `engines` field says
`>=18` because that is what the _published package_ needs at runtime; the
build itself uses the `with { type: "json" }` import attribute, which Node
18 does not support. Installing on 18 works. Building on 18 does not.

## Seeing your change

```bash
cd ../PresentationApp
npm run dev     # http://localhost:8080
```

The playground reads the library source directly, so a save reloads the
page. There is no build step in the loop.

## Before you open a pull request

```bash
npm run check          # tsc --noEmit
npm run lint
npm run format
npm test
npm run build           # includes the dist assertions
npm run size
```

CI runs all of these plus a React 18 / React 19 matrix. The peer range is
`>=18`, so a React 19-only API is a bug even if your editor does not flag it.

## Tests

New code arrives with tests. Coverage thresholds in `vitest.config.ts` are a
ratchet — they are set to what is covered today and only ever go up, so a
change that lowers coverage fails CI rather than passing quietly.

The engine (`pivot-core/`) is pure and framework-agnostic; test it directly
with plain unit tests, not through a rendered component. Reach for
`@testing-library/react` only for behaviour that genuinely needs the DOM.

The virtualized grid renders nothing under a headless DOM unless it is
wrapped in `VirtuosoMockContext` with an explicit viewport height — see
`AuraPivot.grid-controls.test.tsx` for the pattern.

## Changesets

Every change a consumer could notice needs one:

```bash
npx changeset
```

Pick the bump, write a sentence a user of the library would understand.
Releases are cut automatically from these, so a missing changeset means
your fix ships without a version and without a changelog entry.

Internal-only changes — CI, tests, docs — do not need one.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
`test:`, `build:`, `ci:`). The body should say why, not what — the diff
already says what.

## Style

2-space indent, semicolons. Single quotes in `.ts` and `.tsx`, double quotes
in `.js`, `.jsx` and `.mjs`. Prettier enforces this; `npm run format` before
committing saves a CI round trip.

Do not add `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. The repository
has none, and that is worth keeping.

## Releasing (maintainers)

Merging to `master` opens a version pull request. Merging _that_ publishes to
npm with provenance, using the `NPM_TOKEN` repository secret — which must be
an npm _automation_ token; a granular token does not work with provenance.
Nothing publishes from a local machine.

`npm version` is not used in this repository: the `version` npm script is
registered as npm's own `version` lifecycle hook and runs `changeset version`
instead, so `npm version patch` silently does the wrong thing. Use
`npx changeset` and let the release workflow handle version bumps.
