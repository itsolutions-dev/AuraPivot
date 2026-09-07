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
npm, using the `NPM_TOKEN` repository secret. Nothing publishes from a local
machine.

`NPM_TOKEN` must be a **granular access token** with read _and write_
permission, created at
[npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens) with
_Bypass 2FA_ enabled so a runner can use it. Classic and automation tokens are
not an option: npm revoked every one of them on 9 December 2025 and no longer
lets them be created. npm caps a write-capable granular token at 90 days, so
the secret has to be rotated on that cycle.

Until `aura-pivot` exists on the registry, that token has to be scoped to
**all packages**, not to selected ones — a package you have not published yet
cannot appear in the selected-packages list, so a restricted token has no
authority over the name and the publish fails. It can be narrowed to just
`aura-pivot` after the first release.

Two failure modes worth recognising, because neither says what it means:

- `E404 Not Found - PUT https://registry.npmjs.org/aura-pivot` — the token
  authenticated but is not allowed to write this name. npm answers an
  unauthorised write with 404 instead of 403 so as not to confirm whether the
  name exists, so this reads like a missing package rather than a permission
  problem. Usually the selected-packages scope above, or a read-only token, or
  the wrong npm account. The preflight step prints which account the token
  belongs to, which settles the last of those.
- `E401` — the token is invalid or has passed its 90-day expiry. Nothing in
  this repository is wrong; rotate the secret.

### Provenance

npm accepts provenance attestations only from public source repositories, and
answers a private one with `422 Only public source repositories are supported
when publishing with provenance`. The release workflow therefore derives
`NPM_CONFIG_PROVENANCE` from the repository's visibility rather than pinning
it: this repository is public, so releases carry attestations, and they would
degrade to unattested publishes rather than failing if it ever went private.

Do not move that flag into `publishConfig`. `package.json` wins over env and
CLI config at publish time, so a value pinned there cannot be turned off from
the workflow — which is exactly how the first publish attempt was set up to
fail, back when this repository was private.

### Retiring the token (after the first publish)

Trusted publishing (OIDC) removes the token and its 90-day rotation entirely,
and generates provenance on its own without a `--provenance` flag. What it
cannot do is create a package: a trusted publisher is registered from a
package's settings page, so a name that does not exist yet has nowhere to
register one ([npm/cli#8544](https://github.com/npm/cli/issues/8544)). That is
why the first release of `aura-pivot` needs `NPM_TOKEN` at all.

Once it has been published once, register this repository at
`npmjs.com/package/aura-pivot/access` — organization `itsolutions-dev`,
repository `AuraPivot`, workflow filename `release.yml` — and delete the
`NPM_TOKEN` secret. The workflow already prefers the token when it is present
and falls back to OIDC when it is not, so the switch is a matter of removing
the secret. Two conditions the setup depends on: GitHub-hosted runners only,
and `repository.url` in `package.json` has to keep matching this repository
exactly.

The workflow checks credentials before it builds and fails with the reason,
rather than spending a couple of minutes on a build and then exiting on
`ENEEDAUTH`.

`npm version` is not used in this repository: the `version` npm script is
registered as npm's own `version` lifecycle hook and runs `changeset version`
instead, so `npm version patch` silently does the wrong thing. Use
`npx changeset` and let the release workflow handle version bumps.
